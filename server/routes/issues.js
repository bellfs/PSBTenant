const express = require('express');
const { getDb } = require('../database');
const { authenticate } = require('../middleware/auth');
const { sendStaffResponse } = require('../services/whatsapp');

const router = express.Router();

// Get all issues with filters
router.get('/', authenticate, (req, res) => {
  const { status, priority, property_id, search, page = 1, limit = 20 } = req.query;
  const db = getDb();

  try {
    let where = ['1=1'];
    let params = [];

    if (status && status !== 'all') {
      where.push('i.status = ?');
      params.push(status);
    }
    if (priority && priority !== 'all') {
      where.push('i.priority = ?');
      params.push(priority);
    }
    if (property_id && property_id !== 'all') {
      where.push('i.property_id = ?');
      params.push(property_id);
    }
    if (search) {
      where.push('(i.title LIKE ? OR i.description LIKE ? OR t.name LIKE ? OR i.uuid LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const countQuery = `
      SELECT COUNT(*) as total 
      FROM issues i 
      LEFT JOIN tenants t ON i.tenant_id = t.id
      WHERE ${where.join(' AND ')}
    `;
    const { total } = db.prepare(countQuery).get(...params);

    const query = `
      SELECT i.*, 
        t.name as tenant_name, t.phone as tenant_phone, t.flat_number as tenant_flat,
        p.name as property_name, p.address as property_address,
        (SELECT COUNT(*) FROM messages WHERE issue_id = i.id) as message_count,
        (SELECT COUNT(*) FROM attachments WHERE issue_id = i.id) as photo_count,
        (SELECT content FROM messages WHERE issue_id = i.id ORDER BY created_at DESC LIMIT 1) as last_message
      FROM issues i
      LEFT JOIN tenants t ON i.tenant_id = t.id
      LEFT JOIN properties p ON i.property_id = p.id
      WHERE ${where.join(' AND ')}
      ORDER BY 
        CASE i.priority 
          WHEN 'urgent' THEN 0 
          WHEN 'high' THEN 1 
          WHEN 'medium' THEN 2 
          WHEN 'low' THEN 3 
        END,
        i.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const issues = db.prepare(query).all(...params, parseInt(limit), offset);

    res.json({
      issues,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } finally {
    db.close();
  }
});

// Get issue stats/dashboard summary
router.get('/stats', authenticate, (req, res) => {
  const db = getDb();
  try {
    const stats = {
      total: db.prepare('SELECT COUNT(*) as count FROM issues').get().count,
      open: db.prepare("SELECT COUNT(*) as count FROM issues WHERE status = 'open'").get().count,
      in_progress: db.prepare("SELECT COUNT(*) as count FROM issues WHERE status = 'in_progress'").get().count,
      escalated: db.prepare("SELECT COUNT(*) as count FROM issues WHERE status = 'escalated'").get().count,
      resolved: db.prepare("SELECT COUNT(*) as count FROM issues WHERE status = 'resolved'").get().count,
      urgent: db.prepare("SELECT COUNT(*) as count FROM issues WHERE priority = 'urgent' AND status NOT IN ('resolved','closed')").get().count,
      today: db.prepare("SELECT COUNT(*) as count FROM issues WHERE date(created_at) = date('now')").get().count,
      this_week: db.prepare("SELECT COUNT(*) as count FROM issues WHERE created_at >= datetime('now', '-7 days')").get().count,
      by_category: db.prepare(`
        SELECT category, COUNT(*) as count 
        FROM issues 
        WHERE status NOT IN ('resolved','closed') AND category IS NOT NULL
        GROUP BY category ORDER BY count DESC
      `).all(),
      by_property: db.prepare(`
        SELECT p.name, COUNT(*) as count 
        FROM issues i 
        LEFT JOIN properties p ON i.property_id = p.id 
        WHERE i.status NOT IN ('resolved','closed')
        GROUP BY p.name ORDER BY count DESC
      `).all(),
      recent_escalations: db.prepare(`
        SELECT i.*, t.name as tenant_name, p.name as property_name
        FROM issues i
        LEFT JOIN tenants t ON i.tenant_id = t.id
        LEFT JOIN properties p ON i.property_id = p.id
        WHERE i.status = 'escalated'
        ORDER BY i.escalated_at DESC LIMIT 5
      `).all()
    };
    res.json(stats);
  } finally {
    db.close();
  }
});

// Get single issue with full details
router.get('/:id', authenticate, (req, res) => {
  const db = getDb();
  try {
    const issue = db.prepare(`
      SELECT i.*, 
        t.name as tenant_name, t.phone as tenant_phone, t.email as tenant_email, t.flat_number as tenant_flat,
        p.name as property_name, p.address as property_address
      FROM issues i
      LEFT JOIN tenants t ON i.tenant_id = t.id
      LEFT JOIN properties p ON i.property_id = p.id
      WHERE i.id = ?
    `).get(req.params.id);

    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    const messages = db.prepare('SELECT * FROM messages WHERE issue_id = ? ORDER BY created_at ASC').all(req.params.id);
    const attachments = db.prepare('SELECT * FROM attachments WHERE issue_id = ?').all(req.params.id);
    const activity = db.prepare('SELECT * FROM activity_log WHERE issue_id = ? ORDER BY created_at DESC').all(req.params.id);

    res.json({ issue, messages, attachments, activity });
  } finally {
    db.close();
  }
});

// Update issue status/priority
router.put('/:id', authenticate, (req, res) => {
  const { status, priority, category, title } = req.body;
  const db = getDb();
  try {
    const updates = [];
    const params = [];

    if (status) { updates.push('status = ?'); params.push(status); }
    if (priority) { updates.push('priority = ?'); params.push(priority); }
    if (category) { updates.push('category = ?'); params.push(category); }
    if (title) { updates.push('title = ?'); params.push(title); }

    if (status === 'resolved') updates.push('resolved_at = CURRENT_TIMESTAMP');

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.params.id);

    db.prepare(`UPDATE issues SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    db.prepare('INSERT INTO activity_log (issue_id, action, details, performed_by) VALUES (?, ?, ?, ?)').run(
      req.params.id, 'updated', JSON.stringify(req.body), req.user.name
    );

    res.json({ success: true });
  } finally {
    db.close();
  }
});

// Send manual staff response
router.post('/:id/respond', authenticate, async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });

  try {
    const result = await sendStaffResponse(parseInt(req.params.id), req.user.name, message);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
