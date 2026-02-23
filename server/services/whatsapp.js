const axios = require('axios');
const { getDb } = require('../database');
const { v4: uuidv4 } = require('uuid');
const { callLLM, analyseImage, searchForFixes } = require('./llm');
const { sendEscalationEmail } = require('./email');
const fs = require('fs');
const path = require('path');

const GRAPH_API_URL = 'https://graph.facebook.com/v18.0';

// Send a WhatsApp text message
async function sendWhatsAppMessage(to, text) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    console.log('[WhatsApp] Not configured - message would be sent to', to, ':', text);
    return { success: true, simulated: true };
  }

  try {
    const response = await axios.post(
      `${GRAPH_API_URL}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { body: text }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return { success: true, messageId: response.data.messages?.[0]?.id };
  } catch (err) {
    console.error('[WhatsApp] Send error:', err.response?.data || err.message);
    return { success: false, error: err.message };
  }
}

// Download media from WhatsApp
async function downloadWhatsAppMedia(mediaId) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  try {
    // First get the media URL
    const urlResponse = await axios.get(`${GRAPH_API_URL}/${mediaId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    // Then download the actual file
    const mediaResponse = await axios.get(urlResponse.data.url, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      responseType: 'arraybuffer'
    });

    return {
      data: Buffer.from(mediaResponse.data),
      mimeType: urlResponse.data.mime_type
    };
  } catch (err) {
    console.error('[WhatsApp] Media download error:', err.message);
    return null;
  }
}

