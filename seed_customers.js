// Run once on server: node seed_customers.js
require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Must match server.js's own resolution, or this seeds a db file the server never reads.
const dbFile = process.env.DB_PATH || path.join(__dirname, 'shopmanager.db');
const db = new Database(dbFile);

// ── Schema ────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS customers_v2 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    company TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    city TEXT DEFAULT '',
    assigned_to TEXT DEFAULT '',
    status TEXT DEFAULT 'Lead',
    source TEXT DEFAULT '',
    requirement TEXT DEFAULT '',
    followup_action TEXT DEFAULT '',
    next_followup TEXT DEFAULT '',
    remark TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS discussions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    note TEXT NOT NULL,
    author TEXT DEFAULT '',
    type TEXT DEFAULT 'note',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(customer_id) REFERENCES customers_v2(id)
  );

  CREATE TABLE IF NOT EXISTS customer_interests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    interest TEXT NOT NULL,
    FOREIGN KEY(customer_id) REFERENCES customers_v2(id)
  );
`);

const alreadySeeded = db.prepare("SELECT COUNT(*) as c FROM customers_v2 WHERE source IN ('Rohan List','Saurabh List','Expo Register','Expo Visitors')").get().c;
if (alreadySeeded > 0) {
  console.log(`customers_data.json already seeded (${alreadySeeded} rows carry its sources). Skipping.`);
  process.exit(0);
}

const dataPath = path.join(__dirname, 'customers_data.json');
if (!fs.existsSync(dataPath)) {
  console.error('customers_data.json not found. Run extraction first.');
  process.exit(1);
}

const customers = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// customers_v2.status is constrained in the app UI to exactly 4 values (see server.js
// APPROVED_STATUSES). The extracted sheet has many rows where an unrelated column
// (an exhibition tag, a contact's name, a stray row number) leaked into "status" —
// map what's recognizable, and for anything else fall back to 'Lead' rather than
// inventing a 5th status, keeping the original text in remark so nothing is lost.
// Matches server.js's own idempotent status migration, so this stays consistent
// with the mapping already encoded there (Active -> Onboarded, not "still active").
const STATUS_MAP = {
  'active': 'Onboarded',
  'chasing': 'Contacted and Has Potential',
  'lead': 'Lead',
  'settled': 'Onboarded',
};
function normalizeStatus(raw, remark) {
  const key = String(raw || '').trim().toLowerCase();
  if (STATUS_MAP[key]) return { status: STATUS_MAP[key], remark };
  if (!key) return { status: 'Lead', remark };
  const tagged = `[raw status: ${raw}]${remark ? ' ' + remark : ''}`;
  return { status: 'Lead', remark: tagged };
}

const insertCustomer = db.prepare(`
  INSERT INTO customers_v2 (name,company,phone,email,city,assigned_to,status,source,requirement,followup_action,next_followup,remark,customer_type)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
`);

const insertDiscussion = db.prepare(`
  INSERT INTO discussions (customer_id, note, author, type, created_at)
  VALUES (?,?,?,?,datetime('now'))
`);

const seedAll = db.transaction(() => {
  for (const c of customers) {
    const { status, remark } = normalizeStatus(c.status, c.remark || '');
    const r = insertCustomer.run(
      c.name, c.company||'', c.phone||'', c.email||'', c.city||'',
      c.assigned_to||'', status, c.source||'',
      c.requirement||'', c.followup_action||'',
      c.next_followup||'', remark, 'Others'
    );
    const cid = r.lastInsertRowid;

    // Seed last conversation as first discussion entry
    const note = [c.last_conversation, c.requirement].filter(Boolean).join(' | ');
    if (note && note.trim()) {
      insertDiscussion.run(cid, note.trim(), c.assigned_to || 'System', 'note');
    }
  }
});

seedAll();
console.log(`✓ Seeded ${customers.length} customers with discussion history.`);
db.close();
