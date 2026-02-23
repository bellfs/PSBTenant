const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../database');
const { authenticate, requireAdmin, generateToken } = require('../middleware/auth');

const router = express.Router();

// Login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const db = getDb();
  try {
    const user = db.prepare('SELECT * FROM staff WHERE email = ? AND active = 1').get(email);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    db.prepare('UPDATE staff SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

    const token = generateToken(user);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } finally {
    db.close();
  }
});

// Get current user
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// Create staff user (admin only)
router.post('/staff', authenticate, requireAdmin, (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password required' });

  const db = getDb();
  try {
    const existing = db.prepare('SELECT id FROM staff WHERE email = ?').get(email);
    if (existing) return res.status(409).json({ error: 'Email already exists' });

    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO staff (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(
      name, email, hash, role || 'maintenance'
    );
    res.json({ id: result.lastInsertRowid, name, email, role: role || 'maintenance' });
  } finally {
    db.close();
  }
});

// List staff (admin only)
router.get('/staff', authenticate, requireAdmin, (req, res) => {
  const db = getDb();
  try {
    const staff = db.prepare('SELECT id, name, email, role, active, last_login, created_at FROM staff').all();
    res.json(staff);
  } finally {
    db.close();
  }
});

// Change password
router.put('/password', authenticate, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const db = getDb();
  try {
    const user = db.prepare('SELECT * FROM staff WHERE id = ?').get(req.user.id);
    if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(401).json({ error: 'Current password incorrect' });
    }
    const hash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE staff SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
    res.json({ success: true });
  } finally {
    db.close();
  }
});

module.exports = router;
