const express = require('express');
const { getDb } = require('../database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { processIncomingMessage } = require('../services/whatsapp');

const router = express.Router();

// ===== PROPERTIES =====
router.get('/properties', authenticate, (req, res) => {
  const db = getDb();
  try {
    const properties = db.prepare(`
      SELECT p.*, 
        (SELECT COUNT(*) FROM tenants WHERE property_id = p.id) as tenant_count,
        (SELECT COUNT(*) FROM issues WHERE property_id = p.id AND status NOT IN ('resolved','closed')) as open_issues
      FROM properties p ORDER BY p.name
    `).all();
    res.json(properties);
  } finally {
    db.close();
  }
});

router.post('/properties', authenticate, requireAdmin, (req, res) => {
  const { name, address, postcode, num_units } = req.body;
  const db = getDb();
  try {
    const result = db.prepare('INSERT INTO properties (name, address, postcode, num_units) VALUES (?, ?, ?, ?)').run(
      name, address, postcode, num_units || 1
    );
    res.json({ id: result.lastInsertRowid });
  } finally {
    db.close();
  }
});

router.put('/properties/:id', authenticate, requireAdmin, (req, res) => {
  const { name, address, postcode, num_units } = req.body;
  const db = getDb();
  try {
    db.prepare('UPDATE properties SET name = ?, address = ?, postcode = ?, num_units = ? WHERE id = ?').run(
      name, address, postcode, num_units, req.params.id
    );
    res.json({ success: true });
  } finally {
    db.close();
  }
});

// ===== TENANTS =====
router.get('/tenants', authenticate, (req, res) => {
  const db = getDb();
  try {
    const tenants = db.prepare(`
      SELECT t.*, p.name as property_name,
        (SELECT COUNT(*) FROM issues WHERE tenant_id = t.id) as total_issues,
        (SELECT COUNT(*) FROM issues WHERE tenant_id = t.id AND status NOT IN ('resolved','closed')) as open_issues
      FROM tenants t
      LEFT JOIN properties p ON t.property_id = p.id
      ORDER BY t.name
    `).all();
    res.json(tenants);
  } finally {
    db.close();
  }
});

router.put('/tenants/:id', authenticate, (req, res) => {
  const { name, phone, email, property_id, flat_number } = req.body;
  const db = getDb();
  try {
    db.prepare('UPDATE tenants SET name = ?, phone = ?, email = ?, property_id = ?, flat_number = ? WHERE id = ?').run(
      name, phone, email, property_id, flat_number, req.params.id
    );
    res.json({ success: true });
  } finally {
    db.close();
  }
});

// ===== SETTINGS =====
router.get('/settings', authenticate, requireAdmin, (req, res) => {
  const db = getDb();
  try {
    const rows = db.prepare('SELECT * FROM settings').all();
    const settings = {};
    for (const row of rows) {
      // Mask API keys for security
      if (row.key.includes('api_key') && row.value) {
        settings[row.key] = row.value.slice(0, 8) + '...' + row.value.slice(-4);
        settings[row.key + '_set'] = true;
      } else {
        settings[row.key] = row.value;
      }
    }
    res.json(settings);
  } finally {
    db.close();
  }
});

router.put('/settings', authenticate, requireAdmin, (req, res) => {
  const db = getDb();
  try {
    const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
    for (const [key, value] of Object.entries(req.body)) {
      // Don't overwrite API keys with masked values
      if (key.includes('api_key') && typeof value === 'string' && value.includes('...')) continue;
      upsert.run(key, String(value));
    }
    res.json({ success: true });
  } finally {
    db.close();
  }
});

// ===== WHATSAPP WEBHOOK =====
// Verification endpoint (GET)
router.get('/webhook/whatsapp', (req, res) => {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'psb-maintenance-verify';
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[WhatsApp] Webhook verified');
    res.status(200).send(challenge);
  } else {
    res.status(403).send('Forbidden');
  }
});

// Incoming messages (POST)
router.post('/webhook/whatsapp', async (req, res) => {
  // Respond immediately to WhatsApp
  res.status(200).send('OK');

  // Process asynchronously
  try {
    await processIncomingMessage(req.body);
  } catch (err) {
    console.error('[Webhook] Error processing:', err);
  }
});

module.exports = router;
