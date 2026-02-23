require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initialiseDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;

// Ensure data and uploads directories exist
const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/issues', require('./routes/issues'));
app.use('/api', require('./routes/api'));

// Serve static client build in production
const clientBuild = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientBuild));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(clientBuild, 'index.html'));
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, async () => {
  await initialiseDatabase();
  console.log(`\n  ╔═══════════════════════════════════════════════╗`);
  console.log(`  ║  PSB Properties Maintenance Hub               ║`);
  console.log(`  ║  Server running on http://localhost:${PORT}      ║`);
  console.log(`  ║  WhatsApp webhook: /api/webhook/whatsapp       ║`);
  console.log(`  ╚═══════════════════════════════════════════════╝\n`);
});

module.exports = app;
