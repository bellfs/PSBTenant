const axios = require('axios');
const { getDb } = require('../database');
const { v4: uuidv4 } = require('uuid');
const { callLLM, analyseImage, estimateCosts } = require('./llm');
const { sendEscalationEmail } = require('./email');
const fs = require('fs');
const path = require('path');

const GRAPH_API_URL = 'https://graph.facebook.com/v18.0';

const OLD_ELVET_APARTMENTS = [
  'The Villiers','The Barrington','The Egerton','The Wolsey','The Tunstall','The Montague',
  'The Morton','The Gray','The Langley','The Kirkham','The Fordham','The Talbot Penthouse'
];

async function sendWhatsAppMessage(to, text) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    console.log('[WhatsApp] Not configured - would send to', to);
    return { success: true, simulated: true };
  }
  try {
    const r = await axios.post(`${GRAPH_API_URL}/${phoneNumberId}/messages`, {
      messaging_product: 'whatsapp', to, type: 'text', text: { body: text }
    }, { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' } });
    return { success: true, messageId: r.data.messages?.[0]?.id };
  } catch (err) {
    console.error('[WhatsApp] Send error:', err.response?.data || err.message);
    return { success: false, error: err.message };
  }
}

async function downloadWhatsAppMedia(mediaId) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  try {
    const urlR = await axios.get(`${GRAPH_API_URL}/${mediaId}`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    const mediaR = await axios.get(urlR.data.url, { headers: { 'Authorization': `Bearer ${accessToken}` }, responseType: 'arraybuffer' });
    return { data: Buffer.from(mediaR.data), mimeType: urlR.data.mime_type };
  } catch (err) { console.error('[WhatsApp] Media download error:', err.message); return null; }
}

async function processIncomingMessage(webhookData) {
  const db = getDb();
  try {
    const entry = webhookData.entry?.[0];
    const value = entry?.changes?.[0]?.value;
    if (!value?.messages?.[0]) return;

    const message = value.messages[0];
    const contact = value.contacts?.[0];
    const from = message.from;
    const displayName = contact?.profile?.name || 'Unknown';
    const messageType = message.type;
    const whatsappMessageId = message.id;

    console.log(`[WhatsApp] ${messageType} from ${from} (${displayName})`);

    let tenant = db.prepare('SELECT * FROM tenants WHERE phone = ? OR whatsapp_id = ?').get(from, from);
    if (!tenant) {
      tenant = onboardNewTenant(db, from, displayName);
      await sendWhatsAppMessage(from,
        `Hey there! 👋 Welcome to PSB Properties Maintenance Support!\n\nI'm your AI maintenance assistant and I'm here to help you sort out any property issues 🏠🔧\n\nTo get you set up, I just need:\n\n1️⃣ Your full name\n2️⃣ Which property you live at\n3️⃣ Your flat/room name or number\n\nJust pop those in a message and we'll get started! 😊`
      );
      return;
    }

    if (!tenant.property_id) {
      await handleOnboarding(db, tenant, message, from);
      return;
    }

    let activeIssue = db.prepare(
      "SELECT * FROM issues WHERE tenant_id = ? AND status NOT IN ('resolved','closed') ORDER BY created_at DESC LIMIT 1"
    ).get(tenant.id);

    let textContent = '';
    let imageData = null;

    if (messageType === 'text') {
      textContent = message.text?.body || '';
      if (textContent.toLowerCase().match(/\b(new issue|new problem|different issue|another problem|something else)\b/)) {
        activeIssue = null;
      }
    } else if (messageType === 'image') {
      const media = await downloadWhatsAppMedia(message.image.id);
      if (media) {
        const filename = `${uuidv4()}.jpg`;
        const filepath = path.join(__dirname, '..', 'uploads', filename);
        fs.writeFileSync(filepath, media.data);
        imageData = { path: `/uploads/${filename}`, base64: media.data.toString('base64'), mimeType: media.mimeType || 'image/jpeg' };
        textContent = message.image.caption || '[Photo sent]';
      }
    }

    if (!activeIssue) {
      const issueUuid = uuidv4().slice(0, 8).toUpperCase();
      const result = db.prepare(
        'INSERT INTO issues (uuid, tenant_id, property_id, flat_number, title, description, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(issueUuid, tenant.id, tenant.property_id, tenant.flat_number, 'New Issue Report', textContent, 'open');
      activeIssue = db.prepare('SELECT * FROM issues WHERE id = ?').get(result.lastInsertRowid);
      db.prepare('INSERT INTO activity_log (issue_id, action, details, performed_by) VALUES (?, ?, ?, ?)').run(activeIssue.id, 'created', 'Issue created from WhatsApp', 'system');
    }

    db.prepare('INSERT INTO messages (issue_id, sender, content, message_type, whatsapp_message_id) VALUES (?, ?, ?, ?, ?)').run(
      activeIssue.id, 'tenant', textContent, messageType === 'image' ? 'image' : 'text', whatsappMessageId
    );

    if (imageData) {
      const aR = db.prepare('INSERT INTO attachments (issue_id, message_id, file_path, file_type) VALUES (?, ?, ?, ?)').run(
        activeIssue.id, 0, imageData.path, imageData.mimeType
      );
      try {
        const analysis = await analyseImage(imageData.base64, imageData.mimeType, textContent);
        db.prepare('UPDATE attachments SET ai_analysis = ? WHERE id = ?').run(analysis, aR.lastInsertRowid);
        try {
          const parsed = JSON.parse(analysis.replace(/```json\n?/g, '').replace(/```\n?/g, ''));
          if (parsed.category) {
            db.prepare('UPDATE issues SET category = ?, ai_diagnosis = ?, priority = ?, estimated_cost = ?, estimated_hours = ? WHERE id = ?').run(
              parsed.category, parsed.likely_issue, parsed.severity || 'medium',
              parseFloat(parsed.estimated_cost_gbp?.split('-')?.[1]) || 0,
              parseFloat(parsed.estimated_hours?.split('-')?.[1]) || 0,
              activeIssue.id
            );
          }
          if (parsed.safety_concern) {
            await sendWhatsAppMessage(from, `🚨 I've spotted a safety concern in your photo! ${parsed.immediate_action || 'Please make sure you are safe first.'}\n\nI'm escalating this to our maintenance team right now. Stay safe! 🙏`);
            await escalateIssue(db, activeIssue, tenant, 'Safety concern from image');
            return;
          }
        } catch (e) {}
      } catch (err) { console.error('[AI] Image analysis error:', err.message); }
    }

    const conversationMessages = db.prepare('SELECT sender, content, message_type FROM messages WHERE issue_id = ? ORDER BY created_at ASC').all(activeIssue.id);
    const llmMessages = conversationMessages.map(m => ({ role: m.sender === 'tenant' ? 'user' : 'assistant', content: m.content || '[media]' }));
    const botAttempts = conversationMessages.filter(m => m.sender === 'bot').length;
    const threshold = parseInt(db.prepare('SELECT value FROM settings WHERE key = ?').get('escalation_threshold')?.value || '3');

    // Get property name for context
    const property = tenant.property_id ? db.prepare('SELECT name FROM properties WHERE id = ?').get(tenant.property_id) : null;

    if (botAttempts >= threshold) {
      const msg = `Hey ${tenant.name?.split(' ')[0] || 'there'} 👋\n\nI've had a good go at helping with this but I think it needs someone from our team to take a look in person 🔧\n\nI'm escalating this now!\n\n📋 Your reference: ${activeIssue.uuid}\n\nOur team will review everything and get back to you ASAP. If it's urgent, give the office a call! 📞`;
      await sendWhatsAppMessage(from, msg);
      db.prepare('INSERT INTO messages (issue_id, sender, content, message_type) VALUES (?, ?, ?, ?)').run(activeIssue.id, 'bot', msg, 'text');
      await escalateIssue(db, activeIssue, tenant);
      db.close();
      return;
    }

    // Build context with forum/YouTube instruction on later attempts
    let additionalContext = `\n\nCurrent issue context:
- Tenant: ${tenant.name} (student tenant)
- Property: ${property?.name || 'Unknown'} 
- Flat: ${tenant.flat_number || 'Not specified'}
- Issue ref: ${activeIssue.uuid}
- Category: ${activeIssue.category || 'Not yet determined'}
- AI diagnosis: ${activeIssue.ai_diagnosis || 'Pending'}
- Bot attempt: ${botAttempts + 1} of ${threshold}`;

    if (botAttempts >= 1) {
      additionalContext += `\n\nIMPORTANT: This is attempt ${botAttempts + 1}. The previous suggestion didn't resolve it.
- Search for common forum threads and Reddit posts about this exact issue
- Suggest alternative fixes that other renters have found work
- Include a specific YouTube search query: "🎥 Try searching YouTube for: [specific query]"
- Include a forum tip: "💬 Common fix from renters online: [specific tip]"
- If this seems beyond DIY, be honest about it`;
    }

    additionalContext += `\n\nALWAYS include in your response:
- A YouTube search suggestion (🎥 Search YouTube for: ...)
- An estimated cost for any materials (💰 Estimated cost: £X-£Y)
- An estimated time to fix (⏱️ About X-Y minutes/hours)
- Use emojis throughout and keep it friendly for students!`;

    try {
      const aiResponse = await callLLM(llmMessages, { additionalContext });
      db.prepare('INSERT INTO messages (issue_id, sender, content, message_type) VALUES (?, ?, ?, ?)').run(activeIssue.id, 'bot', aiResponse, 'text');

      // Update title if generic
      if (activeIssue.title === 'New Issue Report' && textContent) {
        try {
          const title = await callLLM([{ role: 'user', content: `Summarise this maintenance issue in 5-8 words for a title: "${textContent}"` }], { maxTokens: 50 });
          db.prepare('UPDATE issues SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(title.replace(/"/g, '').trim(), activeIssue.id);
        } catch (e) {}
      }

      // Run cost estimation in background
      if (botAttempts === 0 && textContent) {
        try {
          const costs = await estimateCosts(textContent, activeIssue.category);
          if (costs) {
            const avgCost = ((costs.estimated_cost_min || 0) + (costs.estimated_cost_max || 0)) / 2;
            const avgHours = ((costs.estimated_hours_min || 0) + (costs.estimated_hours_max || 0)) / 2;
            db.prepare('UPDATE issues SET estimated_cost = ?, estimated_hours = ?, estimated_materials = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
              avgCost, avgHours, JSON.stringify(costs.materials || []), activeIssue.id
            );
          }
        } catch (e) { console.error('[LLM] Cost estimation failed:', e.message); }
      }

      await sendWhatsAppMessage(from, aiResponse);
    } catch (err) {
      console.error('[AI] Response error:', err.message);
      await sendWhatsAppMessage(from, `Oops! 😅 I'm having a bit of trouble processing that right now. Your issue has been logged and our team will be in touch.\n\n📋 Reference: ${activeIssue.uuid}`);
      await escalateIssue(db, activeIssue, tenant, 'AI service error');
    }
  } catch (err) {
    console.error('[WhatsApp] Processing error:', err);
  } finally {
    db.close();
  }
}

function onboardNewTenant(db, phone, displayName) {
  const result = db.prepare('INSERT INTO tenants (name, phone, whatsapp_id) VALUES (?, ?, ?)').run(displayName || 'New Tenant', phone, phone);
  return db.prepare('SELECT * FROM tenants WHERE id = ?').get(result.lastInsertRowid);
}

async function handleOnboarding(db, tenant, message, from) {
  if (message.type !== 'text') {
    await sendWhatsAppMessage(from, 'Thanks! But first I need a few details 😊 Could you tell me your name, which property you live at, and your flat/room?');
    return;
  }
  const text = message.text?.body || '';

  try {
    const extractPrompt = `Extract tenant registration details from this message.

Our properties in Durham:
- 52 Old Elvet (apartments: ${OLD_ELVET_APARTMENTS.join(', ')})
- 33 Old Elvet, Flass Court 2A, Flass Court 2B, Flass Court Lower, Flass House Upper, Flass House Lower
- Claypath Flat 1, Claypath Flat 2, Claypath Flat 3, Claypath Flat 4
- 35 St Andrews Court, 7 Cathedrals, 2 St Margarets Mews, 24 Hallgarth Street

RULES:
- Accept whatever name they give
- Match property with fuzzy matching (e.g. "Old Elvet" = "52 Old Elvet", "Claypath" = Claypath Flat, "Hallgarth" = "24 Hallgarth Street")
- For 52 Old Elvet, match apartment names (e.g. "Egerton" = "The Egerton")

Message: "${text}"

Respond ONLY with JSON: {"name":"their name or null","property_name":"matched property or null","flat_number":"flat/apartment or null"}`;

    console.log('[Onboarding] Extracting from:', text);
    const result = await callLLM([{ role: 'user', content: extractPrompt }], { maxTokens: 200, additionalContext: '\nRespond ONLY with valid JSON.' });
    console.log('[Onboarding] LLM:', result);

    let cleaned = result.trim().replace(/```json\s*/g, '').replace(/```\s*/g, '');
    const s = cleaned.indexOf('{'), e = cleaned.lastIndexOf('}');
    if (s !== -1 && e !== -1) cleaned = cleaned.substring(s, e + 1);
    const parsed = JSON.parse(cleaned);

    if (parsed.name && parsed.name !== 'null') {
      db.prepare('UPDATE tenants SET name = ? WHERE id = ?').run(parsed.name, tenant.id);
    }

    if (parsed.property_name && parsed.property_name !== 'null') {
      let property = db.prepare('SELECT id, name FROM properties WHERE LOWER(name) = LOWER(?)').get(parsed.property_name);
      if (!property) property = db.prepare('SELECT id, name FROM properties WHERE LOWER(name) LIKE LOWER(?)').get(`%${parsed.property_name}%`);
      if (!property) {
        for (const word of parsed.property_name.toLowerCase().split(/\s+/)) {
          if (word.length > 3) { property = db.prepare('SELECT id, name FROM properties WHERE LOWER(name) LIKE LOWER(?)').get(`%${word}%`); if (property) break; }
        }
      }

      if (property) {
        const flat = (parsed.flat_number && parsed.flat_number !== 'null') ? parsed.flat_number : '';
        db.prepare('UPDATE tenants SET property_id = ?, flat_number = ? WHERE id = ?').run(property.id, flat, tenant.id);
        const name = parsed.name || tenant.name || '';
        await sendWhatsAppMessage(from,
          `Brilliant, thanks ${name}! 🎉\n\nI've got you registered at ${property.name}${flat ? ', ' + flat : ''}.\n\nYou can now report any maintenance issues to me! Just describe the problem (photos help loads 📸) and I'll help you troubleshoot or get our team on it 🔧\n\nWhat can I help with? 😊`
        );
        return;
      }
    }

    if (parsed.name && parsed.name !== 'null') {
      await sendWhatsAppMessage(from,
        `Thanks ${parsed.name}! 😊 I couldn't quite match your property. Which of these do you live at?\n\n🏠 52 Old Elvet\n🏠 33 Old Elvet\n🏠 Flass Court 2A/2B\n🏠 Flass House Upper/Lower\n🏠 Claypath Flat 1/2/3/4\n🏠 35 St Andrews Court\n🏠 7 Cathedrals\n🏠 2 St Margarets Mews\n🏠 24 Hallgarth Street\n\nAnd your flat/room name or number? 🏡`
      );
    } else {
      await sendWhatsAppMessage(from, `No worries! 😊 Could you tell me:\n\n1️⃣ Your full name\n2️⃣ Which property you live at\n3️⃣ Your flat or room name/number`);
    }
  } catch (err) {
    console.error('[Onboarding] Error:', err.message);
    try {
      const lines = text.split('\n').map(l => l.replace(/^\d+[\.\)]\s*/, '').trim()).filter(Boolean);
      if (lines.length >= 2) {
        db.prepare('UPDATE tenants SET name = ? WHERE id = ?').run(lines[0], tenant.id);
        await sendWhatsAppMessage(from, `Thanks ${lines[0]}! 😊 Could you tell me which property you live at? e.g. "52 Old Elvet, The Egerton"`);
        return;
      }
    } catch (e) {}
    await sendWhatsAppMessage(from, 'Sorry, had a little trouble! 😅 Could you tell me:\n\n1️⃣ Your full name\n2️⃣ Which property you live at\n3️⃣ Your flat/room name or number');
  }
}

async function escalateIssue(db, issue, tenant, reason = 'Exceeded AI triage attempts') {
  db.prepare("UPDATE issues SET status = 'escalated', escalated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(issue.id);
  db.prepare('INSERT INTO activity_log (issue_id, action, details, performed_by) VALUES (?, ?, ?, ?)').run(issue.id, 'escalated', reason, 'system');
  const messages = db.prepare('SELECT * FROM messages WHERE issue_id = ? ORDER BY created_at ASC').all(issue.id);
  const attachments = db.prepare('SELECT * FROM attachments WHERE issue_id = ?').all(issue.id);
  const property = issue.property_id ? db.prepare('SELECT * FROM properties WHERE id = ?').get(issue.property_id) : null;
  try { await sendEscalationEmail({ issue, tenant, property, messages, attachments, reason }); } catch (err) { console.error('[Email] Failed:', err.message); }
}

async function sendStaffResponse(issueId, staffName, responseText) {
  const db = getDb();
  try {
    const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(issueId);
    if (!issue) throw new Error('Issue not found');
    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(issue.tenant_id);
    if (!tenant) throw new Error('Tenant not found');
    db.prepare('INSERT INTO messages (issue_id, sender, content, message_type) VALUES (?, ?, ?, ?)').run(issueId, 'staff', responseText, 'text');
    db.prepare('INSERT INTO activity_log (issue_id, action, details, performed_by) VALUES (?, ?, ?, ?)').run(issueId, 'staff_response', 'Manual response', staffName);
    await sendWhatsAppMessage(tenant.phone, `*PSB Properties Team (${staffName}):*\n\n${responseText}`);
    return { success: true };
  } finally { db.close(); }
}

module.exports = { processIncomingMessage, sendWhatsAppMessage, sendStaffResponse, downloadWhatsAppMedia };
