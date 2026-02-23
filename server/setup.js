#!/usr/bin/env node

/**
 * PSB Maintenance Hub - Setup Script
 * Run: node server/setup.js
 * This will initialise the database, create default admin, and seed properties.
 */

require('dotenv').config();
const { initialiseDatabase } = require('./database');
const fs = require('fs');
const path = require('path');

console.log('\n  PSB Maintenance Hub - Setup\n');
console.log('  Initialising database...');

// Ensure data and uploads directories exist
const dirs = [
  path.join(__dirname, 'data'),
  path.join(__dirname, 'uploads')
];

for (const dir of dirs) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`  Created directory: ${dir}`);
  }
}

// Check for .env
if (!fs.existsSync(path.join(__dirname, '..', '.env'))) {
  const example = path.join(__dirname, '..', '.env.example');
  const target = path.join(__dirname, '..', '.env');
  if (fs.existsSync(example)) {
    fs.copyFileSync(example, target);
    console.log('  Created .env from .env.example - please update with your values');
  }
}

// Initialise database
initialiseDatabase().then(() => {
  console.log('\n  Setup complete!\n');
  console.log('  Next steps:');
  console.log('  1. Edit .env with your API keys and credentials');
  console.log('  2. Run: npm run dev');
  console.log('  3. Open: http://localhost:5173');
  console.log('  4. Login with: admin@52oldelvet.com / changeme123\n');
});
