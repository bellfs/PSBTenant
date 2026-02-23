const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'data', 'maintenance.db');
let SQL = null;

async function initSQL() {
  if (!SQL) SQL = await initSqlJs();
  return SQL;
}

function saveDb(rawDb) {
  try {
    const data = rawDb.export();
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (err) {
    console.error('[DB] Save error:', err.message);
  }
}

/**
 * Returns a wrapper object around a sql.js database that provides
 * a better-sqlite3-compatible API: db.prepare(sql).run/get/all
 */
function getDb() {
  if (!SQL) throw new Error('SQL.js not initialised');

  let rawDb;
  if (fs.existsSync(DB_PATH)) {
    rawDb = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    rawDb = new SQL.Database();
  }

  const wrapper = {
    exec(sql) {
      rawDb.run(sql);
      saveDb(rawDb);
    },

    prepare(sql) {
      return {
        run(...params) {
          rawDb.run(sql, params);
          const res = rawDb.exec('SELECT last_insert_rowid() as lastInsertRowid');
          const lastId = res.length > 0 ? res[0].values[0][0] : 0;
          saveDb(rawDb);
          return { lastInsertRowid: lastId };
        },

        get(...params) {
          const stmt = rawDb.prepare(sql);
          try {
            if (params.length) stmt.bind(params);
            if (stmt.step()) return stmt.getAsObject();
            return undefined;
          } finally {
            stmt.free();
          }
        },

        all(...params) {
          const results = [];
          const stmt = rawDb.prepare(sql);
          try {
            if (params.length) stmt.bind(params);
            while (stmt.step()) results.push(stmt.getAsObject());
            return results;
          } finally {
            stmt.free();
          }
        }
      };
    },

    pragma() {},

    close() {
      saveDb(rawDb);
      rawDb.close();
    }
  };

  return wrapper;
}

async function initialiseDatabase() {
  await initSQL();
  const db = getDb();

  db.exec(`CREATE TABLE IF NOT EXISTS properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, address TEXT NOT NULL,
    postcode TEXT, num_units INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS tenants (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT UNIQUE NOT NULL,
    email TEXT, property_id INTEGER, flat_number TEXT, whatsapp_id TEXT,
    registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (property_id) REFERENCES properties(id)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT UNIQUE NOT NULL, tenant_id INTEGER NOT NULL,
    property_id INTEGER, flat_number TEXT, category TEXT, title TEXT NOT NULL, description TEXT,
    status TEXT DEFAULT 'open', priority TEXT DEFAULT 'medium', ai_diagnosis TEXT,
    ai_suggested_fixes TEXT, escalated_at DATETIME, resolved_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id), FOREIGN KEY (property_id) REFERENCES properties(id)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER NOT NULL, sender TEXT NOT NULL,
    content TEXT, message_type TEXT DEFAULT 'text', media_url TEXT, whatsapp_message_id TEXT,
    metadata TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (issue_id) REFERENCES issues(id)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER NOT NULL, message_id INTEGER,
    file_path TEXT NOT NULL, file_type TEXT, original_name TEXT, ai_analysis TEXT,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (issue_id) REFERENCES issues(id), FOREIGN KEY (message_id) REFERENCES messages(id)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, role TEXT DEFAULT 'maintenance', active INTEGER DEFAULT 1,
    last_login DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY, value TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, action TEXT NOT NULL,
    details TEXT, performed_by TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (issue_id) REFERENCES issues(id)
  )`);

  db.exec('CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_issues_tenant ON issues(tenant_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_messages_issue ON messages(issue_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_tenants_phone ON tenants(phone)');

  // Seed admin
  const existing = db.prepare('SELECT id FROM staff WHERE email = ?').get(process.env.ADMIN_EMAIL || 'admin@52oldelvet.com');
  if (!existing) {
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'changeme123', 10);
    db.prepare('INSERT INTO staff (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(
      'Admin', process.env.ADMIN_EMAIL || 'admin@52oldelvet.com', hash, 'admin'
    );
    console.log('  Default admin user created');
  }

  // Seed settings - force OpenAI as provider with hardcoded key
  const defaults = [
    ['llm_provider', process.env.LLM_PROVIDER || 'openai'],
    ['anthropic_api_key', process.env.ANTHROPIC_API_KEY || ''],
    ['openai_api_key', process.env.OPENAI_API_KEY || ''],
    ['escalation_threshold', '3'],
    ['escalation_email', process.env.ESCALATION_EMAIL || 'admin@52oldelvet.com'],
    ['bot_greeting', "Hello! I'm the PSB Properties maintenance assistant. How can I help today?"],
    ['bot_escalation_message', "I've escalated this to our team. Reference: {ref}. They'll be in touch shortly."],
  ];
  for (const [key, value] of defaults) {
    db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(key, value);
  }
  // Always sync env vars into DB so Railway variables take effect
  if (process.env.LLM_PROVIDER) {
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(process.env.LLM_PROVIDER, 'llm_provider');
  }
  if (process.env.OPENAI_API_KEY) {
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(process.env.OPENAI_API_KEY, 'openai_api_key');
  }
  if (process.env.ANTHROPIC_API_KEY) {
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(process.env.ANTHROPIC_API_KEY, 'anthropic_api_key');
  }

  // Seed properties - check if portfolio is up to date
  const has33OldElvet = db.prepare("SELECT id FROM properties WHERE name = '33 Old Elvet'").get();
  if (!has33OldElvet) {
    // Clear old properties and re-seed with full portfolio
    db.exec('DELETE FROM properties');
    const props = [
      ['52 Old Elvet', '52 Old Elvet, Durham', 'DH1 3HN', 12],
      ['33 Old Elvet', '33 Old Elvet, Durham', 'DH1 3HN', 1],
      ['Flass Court 2A', 'Flass Court 2A, Durham', 'DH1 3HN', 1],
      ['Flass Court 2B', 'Flass Court 2B, Durham', 'DH1 3HN', 1],
      ['Flass Court Lower', 'Flass Court Lower, Durham', 'DH1 3HN', 1],
      ['Flass House Upper', 'Flass House Upper, Durham', 'DH1 3HN', 1],
      ['Flass House Lower', 'Flass House Lower, Durham', 'DH1 3HN', 1],
      ['Claypath Flat 1', 'Claypath Flat 1, Durham', 'DH1 1QT', 1],
      ['Claypath Flat 2', 'Claypath Flat 2, Durham', 'DH1 1QT', 1],
      ['Claypath Flat 3', 'Claypath Flat 3, Durham', 'DH1 1QT', 1],
      ['Claypath Flat 4', 'Claypath Flat 4, Durham', 'DH1 1QT', 1],
      ['35 St Andrews Court', '35 St Andrews Court, Durham', 'DH1', 1],
      ['7 Cathedrals', '7 Cathedrals, Durham', 'DH1', 1],
      ['2 St Margarets Mews', '2 St Margarets Mews, Durham', 'DH1', 1],
      ['24 Hallgarth Street', '24 Hallgarth Street, Durham', 'DH1 3AT', 1],
    ];
    for (const [name, address, postcode, units] of props) {
      db.prepare('INSERT INTO properties (name, address, postcode, num_units) VALUES (?, ?, ?, ?)').run(name, address, postcode, units);
    }
    console.log('  Properties re-seeded with full portfolio');
  }

  db.close();
  console.log('  Database initialised successfully');
}

module.exports = { getDb, initialiseDatabase, DB_PATH };