// Process incoming WhatsApp webhook message
async function processIncomingMessage(webhookData) {
  const db = getDb();

  try {
    const entry = webhookData.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value?.messages?.[0]) return; // Not a message event

    const message = value.messages[0];
    const contact = value.contacts?.[0];
    const from = message.from; // Phone number
    const displayName = contact?.profile?.name || 'Unknown';
    const messageType = message.type;
    const whatsappMessageId = message.id;

    console.log(`[WhatsApp] Incoming ${messageType} from ${from} (${displayName})`);

    // Find or start onboarding tenant
    let tenant = db.prepare('SELECT * FROM tenants WHERE phone = ? OR whatsapp_id = ?').get(from, from);

    if (!tenant) {
      // New tenant - start onboarding
      tenant = onboardNewTenant(db, from, displayName);
      await sendWhatsAppMessage(from,
        `Welcome to PSB Properties Maintenance Support! 👋\n\nI'm your AI maintenance assistant. I can help you report and fix issues with your property.\n\nTo get started, I need a few details:\n\n1. What is your full name?\n2. Which property do you live at?\n3. What is your flat/room number?\n\nPlease reply with these details and I'll get you set up.`
      );
      return;
    }

    // Check if tenant is fully registered (has property)
    if (!tenant.property_id) {
      await handleOnboarding(db, tenant, message, from);
      return;
    }

    // Find active issue or create new one
    let activeIssue = db.prepare(
      "SELECT * FROM issues WHERE tenant_id = ? AND status NOT IN ('resolved', 'closed') ORDER BY created_at DESC LIMIT 1"
    ).get(tenant.id);

    // Handle different message types
    let textContent = '';
    let imageData = null;

    if (messageType === 'text') {
      textContent = message.text?.body || '';

      // Check for "new issue" or "new problem" keywords
      if (textContent.toLowerCase().match(/\b(new issue|new problem|different issue|another problem|something else)\b/)) {
        activeIssue = null; // Force new issue creation
      }
    } else if (messageType === 'image') {
      const media = await downloadWhatsAppMedia(message.image.id);
      if (media) {
        const filename = `${uuidv4()}.jpg`;
        const filepath = path.join(__dirname, '..', 'uploads', filename);
        fs.writeFileSync(filepath, media.data);
        imageData = {
          path: `/uploads/${filename}`,
          base64: media.data.toString('base64'),
          mimeType: media.mimeType || 'image/jpeg'
        };
        textContent = message.image.caption || '[Photo sent]';
      }
    }

    if (!activeIssue) {
      // Create new issue
      const issueUuid = uuidv4().slice(0, 8).toUpperCase();
      const result = db.prepare(
        'INSERT INTO issues (uuid, tenant_id, property_id, flat_number, title, description, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(issueUuid, tenant.id, tenant.property_id, tenant.flat_number, 'New Issue Report', textContent, 'open');

      activeIssue = db.prepare('SELECT * FROM issues WHERE id = ?').get(result.lastInsertRowid);

      db.prepare('INSERT INTO activity_log (issue_id, action, details, performed_by) VALUES (?, ?, ?, ?)').run(
        activeIssue.id, 'created', 'Issue created from WhatsApp message', 'system'
      );
    }

    // Log tenant message
    const msgResult = db.prepare(
      'INSERT INTO messages (issue_id, sender, content, message_type, whatsapp_message_id) VALUES (?, ?, ?, ?, ?)'
    ).run(activeIssue.id, 'tenant', textContent, messageType === 'image' ? 'image' : 'text', whatsappMessageId);

    // Handle image analysis
    if (imageData) {
      const attachResult = db.prepare(
        'INSERT INTO attachments (issue_id, message_id, file_path, file_type) VALUES (?, ?, ?, ?)'
      ).run(activeIssue.id, msgResult.lastInsertRowid, imageData.path, imageData.mimeType);

      try {
        const analysis = await analyseImage(imageData.base64, imageData.mimeType, textContent);
        db.prepare('UPDATE attachments SET ai_analysis = ? WHERE id = ?').run(analysis, attachResult.lastInsertRowid);

        // Parse analysis and update issue
        try {
          const parsed = JSON.parse(analysis.replace(/```json\n?/g, '').replace(/```\n?/g, ''));
          if (parsed.category) {
            db.prepare('UPDATE issues SET category = ?, ai_diagnosis = ?, priority = ? WHERE id = ?').run(
              parsed.category, parsed.likely_issue, parsed.severity || 'medium', activeIssue.id
            );
          }

          if (parsed.safety_concern) {
            await sendWhatsAppMessage(from,
              `⚠️ I've identified a potential safety concern from your photo. ${parsed.immediate_action || 'Please ensure your safety first.'}\n\nI'm escalating this to our maintenance team immediately.`
            );
            await escalateIssue(db, activeIssue, tenant, 'Safety concern detected from image analysis');
            return;
          }
        } catch (e) {
          // Analysis wasn't valid JSON, continue with text-based triage
        }
      } catch (err) {
        console.error('[AI] Image analysis error:', err.message);
      }
    }

    // Build conversation history for LLM
    const conversationMessages = db.prepare(
      'SELECT sender, content, message_type FROM messages WHERE issue_id = ? ORDER BY created_at ASC'
    ).all(activeIssue.id);

    const llmMessages = conversationMessages.map(m => ({
      role: m.sender === 'tenant' ? 'user' : 'assistant',
      content: m.content || '[media]'
    }));

    // Count bot attempts for escalation threshold
    const botAttempts = conversationMessages.filter(m => m.sender === 'bot').length;
    const settings = db.prepare('SELECT value FROM settings WHERE key = ?').get('escalation_threshold');
    const threshold = parseInt(settings?.value || '3');

    if (botAttempts >= threshold) {
      // Escalate
      const escalationMsg = `I've tried to help with this issue but it seems to need professional attention. I'm now escalating this to our maintenance team.\n\nYour reference number is: ${activeIssue.uuid}\n\nOur team will review the details and get back to you as soon as possible. If it's urgent, please call our office directly.`;

      await sendWhatsAppMessage(from, escalationMsg);

      db.prepare('INSERT INTO messages (issue_id, sender, content, message_type) VALUES (?, ?, ?, ?)').run(
        activeIssue.id, 'bot', escalationMsg, 'text'
      );

      await escalateIssue(db, activeIssue, tenant);
      db.close();
      return;
    }

    // Get AI response
    let additionalContext = `\n\nCurrent issue context:
- Tenant: ${tenant.name}
- Property: (ID: ${tenant.property_id})
- Flat: ${tenant.flat_number || 'Not specified'}
- Issue reference: ${activeIssue.uuid}
- Category: ${activeIssue.category || 'Not yet determined'}
- AI diagnosis: ${activeIssue.ai_diagnosis || 'Pending'}
- Bot attempt number: ${botAttempts + 1} of ${threshold} before escalation`;

    try {
      const aiResponse = await callLLM(llmMessages, { additionalContext });

      // Save bot response
      db.prepare('INSERT INTO messages (issue_id, sender, content, message_type) VALUES (?, ?, ?, ?)').run(
        activeIssue.id, 'bot', aiResponse, 'text'
      );

      // Update issue title/category if still generic
      if (activeIssue.title === 'New Issue Report' && textContent) {
        const summaryPrompt = `Summarise this maintenance issue in 5-8 words for a title: "${textContent}"`;
        try {
          const title = await callLLM([{ role: 'user', content: summaryPrompt }], { maxTokens: 50 });
          db.prepare('UPDATE issues SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
            title.replace(/"/g, '').trim(), activeIssue.id
          );
        } catch (e) { /* Non-critical, skip */ }
      }

      // Send response to tenant
      await sendWhatsAppMessage(from, aiResponse);

    } catch (err) {
      console.error('[AI] Response error:', err.message);
      await sendWhatsAppMessage(from,
        'I apologise, I\'m having a bit of trouble processing your request at the moment. Your issue has been noted and our maintenance team will be in touch. Reference: ' + activeIssue.uuid
      );
      await escalateIssue(db, activeIssue, tenant, 'AI service error');
    }

  } catch (err) {
    console.error('[WhatsApp] Processing error:', err);
  } finally {
    db.close();
  }
}

function onboardNewTenant(db, phone, displayName) {
  const result = db.prepare(
    'INSERT INTO tenants (name, phone, whatsapp_id) VALUES (?, ?, ?)'
  ).run(displayName || 'New Tenant', phone, phone);

  return db.prepare('SELECT * FROM tenants WHERE id = ?').get(result.lastInsertRowid);
}

async function handleOnboarding(db, tenant, message, from) {
  if (message.type !== 'text') {
    await sendWhatsAppMessage(from, 'Thanks for that! But first, could you let me know your name, which property you live at, and your flat/room number?');
    return;
  }

  const text = message.text?.body || '';

  // Use LLM to extract details
  try {
    const extractPrompt = `Extract tenant details from this message. The properties we manage in Durham are:
1. 52 Old Elvet
2. 53 Old Elvet
3. Claypath House
4. Viaduct House
5. 24 Hallgarth Street
6. Albert Street

Message: "${text}"

Respond in JSON only:
{
  "name": "extracted name or null",
  "property_name": "matched property name or null",
  "flat_number": "flat/room number or null"
}`;

    const result = await callLLM([{ role: 'user', content: extractPrompt }], {
      maxTokens: 200,
      additionalContext: '\nRespond ONLY with valid JSON.'
    });

    const parsed = JSON.parse(result.replace(/```json\n?/g, '').replace(/```\n?/g, ''));

    if (parsed.name) {
      db.prepare('UPDATE tenants SET name = ? WHERE id = ?').run(parsed.name, tenant.id);
    }

    if (parsed.property_name) {
      const property = db.prepare('SELECT id FROM properties WHERE name LIKE ?').get(`%${parsed.property_name}%`);
      if (property) {
        db.prepare('UPDATE tenants SET property_id = ?, flat_number = ? WHERE id = ?').run(
          property.id, parsed.flat_number || '', tenant.id
        );
        await sendWhatsAppMessage(from,
          `Great, thanks ${parsed.name || ''}! I've got you registered at ${parsed.property_name}${parsed.flat_number ? ', Flat ' + parsed.flat_number : ''}.\n\nYou can now report any maintenance issues to me. Just describe the problem, send photos if you can, and I'll help you troubleshoot or escalate to our team.\n\nWhat can I help you with today?`
        );
        return;
      }
    }

    await sendWhatsAppMessage(from,
      `Thanks for that info. I couldn't quite match all the details. Could you confirm:\n\n1. Your full name\n2. Your property (e.g., "52 Old Elvet", "Claypath House")\n3. Your flat or room number`
    );
  } catch (err) {
    console.error('[Onboarding] Error:', err.message);
    await sendWhatsAppMessage(from,
      'Sorry, I had trouble understanding that. Could you please tell me:\n\n1. Your full name\n2. Which property you live at\n3. Your flat/room number'
    );
  }
}

async function escalateIssue(db, issue, tenant, reason = 'Exceeded AI triage attempts') {
  db.prepare("UPDATE issues SET status = 'escalated', escalated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(issue.id);

  db.prepare('INSERT INTO activity_log (issue_id, action, details, performed_by) VALUES (?, ?, ?, ?)').run(
    issue.id, 'escalated', reason, 'system'
  );

  // Gather all conversation and attachments
  const messages = db.prepare('SELECT * FROM messages WHERE issue_id = ? ORDER BY created_at ASC').all(issue.id);
  const attachments = db.prepare('SELECT * FROM attachments WHERE issue_id = ?').all(issue.id);
  const property = issue.property_id ? db.prepare('SELECT * FROM properties WHERE id = ?').get(issue.property_id) : null;

  // Send escalation email
  try {
    await sendEscalationEmail({
      issue,
      tenant,
      property,
      messages,
      attachments,
      reason
    });
  } catch (err) {
    console.error('[Email] Escalation email failed:', err.message);
  }
}

// Send a manual staff response via WhatsApp
async function sendStaffResponse(issueId, staffName, responseText) {
  const db = getDb();
  try {
    const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(issueId);
    if (!issue) throw new Error('Issue not found');

    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(issue.tenant_id);
    if (!tenant) throw new Error('Tenant not found');

    // Save message
    db.prepare('INSERT INTO messages (issue_id, sender, content, message_type) VALUES (?, ?, ?, ?)').run(
      issueId, 'staff', responseText, 'text'
    );

    db.prepare('INSERT INTO activity_log (issue_id, action, details, performed_by) VALUES (?, ?, ?, ?)').run(
      issueId, 'staff_response', 'Manual response sent', staffName
    );

    // Send via WhatsApp
    const prefixedResponse = `*PSB Properties Team:*\n\n${responseText}`;
    await sendWhatsAppMessage(tenant.phone, prefixedResponse);

    return { success: true };
  } finally {
    db.close();
  }
}

module.exports = { processIncomingMessage, sendWhatsAppMessage, sendStaffResponse, downloadWhatsAppMedia };
