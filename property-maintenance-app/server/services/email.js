const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

async function sendEscalationEmail({ issue, tenant, property, messages, attachments, reason }) {
  const transporter = getTransporter();

  // Build conversation log
  let conversationHtml = '';
  for (const msg of messages) {
    const sender = msg.sender === 'tenant' ? tenant.name : msg.sender === 'bot' ? 'AI Assistant' : 'Staff';
    const time = new Date(msg.created_at).toLocaleString('en-GB');
    const bgColor = msg.sender === 'tenant' ? '#E8F5E9' : msg.sender === 'bot' ? '#E3F2FD' : '#FFF3E0';
    conversationHtml += `
      <div style="margin: 8px 0; padding: 12px; background: ${bgColor}; border-radius: 8px; font-family: sans-serif;">
        <strong>${sender}</strong> <span style="color: #666; font-size: 12px;">${time}</span>
        <p style="margin: 4px 0 0 0;">${msg.content || '[media]'}</p>
      </div>`;
  }

  // Prepare attachments for email
  const emailAttachments = [];
  for (const att of attachments) {
    const fullPath = path.join(__dirname, '..', att.file_path);
    if (fs.existsSync(fullPath)) {
      emailAttachments.push({
        filename: att.original_name || path.basename(att.file_path),
        path: fullPath
      });
    }
  }

  const priorityColors = {
    low: '#4CAF50',
    medium: '#FF9800',
    high: '#F44336',
    urgent: '#B71C1C'
  };

  const html = `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 680px; margin: 0 auto;">
      <div style="background: #1a1a2e; color: white; padding: 24px 32px; border-radius: 12px 12px 0 0;">
        <h1 style="margin: 0; font-size: 20px; font-weight: 500;">🔧 Maintenance Issue Escalated</h1>
        <p style="margin: 4px 0 0 0; opacity: 0.7; font-size: 14px;">Ref: ${issue.uuid} | ${reason}</p>
      </div>
      
      <div style="background: #f8f9fa; padding: 24px 32px; border: 1px solid #e0e0e0;">
        <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #666; width: 140px;">Tenant</td>
            <td style="padding: 8px 0; font-weight: 600;">${tenant.name}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;">Phone</td>
            <td style="padding: 8px 0;">${tenant.phone}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;">Property</td>
            <td style="padding: 8px 0;">${property?.name || 'Unknown'} ${property?.address ? '(' + property.address + ')' : ''}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;">Flat</td>
            <td style="padding: 8px 0;">${issue.flat_number || tenant.flat_number || 'Not specified'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;">Category</td>
            <td style="padding: 8px 0;">${issue.category || 'Uncategorised'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;">Priority</td>
            <td style="padding: 8px 0;">
              <span style="background: ${priorityColors[issue.priority] || '#FF9800'}; color: white; padding: 2px 10px; border-radius: 12px; font-size: 12px; text-transform: uppercase;">
                ${issue.priority || 'medium'}
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;">AI Diagnosis</td>
            <td style="padding: 8px 0;">${issue.ai_diagnosis || 'No diagnosis available'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;">Reported</td>
            <td style="padding: 8px 0;">${new Date(issue.created_at).toLocaleString('en-GB')}</td>
          </tr>
        </table>
      </div>
      
      <div style="padding: 24px 32px; border: 1px solid #e0e0e0; border-top: none;">
        <h3 style="margin: 0 0 16px 0; font-size: 16px;">Conversation Log</h3>
        ${conversationHtml}
      </div>
      
      ${attachments.length > 0 ? `
        <div style="padding: 24px 32px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 12px 12px;">
          <h3 style="margin: 0 0 8px 0; font-size: 16px;">📎 ${attachments.length} Photo(s) Attached</h3>
          <p style="color: #666; font-size: 13px; margin: 0;">Photos from the tenant are attached to this email.</p>
        </div>
      ` : ''}
      
      <div style="padding: 16px 32px; text-align: center; color: #999; font-size: 12px;">
        PSB Properties Maintenance Hub | Automated Escalation
      </div>
    </div>`;

  const mailOptions = {
    from: `"PSB Maintenance Hub" <${process.env.SMTP_USER}>`,
    to: process.env.ESCALATION_EMAIL || 'admin@52oldelvet.com',
    subject: `[${issue.priority?.toUpperCase() || 'MEDIUM'}] Maintenance Issue ${issue.uuid} - ${issue.title || 'New Issue'} - ${property?.name || 'Property'}`,
    html: html,
    attachments: emailAttachments
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('[Email] Escalation email sent for issue', issue.uuid);
  } catch (err) {
    console.error('[Email] Failed to send:', err.message);
    // Don't throw - email failure shouldn't break the flow
  }
}

module.exports = { sendEscalationEmail };
