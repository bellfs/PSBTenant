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

function getDb() {
  if (!SQL) throw new Error('SQL.js not initialised');
  let rawDb;
  if (fs.existsSync(DB_PATH)) {
    rawDb = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    rawDb = new SQL.Database();
  }
  const wrapper = {
    exec(sql) { rawDb.run(sql); saveDb(rawDb); },
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
          try { if (params.length) stmt.bind(params); if (stmt.step()) return stmt.getAsObject(); return undefined; } finally { stmt.free(); }
        },
        all(...params) {
          const results = [];
          const stmt = rawDb.prepare(sql);
          try { if (params.length) stmt.bind(params); while (stmt.step()) results.push(stmt.getAsObject()); return results; } finally { stmt.free(); }
        }
      };
    },
    pragma() {},
    close() { saveDb(rawDb); rawDb.close(); }
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
    ai_suggested_fixes TEXT,
    estimated_cost REAL DEFAULT 0, estimated_materials TEXT, estimated_hours REAL DEFAULT 0,
    final_cost REAL, final_notes TEXT, attended_by TEXT, resolution_notes TEXT,
    escalated_at DATETIME, resolved_at DATETIME,
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
  db.exec('CREATE INDEX IF NOT EXISTS idx_issues_property ON issues(property_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_messages_issue ON messages(issue_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_tenants_phone ON tenants(phone)');

  // Migrate existing DBs
  const cols = [
    ['issues','estimated_cost','ALTER TABLE issues ADD COLUMN estimated_cost REAL DEFAULT 0'],
    ['issues','estimated_materials','ALTER TABLE issues ADD COLUMN estimated_materials TEXT'],
    ['issues','estimated_hours','ALTER TABLE issues ADD COLUMN estimated_hours REAL DEFAULT 0'],
    ['issues','final_cost','ALTER TABLE issues ADD COLUMN final_cost REAL'],
    ['issues','final_notes','ALTER TABLE issues ADD COLUMN final_notes TEXT'],
    ['issues','attended_by','ALTER TABLE issues ADD COLUMN attended_by TEXT'],
    ['issues','resolution_notes','ALTER TABLE issues ADD COLUMN resolution_notes TEXT'],
  ];
  for (const [t,c,s] of cols) {
    try { db.prepare(`SELECT ${c} FROM ${t} LIMIT 0`).all(); } catch(e) {
      try { db.exec(s); console.log(`  Migrated: ${c}`); } catch(e2) {}
    }
  }

  // Seed admin
  if (!db.prepare('SELECT id FROM staff WHERE email = ?').get(process.env.ADMIN_EMAIL || 'admin@52oldelvet.com')) {
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'changeme123', 10);
    db.prepare('INSERT INTO staff (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('Admin', process.env.ADMIN_EMAIL || 'admin@52oldelvet.com', hash, 'admin');
    console.log('  Admin created');
  }

  // Seed team
  for (const [name, email] of [['Hannah Winn','hannah@52oldelvet.com'],['Andy Turns','andy@52oldelvet.com'],['Akiel Mahmood','akiel@52oldelvet.com']]) {
    if (!db.prepare('SELECT id FROM staff WHERE email = ?').get(email)) {
      db.prepare('INSERT INTO staff (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(name, email, bcrypt.hashSync('psb2026!', 10), 'maintenance');
      console.log(`  Team member created: ${name}`);
    }
  }

  // Seed settings
  for (const [k,v] of [
    ['llm_provider', process.env.LLM_PROVIDER || 'openai'],
    ['anthropic_api_key', process.env.ANTHROPIC_API_KEY || ''],
    ['openai_api_key', process.env.OPENAI_API_KEY || ''],
    ['escalation_threshold', '3'],
    ['escalation_email', process.env.ESCALATION_EMAIL || 'admin@52oldelvet.com'],
    ['bot_greeting', "Hey! 👋 I'm the PSB Properties maintenance bot."],
    ['bot_escalation_message', "Escalated to our team. Ref: {ref}. They'll be in touch shortly."],
  ]) { db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(k, v); }
  if (process.env.LLM_PROVIDER) db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(process.env.LLM_PROVIDER, 'llm_provider');
  if (process.env.OPENAI_API_KEY) db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(process.env.OPENAI_API_KEY, 'openai_api_key');
  if (process.env.ANTHROPIC_API_KEY) db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(process.env.ANTHROPIC_API_KEY, 'anthropic_api_key');

  // Seed properties
  if (!db.prepare("SELECT id FROM properties WHERE name = '33 Old Elvet'").get()) {
    db.exec('DELETE FROM properties');
    for (const [n,a,p,u] of [
      ['52 Old Elvet','52 Old Elvet, Durham','DH1 3HN',12],['33 Old Elvet','33 Old Elvet, Durham','DH1 3HN',1],
      ['Flass Court 2A','Flass Court 2A, Durham','DH1 3HN',1],['Flass Court 2B','Flass Court 2B, Durham','DH1 3HN',1],
      ['Flass Court Lower','Flass Court Lower, Durham','DH1 3HN',1],['Flass House Upper','Flass House Upper, Durham','DH1 3HN',1],
      ['Flass House Lower','Flass House Lower, Durham','DH1 3HN',1],['Claypath Flat 1','Claypath Flat 1, Durham','DH1 1QT',1],
      ['Claypath Flat 2','Claypath Flat 2, Durham','DH1 1QT',1],['Claypath Flat 3','Claypath Flat 3, Durham','DH1 1QT',1],
      ['Claypath Flat 4','Claypath Flat 4, Durham','DH1 1QT',1],['35 St Andrews Court','35 St Andrews Court, Durham','DH1',1],
      ['7 Cathedrals','7 Cathedrals, Durham','DH1',1],['2 St Margarets Mews','2 St Margarets Mews, Durham','DH1',1],
      ['24 Hallgarth Street','24 Hallgarth Street, Durham','DH1 3AT',1],
    ]) { db.prepare('INSERT INTO properties (name, address, postcode, num_units) VALUES (?, ?, ?, ?)').run(n,a,p,u); }
    console.log('  Properties seeded');
  }

  db.close();
  console.log('  Database initialised successfully');
}

module.exports = { getDb, initialiseDatabase, DB_PATH };
