const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../database');
const { authenticate, requireAdmin, generateToken } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const db = getDb();
  try {
    const user = db.prepare('SELECT * FROM staff WHERE email = ? AND active = 1').get(email);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
    db.prepare('UPDATE staff SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
    res.json({ token: generateToken(user), user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } finally { db.close(); }
});

router.get('/me', authenticate, (req, res) => { res.json({ user: req.user }); });

router.post('/staff', authenticate, requireAdmin, (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password required' });
  const db = getDb();
  try {
    if (db.prepare('SELECT id FROM staff WHERE email = ?').get(email)) return res.status(409).json({ error: 'Email already exists' });
    const result = db.prepare('INSERT INTO staff (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(name, email, bcrypt.hashSync(password, 10), role || 'maintenance');
    res.json({ id: result.lastInsertRowid, name, email, role: role || 'maintenance' });
  } finally { db.close(); }
});

router.get('/staff', authenticate, requireAdmin, (req, res) => {
  const db = getDb();
  try { res.json(db.prepare('SELECT id, name, email, role, active, last_login, created_at FROM staff').all()); } finally { db.close(); }
});

router.put('/password', authenticate, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const db = getDb();
  try {
    const user = db.prepare('SELECT * FROM staff WHERE id = ?').get(req.user.id);
    if (!bcrypt.compareSync(currentPassword, user.password_hash)) return res.status(401).json({ error: 'Current password incorrect' });
    db.prepare('UPDATE staff SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), req.user.id);
    res.json({ success: true });
  } finally { db.close(); }
});

module.exports = router;
