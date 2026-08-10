require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const Database = require('better-sqlite3');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const PDFDocument = require('pdfkit');
const app = express();
const PORT = process.env.PORT || 3000;

// ── Database ───────────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'shopmanager.db'));

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
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS customer_interests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    interest TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#6366f1'
  );
  CREATE TABLE IF NOT EXISTS customer_tags (
    customer_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (customer_id, tag_id)
  );
  CREATE TABLE IF NOT EXISTS team_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#4f46e5',
    role TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS statuses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#6366f1',
    sort_order INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS customer_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#0ea5e9',
    sort_order INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT, category TEXT, name TEXT,
    price TEXT, new_price TEXT,
    availability TEXT DEFAULT 'yes',
    unit TEXT, min_quantity INTEGER DEFAULT 1,
    dimensions TEXT, details TEXT,
    specs TEXT DEFAULT '{}',
    applications TEXT,
    images TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS customer_phones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    phone TEXT NOT NULL,
    label TEXT DEFAULT '',
    is_primary INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER,
    type TEXT DEFAULT 'wa_message',
    body TEXT DEFAULT '',
    is_read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS wa_message_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    category TEXT DEFAULT 'MARKETING',
    language TEXT DEFAULT 'en_US',
    body TEXT DEFAULT '',
    status TEXT DEFAULT 'PENDING',
    meta_id TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    size_bytes INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS wa_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER DEFAULT NULL,
    phone TEXT NOT NULL,
    direction TEXT NOT NULL,
    body TEXT DEFAULT '',
    msg_type TEXT DEFAULT 'text',
    wa_msg_id TEXT DEFAULT '',
    status TEXT DEFAULT '',
    author TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS customer_socials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    platform TEXT NOT NULL,
    external_id TEXT NOT NULL,
    handle TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS instagram_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER DEFAULT NULL,
    external_id TEXT NOT NULL,
    handle TEXT DEFAULT '',
    direction TEXT NOT NULL,
    kind TEXT DEFAULT 'dm',
    body TEXT DEFAULT '',
    ig_msg_id TEXT DEFAULT '',
    author TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// ── Idempotent schema migrations ─────────────────────────────
try { db.exec("ALTER TABLE customer_interests ADD COLUMN quantity TEXT DEFAULT ''"); } catch(e) {}
try { db.exec("ALTER TABLE customers_v2 ADD COLUMN photo TEXT DEFAULT ''"); } catch(e) {}
try { db.exec("ALTER TABLE customers_v2 ADD COLUMN state TEXT DEFAULT ''"); } catch(e) {}
try { db.exec("ALTER TABLE customers_v2 ADD COLUMN gst_number TEXT DEFAULT ''"); } catch(e) {}
try { db.exec("ALTER TABLE products ADD COLUMN flag_available INTEGER DEFAULT 0"); } catch(e) {}
try { db.exec("ALTER TABLE customers_v2 ADD COLUMN customer_type TEXT DEFAULT ''"); } catch(e) {}
try { db.exec("ALTER TABLE customers_v2 ADD COLUMN phone2 TEXT DEFAULT ''"); } catch(e) {}
try { db.exec("ALTER TABLE customers_v2 ADD COLUMN country TEXT DEFAULT ''"); } catch(e) {}
try { db.exec("ALTER TABLE products ADD COLUMN flag_out_of_stock INTEGER DEFAULT 0"); } catch(e) {}
try { db.exec("ALTER TABLE products ADD COLUMN flag_for_internal INTEGER DEFAULT 0"); } catch(e) {}
try { db.exec("ALTER TABLE team_members ADD COLUMN password TEXT DEFAULT ''"); } catch(e) {}
try { db.exec(`CREATE TABLE IF NOT EXISTS proforma_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  items TEXT DEFAULT '[]',
  freight REAL DEFAULT 0,
  pf REAL DEFAULT 0,
  remarks TEXT DEFAULT '',
  total REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
)`); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_wa_phone ON wa_messages(phone)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_wa_customer ON wa_messages(customer_id)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_phones_customer ON customer_phones(customer_id)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_notif_read ON notifications(is_read)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_socials_external ON customer_socials(platform, external_id)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_ig_external ON instagram_messages(external_id)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_ig_customer ON instagram_messages(customer_id)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_cv2_status ON customers_v2(status)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_cv2_type ON customers_v2(customer_type)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_cv2_state ON customers_v2(state)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_cv2_phone ON customers_v2(phone)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_cv2_updated ON customers_v2(updated_at)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_cv2_assigned ON customers_v2(assigned_to)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_pi_customer ON proforma_invoices(customer_id)"); } catch(e) {}

// Backfill: copy existing customers_v2.phone into customer_phones as primary, if not already present
try {
  const rows = db.prepare("SELECT id, phone FROM customers_v2 WHERE phone IS NOT NULL AND phone!=''").all();
  const exists = db.prepare("SELECT 1 FROM customer_phones WHERE customer_id=? AND phone=?");
  const ins = db.prepare("INSERT INTO customer_phones (customer_id, phone, label, is_primary) VALUES (?,?,?,1)");
  for (const r of rows) {
    if (!exists.get(r.id, r.phone)) ins.run(r.id, r.phone, 'Primary');
  }
} catch(e) { console.log('Phone backfill note:', e.message); }

// ── Idempotent data migrations ────────────────────────────────
try {
  db.exec([
    "UPDATE customers_v2 SET status='Contacted' WHERE status='Chasing'",
    "UPDATE customers_v2 SET status='Contacted but No Response' WHERE status='No Response'",
    "UPDATE customers_v2 SET status='Onboarded' WHERE status IN ('Settled','Active')",
    "UPDATE customers_v2 SET status='Lead' WHERE status NOT IN ('Lead','Contacted','Contacted but No Response','Onboarded')",
    "UPDATE customers_v2 SET assigned_to='Rohan' WHERE LOWER(COALESCE(assigned_to,'')) LIKE '%rohan%'",
    "UPDATE customers_v2 SET assigned_to='Saurabh' WHERE LOWER(COALESCE(assigned_to,'')) LIKE '%saurabh%'",
    "UPDATE customers_v2 SET assigned_to='Unassigned' WHERE assigned_to NOT IN ('Rohan','Saurabh','Unassigned') OR assigned_to IS NULL OR assigned_to=''"
  ].join(';'));
} catch(e) { console.log('Migration note:', e.message); }

// Seed initial team members
try { db.exec("INSERT OR IGNORE INTO team_members (name,color,role) VALUES ('Rohan','#1d4ed8','Sales'),('Saurabh','#15803d','Sales')"); } catch(e) {}
// Seed default statuses
// Enforce exactly the 4 approved statuses and 4 approved customer types
{
  const APPROVED_STATUSES = [
    { name: 'Lead', color: '#f59e0b', sort_order: 0 },
    { name: 'Contacted and Has Potential', color: '#3b82f6', sort_order: 1 },
    { name: 'Contacted but No Response', color: '#ef4444', sort_order: 2 },
    { name: 'Onboarded', color: '#10b981', sort_order: 3 },
  ];
  const APPROVED_TYPES = [
    { name: 'Battery Manufacturer', color: '#6366f1', sort_order: 0 },
    { name: 'Retailer', color: '#0ea5e9', sort_order: 1 },
    { name: 'Trader', color: '#f59e0b', sort_order: 2 },
    { name: 'Others', color: '#10b981', sort_order: 3 },
  ];
  db.prepare('DELETE FROM statuses').run();
  APPROVED_STATUSES.forEach(s => db.prepare('INSERT INTO statuses(name,color,sort_order) VALUES(?,?,?)').run(s.name, s.color, s.sort_order));
  db.prepare('DELETE FROM customer_types').run();
  APPROVED_TYPES.forEach(t => db.prepare('INSERT INTO customer_types(name,color,sort_order) VALUES(?,?,?)').run(t.name, t.color, t.sort_order));
}

// ── Compression + security ─────────────────────────────────────
const compression = require('compression');
app.use(compression());

app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname), {
  maxAge: '1h',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    else if (filePath.match(/\.(css|js)$/)) res.setHeader('Cache-Control', 'public, max-age=3600');
    else if (filePath.match(/\.(png|jpg|jpeg|webp|svg|ico)$/)) res.setHeader('Cache-Control', 'public, max-age=86400');
  }
}));

// ── Image upload setup ────────────────────────────────────────
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
app.use('/uploads', express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.]/g, '-')),
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// ── State Codes (GST) ─────────────────────────────────────────
const STATE_CODES = [
  {code:'1',name:'JAMMU AND KASHMIR'},{code:'2',name:'HIMACHAL PRADESH'},{code:'3',name:'PUNJAB'},
  {code:'4',name:'CHANDIGARH'},{code:'5',name:'UTTARAKHAND'},{code:'6',name:'HARYANA'},
  {code:'7',name:'DELHI'},{code:'8',name:'RAJASTHAN'},{code:'9',name:'UTTAR PRADESH'},
  {code:'10',name:'BIHAR'},{code:'11',name:'SIKKIM'},{code:'12',name:'ARUNACHAL PRADESH'},
  {code:'13',name:'NAGALAND'},{code:'14',name:'MANIPUR'},{code:'15',name:'MIZORAM'},
  {code:'16',name:'TRIPURA'},{code:'17',name:'MEGHALAYA'},{code:'18',name:'ASSAM'},
  {code:'19',name:'WEST BENGAL'},{code:'20',name:'JHARKHAND'},{code:'21',name:'ORISSA'},
  {code:'22',name:'CHHATTISGARH'},{code:'23',name:'MADHYA PRADESH'},{code:'24',name:'GUJARAT'},
  {code:'25',name:'DAMAN AND DIU'},{code:'26',name:'DADAR AND NAGAR HAVELI'},
  {code:'27',name:'MAHARASTRA'},{code:'29',name:'KARNATAKA'},{code:'30',name:'GOA'},
  {code:'31',name:'LAKSHADWEEP'},{code:'32',name:'KERALA'},{code:'33',name:'TAMIL NADU'},
  {code:'34',name:'PUDUCHERRY'},{code:'35',name:'ANDAMAN AND NICOBAR'},
  {code:'36',name:'TELANGANA'},{code:'37',name:'ANDHRA PRADESH'},
  {code:'96',name:'OTHER COUNTRY'},{code:'97',name:'OTHER TERRITORY'}
];
app.get('/api/state-codes', (req, res) => res.json(STATE_CODES));

// ── Tags ──────────────────────────────────────────────────────
app.get('/api/tags', (req, res) => {
  res.json({ data: db.prepare('SELECT * FROM tags ORDER BY name').all() });
});
app.post('/api/tags', (req, res) => {
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const r = db.prepare('INSERT INTO tags (name, color) VALUES (?,?)').run(name.trim(), color || '#6366f1');
    res.json({ success: true, id: r.lastInsertRowid, name: name.trim(), color: color || '#6366f1' });
  } catch(e) { res.status(400).json({ error: 'Tag already exists' }); }
});
app.delete('/api/tags/:id', (req, res) => {
  db.prepare('DELETE FROM customer_tags WHERE tag_id=?').run(req.params.id);
  db.prepare('DELETE FROM tags WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ── Statuses ─────────────────────────────────────────────────
app.get('/api/statuses', (req, res) => {
  res.json({ data: db.prepare('SELECT * FROM statuses ORDER BY sort_order, name').all() });
});
app.post('/api/statuses', (req, res) => {
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM statuses').get().m || 0;
    const r = db.prepare('INSERT INTO statuses (name, color, sort_order) VALUES (?,?,?)').run(name.trim(), color || '#6366f1', maxOrder + 1);
    res.json({ success: true, id: r.lastInsertRowid, name: name.trim(), color: color || '#6366f1' });
  } catch(e) { res.status(400).json({ error: 'Status already exists' }); }
});
app.delete('/api/statuses/:id', (req, res) => {
  const s = db.prepare('SELECT name FROM statuses WHERE id=?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM statuses WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ── Customer Types ────────────────────────────────────────────
app.get('/api/customer-types', (req, res) => {
  res.json({ data: db.prepare('SELECT * FROM customer_types ORDER BY sort_order, name').all() });
});
app.post('/api/customer-types', (req, res) => {
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM customer_types').get().m || 0;
    const r = db.prepare('INSERT INTO customer_types (name, color, sort_order) VALUES (?,?,?)').run(name.trim(), color || '#0ea5e9', maxOrder + 1);
    res.json({ success: true, id: r.lastInsertRowid, name: name.trim(), color: color || '#0ea5e9' });
  } catch(e) { res.status(400).json({ error: 'Type already exists' }); }
});
app.delete('/api/customer-types/:id', (req, res) => {
  db.prepare('DELETE FROM customer_types WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ── Team Members ─────────────────────────────────────────────
app.get('/api/team-members', (req, res) => {
  res.json({ data: db.prepare('SELECT * FROM team_members ORDER BY id').all() });
});
app.post('/api/team-members', (req, res) => {
  const { name, color, role, password } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const r = db.prepare('INSERT INTO team_members (name,color,role,password) VALUES (?,?,?,?)').run(name.trim(), color||'#4f46e5', role||'', password||'');
    res.json({ success:true, id:r.lastInsertRowid, name:name.trim(), color:color||'#4f46e5', role:role||'', password:password||'' });
  } catch(e) { res.status(400).json({ error:'Name already exists' }); }
});
app.put('/api/team-members/:id', (req, res) => {
  const { color, role, password } = req.body;
  if (password !== undefined) {
    db.prepare('UPDATE team_members SET color=?,role=?,password=? WHERE id=?').run(color||'#4f46e5', role||'', password||'', req.params.id);
  } else {
    db.prepare('UPDATE team_members SET color=?,role=? WHERE id=?').run(color||'#4f46e5', role||'', req.params.id);
  }
  res.json({ success:true });
});
app.delete('/api/team-members/:id', (req, res) => {
  db.prepare('DELETE FROM team_members WHERE id=?').run(req.params.id);
  res.json({ success:true });
});

// ── Auth: single-password login → resolves to admin or team member ──
const ADMIN_PASSWORD = 'admin';
app.post('/api/auth/login', (req, res) => {
  const password = (req.body && req.body.password || '').trim();
  if (!password) return res.status(400).json({ success:false, error:'Password required' });
  if (password === ADMIN_PASSWORD) {
    return res.json({ success:true, role:'admin', name:'Admin' });
  }
  const m = db.prepare("SELECT id,name FROM team_members WHERE password=? AND password!=''").get(password);
  if (m) return res.json({ success:true, role:'member', name:m.name, id:m.id });
  res.status(401).json({ success:false, error:'Incorrect password' });
});

// ── Customer tags ─────────────────────────────────────────────
app.post('/api/crm/customers/:id/tags', (req, res) => {
  const { tag_id } = req.body;
  db.prepare('INSERT OR IGNORE INTO customer_tags (customer_id, tag_id) VALUES (?,?)').run(req.params.id, tag_id);
  res.json({ success: true });
});
app.delete('/api/crm/customers/:id/tags/:tagId', (req, res) => {
  db.prepare('DELETE FROM customer_tags WHERE customer_id=? AND tag_id=?').run(req.params.id, req.params.tagId);
  res.json({ success: true });
});

// ── Customers V2 (CRM) ───────────────────────────────────────
app.get('/api/crm/customers', (req, res) => {
  const { assigned_to, status, search, limit, offset, customer_type, state } = req.query;
  let sql = 'SELECT * FROM customers_v2';
  let countSql = 'SELECT COUNT(*) as total FROM customers_v2';
  const params = [], conds = [];
  if (assigned_to) { conds.push('assigned_to = ?'); params.push(assigned_to); }
  if (status) { conds.push('status = ?'); params.push(status); }
  if (customer_type) { conds.push('customer_type = ?'); params.push(customer_type); }
  if (state) { conds.push('state = ?'); params.push(state); }
  if (search) { conds.push('(name LIKE ? OR company LIKE ? OR phone LIKE ? OR phone2 LIKE ? OR email LIKE ? OR city LIKE ? OR state LIKE ? OR country LIKE ? OR requirement LIKE ? OR remark LIKE ? OR source LIKE ? OR customer_type LIKE ? OR status LIKE ?)'); params.push(...Array(13).fill(`%${search}%`)); }
  if (conds.length) { const w = ' WHERE ' + conds.join(' AND '); sql += w; countSql += w; }
  const total = db.prepare(countSql).get(...params).total;
  sql += ' ORDER BY updated_at DESC';
  const lim = Math.min(parseInt(limit) || 200, 500);
  const off = parseInt(offset) || 0;
  sql += ` LIMIT ${lim} OFFSET ${off}`;
  const customers = db.prepare(sql).all(...params);
  if (customers.length) {
    const ids = customers.map(c => c.id);
    const tagRows = db.prepare(`SELECT ct.customer_id, t.id, t.name, t.color FROM customer_tags ct JOIN tags t ON ct.tag_id=t.id WHERE ct.customer_id IN (${ids.map(()=>'?').join(',')})`).all(...ids);
    const byC = {};
    tagRows.forEach(t => { if (!byC[t.customer_id]) byC[t.customer_id]=[]; byC[t.customer_id].push({id:t.id,name:t.name,color:t.color}); });
    customers.forEach(c => { c.tags = byC[c.id] || []; });
  }
  res.json({ data: customers, total, limit: lim, offset: off });
});

app.get('/api/crm/customers/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM customers_v2 WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  const discussions = db.prepare('SELECT * FROM discussions WHERE customer_id=? ORDER BY created_at DESC').all(req.params.id);
  const interests = db.prepare('SELECT id, interest, quantity FROM customer_interests WHERE customer_id=?').all(req.params.id);
  const tags = db.prepare('SELECT t.id, t.name, t.color FROM customer_tags ct JOIN tags t ON ct.tag_id=t.id WHERE ct.customer_id=? ORDER BY t.name').all(req.params.id);
  res.json({ ...c, discussions, interests, tags });
});

app.post('/api/crm/customers', (req, res) => {
  const c = req.body;
  if (c.phone) {
    const clean = c.phone.replace(/[^\d]/g, '').slice(-10);
    if (clean.length >= 10) {
      const dup = db.prepare("SELECT id, name FROM customers_v2 WHERE SUBSTR(REPLACE(phone,' ',''),-10) = ?").get(clean);
      if (dup) return res.status(400).json({ error: `Phone already exists for "${dup.name}"`, success: false });
    }
  }
  const r = db.prepare(`INSERT INTO customers_v2 (name,company,phone,phone2,email,city,state,country,gst_number,assigned_to,status,source,requirement,followup_action,next_followup,remark,customer_type) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(c.name, c.company||'', c.phone||'', c.phone2||'', c.email||'', c.city||'', c.state||'', c.country||'', c.gst_number||'', c.assigned_to||'', c.status||'Lead', c.source||'', c.requirement||'', c.followup_action||'', c.next_followup||'', c.remark||'', c.customer_type||'');
  res.json({ success: true, id: r.lastInsertRowid });
});

app.put('/api/crm/customers/:id', (req, res) => {
  const c = req.body;
  db.prepare(`UPDATE customers_v2 SET name=?,company=?,phone=?,phone2=?,email=?,city=?,state=?,country=?,gst_number=?,assigned_to=?,status=?,source=?,requirement=?,followup_action=?,next_followup=?,remark=?,customer_type=?,updated_at=datetime('now') WHERE id=?`)
    .run(c.name, c.company||'', c.phone||'', c.phone2||'', c.email||'', c.city||'', c.state||'', c.country||'', c.gst_number||'', c.assigned_to||'', c.status||'Lead', c.source||'', c.requirement||'', c.followup_action||'', c.next_followup||'', c.remark||'', c.customer_type||'', req.params.id);
  res.json({ success: true });
});

app.delete('/api/crm/customers/:id', (req, res) => {
  const { password } = req.body || {};
  if (password !== 'deletebyadmin') return res.status(403).json({ error: 'Wrong admin password' });
  db.prepare('DELETE FROM discussions WHERE customer_id=?').run(req.params.id);
  db.prepare('DELETE FROM customer_interests WHERE customer_id=?').run(req.params.id);
  db.prepare('DELETE FROM customer_phones WHERE customer_id=?').run(req.params.id);
  db.prepare('DELETE FROM customer_tags WHERE customer_id=?').run(req.params.id);
  db.prepare('DELETE FROM proforma_invoices WHERE customer_id=?').run(req.params.id);
  db.prepare('DELETE FROM wa_messages WHERE customer_id=?').run(req.params.id);
  db.prepare('DELETE FROM customers_v2 WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// Bulk import contacts
app.post('/api/crm/import', (req, res) => {
  const contacts = req.body;
  if (!Array.isArray(contacts)) return res.status(400).json({ error: 'Expected array' });
  const statusMap = {
    'New Lead': 'Lead',
    'Onboarded': 'Customer',
    'Conversation Started But No Response': 'Contacted but No Response'
  };
  const insert = db.prepare(`INSERT INTO customers_v2 (name,company,phone,phone2,email,city,state,country,assigned_to,status,source,requirement,remark,customer_type) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const update = db.prepare(`UPDATE customers_v2 SET name=CASE WHEN name='' OR name IS NULL THEN ? ELSE name END, company=CASE WHEN company='' OR company IS NULL THEN ? ELSE company END, phone2=CASE WHEN phone2='' OR phone2 IS NULL THEN ? ELSE phone2 END, email=CASE WHEN email='' OR email IS NULL THEN ? ELSE email END, city=CASE WHEN city='' OR city IS NULL THEN ? ELSE city END, state=CASE WHEN state='' OR state IS NULL THEN ? ELSE state END, country=CASE WHEN country='' OR country IS NULL THEN ? ELSE country END, source=CASE WHEN source='' OR source IS NULL THEN ? ELSE source END, requirement=CASE WHEN requirement='' OR requirement IS NULL THEN ? ELSE requirement END, remark=CASE WHEN remark='' OR remark IS NULL THEN ? ELSE remark END, customer_type=CASE WHEN customer_type='' OR customer_type IS NULL THEN ? ELSE customer_type END, updated_at=datetime('now') WHERE phone=? AND (phone!='' AND phone IS NOT NULL)`);
  const checkPhone = db.prepare('SELECT id FROM customers_v2 WHERE phone=? AND phone!=\'\'');
  let inserted = 0, updated = 0, skipped = 0;
  const importTx = db.transaction(() => {
    for (const c of contacts) {
      const phone = (c.phone || '').trim();
      const st = statusMap[c.status] || c.status || 'Lead';
      if (phone) {
        const existing = checkPhone.get(phone);
        if (existing) {
          update.run(c.name||'', c.company||'', c.phone2||'', c.email||'', c.city||'', c.state||'', c.country||'India', c.source||'', c.requirement||'', c.remark||'', c.customer_type||'', phone);
          updated++;
        } else {
          insert.run(c.name||'', c.company||'', phone, c.phone2||'', c.email||'', c.city||'', c.state||'', c.country||'India', '', st, c.source||'', c.requirement||'', c.remark||'', c.customer_type||'');
          inserted++;
        }
      } else {
        insert.run(c.name||'', c.company||'', '', c.phone2||'', c.email||'', c.city||'', c.state||'', c.country||'India', '', st, c.source||'', c.requirement||'', c.remark||'', c.customer_type||'');
        skipped++;
      }
    }
  });
  importTx();
  res.json({ success: true, inserted, updated, noPhone: skipped });
});

// Discussions
app.get('/api/crm/customers/:id/discussions', (req, res) => {
  const rows = db.prepare('SELECT * FROM discussions WHERE customer_id=? ORDER BY created_at DESC').all(req.params.id);
  res.json({ data: rows });
});

app.post('/api/crm/customers/:id/discussions', (req, res) => {
  const { note, author, type } = req.body;
  const r = db.prepare('INSERT INTO discussions (customer_id,note,author,type) VALUES (?,?,?,?)').run(req.params.id, note, author||'', type||'note');
  db.prepare("UPDATE customers_v2 SET updated_at=datetime('now') WHERE id=?").run(req.params.id);
  res.json({ success: true, id: r.lastInsertRowid });
});

app.delete('/api/crm/discussions/:id', (req, res) => {
  db.prepare('DELETE FROM discussions WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// Customer photo upload
app.post('/api/crm/customers/:id/photo', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const row = db.prepare('SELECT photo FROM customers_v2 WHERE id=?').get(req.params.id);
  if (row?.photo) {
    const fp = path.join(uploadsDir, row.photo);
    try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch(e) {}
  }
  db.prepare("UPDATE customers_v2 SET photo=?,updated_at=datetime('now') WHERE id=?").run(req.file.filename, req.params.id);
  res.json({ success: true, photo: req.file.filename });
});

// ── Multi-phone numbers ───────────────────────────────────────
app.get('/api/crm/customers/:id/phones', (req, res) => {
  const rows = db.prepare('SELECT * FROM customer_phones WHERE customer_id=? ORDER BY is_primary DESC, id ASC').all(req.params.id);
  res.json(rows);
});
app.post('/api/crm/customers/:id/phones', (req, res) => {
  const { phone, label } = req.body;
  if (!phone || !phone.trim()) return res.status(400).json({ error: 'Phone required' });
  const cid = req.params.id;
  const clean = phone.trim().replace(/[^\d]/g, '').slice(-10);
  const existing = db.prepare("SELECT cp.customer_id, c.name FROM customer_phones cp JOIN customers_v2 c ON c.id=cp.customer_id WHERE SUBSTR(REPLACE(cp.phone,' ',''),-10) = ? AND cp.customer_id != ?").get(clean, cid);
  if (existing) return res.status(400).json({ error: `This number is already assigned to "${existing.name}"` });
  const dup = db.prepare("SELECT 1 FROM customer_phones WHERE customer_id=? AND SUBSTR(REPLACE(phone,' ',''),-10) = ?").get(cid, clean);
  if (dup) return res.status(400).json({ error: 'This number is already added for this customer' });
  const isFirst = db.prepare('SELECT COUNT(*) c FROM customer_phones WHERE customer_id=?').get(cid).c === 0;
  const r = db.prepare('INSERT INTO customer_phones (customer_id, phone, label, is_primary) VALUES (?,?,?,?)')
    .run(cid, phone.trim(), label || '', isFirst ? 1 : 0);
  if (isFirst) db.prepare("UPDATE customers_v2 SET phone=?,updated_at=datetime('now') WHERE id=?").run(phone.trim(), cid);
  res.json({ success: true, id: r.lastInsertRowid });
});
app.put('/api/crm/customers/:id/phones/:phoneId/label', (req, res) => {
  const { label } = req.body;
  db.prepare('UPDATE customer_phones SET label=? WHERE id=? AND customer_id=?').run(label || '', req.params.phoneId, req.params.id);
  res.json({ success: true });
});
app.put('/api/crm/customers/:id/phones/:phoneId/select', (req, res) => {
  const cid = req.params.id;
  const row = db.prepare('SELECT * FROM customer_phones WHERE id=? AND customer_id=?').get(req.params.phoneId, cid);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE customer_phones SET is_primary=0 WHERE customer_id=?').run(cid);
  db.prepare('UPDATE customer_phones SET is_primary=1 WHERE id=?').run(row.id);
  db.prepare("UPDATE customers_v2 SET phone=?,updated_at=datetime('now') WHERE id=?").run(row.phone, cid);
  res.json({ success: true });
});
app.delete('/api/crm/customers/:id/phones/:phoneId', (req, res) => {
  const cid = req.params.id;
  const row = db.prepare('SELECT * FROM customer_phones WHERE id=? AND customer_id=?').get(req.params.phoneId, cid);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM customer_phones WHERE id=?').run(row.id);
  if (row.is_primary) {
    const next = db.prepare('SELECT * FROM customer_phones WHERE customer_id=? ORDER BY id ASC LIMIT 1').get(cid);
    if (next) {
      db.prepare('UPDATE customer_phones SET is_primary=1 WHERE id=?').run(next.id);
      db.prepare("UPDATE customers_v2 SET phone=?,updated_at=datetime('now') WHERE id=?").run(next.phone, cid);
    } else {
      db.prepare("UPDATE customers_v2 SET phone='',updated_at=datetime('now') WHERE id=?").run(cid);
    }
  }
  res.json({ success: true });
});

// ── Notifications ─────────────────────────────────────────────
app.get('/api/notifications', (req, res) => {
  const rows = db.prepare(`
    SELECT n.*, c.name AS customer_name, c.phone AS customer_phone
    FROM notifications n LEFT JOIN customers_v2 c ON c.id=n.customer_id
    ORDER BY n.id DESC LIMIT 50
  `).all();
  const unread = db.prepare('SELECT COUNT(*) c FROM notifications WHERE is_read=0').get().c;
  res.json({ unread, notifications: rows });
});
app.put('/api/notifications/:id/read', (req, res) => {
  db.prepare('UPDATE notifications SET is_read=1 WHERE id=?').run(req.params.id);
  res.json({ success: true });
});
app.put('/api/notifications/read-all', (req, res) => {
  db.prepare('UPDATE notifications SET is_read=1 WHERE is_read=0').run();
  res.json({ success: true });
});

// ── WhatsApp Template Manager (admin) ─────────────────────────
app.get('/api/whatsapp/templates', async (req, res) => {
  try {
    const wabaId = process.env.WHATSAPP_WABA_ID;
    const token = process.env.WHATSAPP_TOKEN;
    if (wabaId && token) {
      const r = await fetch(`https://graph.facebook.com/v21.0/${wabaId}/message_templates?limit=100`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await r.json();
      if (data.data) {
        const upsert = db.prepare(`INSERT INTO wa_message_templates (name,category,language,body,status,meta_id)
          VALUES (@name,@category,@language,@body,@status,@meta_id)
          ON CONFLICT(name) DO UPDATE SET category=excluded.category, language=excluded.language, body=excluded.body, status=excluded.status, meta_id=excluded.meta_id`);
        for (const t of data.data) {
          const bodyComp = (t.components || []).find(c => c.type === 'BODY');
          upsert.run({
            name: t.name, category: t.category || 'MARKETING', language: t.language || 'en_US',
            body: bodyComp ? bodyComp.text : '', status: t.status || 'PENDING', meta_id: t.id || ''
          });
        }
      }
    }
  } catch (e) { console.log('Template sync error:', e.message); }
  const rows = db.prepare('SELECT * FROM wa_message_templates ORDER BY name ASC').all();
  res.json(rows);
});

app.post('/api/whatsapp/templates', async (req, res) => {
  const { name, category, language, body, buttonText, buttonUrl } = req.body;
  if (!name || !body) return res.status(400).json({ error: 'Name and body are required' });
  try {
    const wabaId = process.env.WHATSAPP_WABA_ID;
    const token = process.env.WHATSAPP_TOKEN;
    const components = [{ type: 'BODY', text: body }];
    if (buttonText && buttonUrl) {
      components.push({ type: 'BUTTONS', buttons: [{ type: 'URL', text: buttonText, url: buttonUrl }] });
    }
    let metaId = '', status = 'PENDING';
    if (wabaId && token) {
      const r = await fetch(`https://graph.facebook.com/v21.0/${wabaId}/message_templates`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.toLowerCase().replace(/[^a-z0-9_]/g, '_'), category: category || 'MARKETING', language: language || 'en_US', components })
      });
      const data = await r.json();
      if (data.id) { metaId = data.id; status = data.status || 'PENDING'; }
      else if (data.error) return res.status(400).json({ error: data.error.message || 'Meta API rejected the template' });
    }
    db.prepare(`INSERT INTO wa_message_templates (name,category,language,body,status,meta_id) VALUES (?,?,?,?,?,?)
      ON CONFLICT(name) DO UPDATE SET category=excluded.category, language=excluded.language, body=excluded.body, status=excluded.status, meta_id=excluded.meta_id`)
      .run(name.toLowerCase().replace(/[^a-z0-9_]/g, '_'), category || 'MARKETING', language || 'en_US', body, status, metaId);
    res.json({ success: true, status, meta_id: metaId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Import an already-approved template into local DB only (no Meta API call)
app.post('/api/whatsapp/templates/import', (req, res) => {
  const { name, category, language, body, status } = req.body;
  if (!name || !body) return res.status(400).json({ error: 'Name and body are required' });
  const safeName = name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  db.prepare(`INSERT INTO wa_message_templates (name,category,language,body,status,meta_id)
    VALUES (?,?,?,?,?,?) ON CONFLICT(name) DO UPDATE SET
    category=excluded.category, language=excluded.language,
    body=excluded.body, status=excluded.status`)
    .run(safeName, category || 'MARKETING', language || 'en_US', body, status || 'APPROVED', '');
  res.json({ success: true });
});

// ── Data Export / Backup Center ────────────────────────────────
app.get('/api/admin/backups', (req, res) => {
  res.json(db.prepare('SELECT * FROM backups ORDER BY id DESC LIMIT 30').all());
});

app.post('/api/admin/backups/generate', async (req, res) => {
  try {
    const archiver = require('archiver');
    const backupsDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir);
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${ts}.zip`;
    const outPath = path.join(backupsDir, filename);
    const output = fs.createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      db.prepare('INSERT INTO backups (filename, size_bytes) VALUES (?,?)').run(filename, archive.pointer());
    });
    archive.pipe(output);

    // Customers CSV
    const customers = db.prepare('SELECT * FROM customers_v2').all();
    if (customers.length) {
      const cols = Object.keys(customers[0]);
      const csv = [cols.join(','), ...customers.map(r => cols.map(c => `"${String(r[c] ?? '').replace(/"/g,'""')}"`).join(','))].join('\n');
      archive.append(csv, { name: 'customers.csv' });
    }
    // Orders CSV
    const orders = db.prepare('SELECT * FROM orders').all();
    if (orders.length) {
      const cols = Object.keys(orders[0]);
      const csv = [cols.join(','), ...orders.map(r => cols.map(c => `"${String(r[c] ?? '').replace(/"/g,'""')}"`).join(','))].join('\n');
      archive.append(csv, { name: 'orders.csv' });
    }
    // WhatsApp messages CSV
    const waMsgs = db.prepare('SELECT * FROM wa_messages ORDER BY id ASC').all();
    if (waMsgs.length) {
      const cols = Object.keys(waMsgs[0]);
      const csv = [cols.join(','), ...waMsgs.map(r => cols.map(c => `"${String(r[c] ?? '').replace(/"/g,'""')}"`).join(','))].join('\n');
      archive.append(csv, { name: 'whatsapp_messages.csv' });
    }
    // Team members & discussions
    const team = db.prepare('SELECT * FROM team_members').all();
    if (team.length) {
      const cols = Object.keys(team[0]);
      const csv = [cols.join(','), ...team.map(r => cols.map(c => `"${String(r[c] ?? '').replace(/"/g,'""')}"`).join(','))].join('\n');
      archive.append(csv, { name: 'team_members.csv' });
    }
    const discussions = db.prepare('SELECT * FROM discussions').all();
    if (discussions.length) {
      const cols = Object.keys(discussions[0]);
      const csv = [cols.join(','), ...discussions.map(r => cols.map(c => `"${String(r[c] ?? '').replace(/"/g,'""')}"`).join(','))].join('\n');
      archive.append(csv, { name: 'activity_logs.csv' });
    }
    // Images & attachments
    if (fs.existsSync(uploadsDir)) archive.directory(uploadsDir, 'attachments_and_images');

    await archive.finalize();
    res.json({ success: true, filename });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/backups/:filename/download', (req, res) => {
  const fp = path.join(__dirname, 'backups', req.params.filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
  res.download(fp);
});

// Interests
app.post('/api/crm/customers/:id/interests', (req, res) => {
  const { interest, quantity, sku } = req.body;
  const label = sku ? `[${sku}] ${interest}` : interest;
  const r = db.prepare('INSERT INTO customer_interests (customer_id,interest,quantity) VALUES (?,?,?)').run(req.params.id, label, quantity||'');
  res.json({ success: true, id: r.lastInsertRowid });
});

app.patch('/api/crm/interests/:id', (req, res) => {
  const { quantity } = req.body;
  db.prepare('UPDATE customer_interests SET quantity=? WHERE id=?').run(quantity||'', req.params.id);
  res.json({ success: true });
});

app.delete('/api/crm/interests/:id', (req, res) => {
  db.prepare('DELETE FROM customer_interests WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ── Products ──────────────────────────────────────────────────
app.get('/api/products', (req, res) => {
  const { category, search } = req.query;
  let sql = 'SELECT * FROM products';
  const params = [], conds = [];
  if (category) { conds.push('category = ?'); params.push(category); }
  if (search) { conds.push('(name LIKE ? OR sku LIKE ? OR category LIKE ? OR details LIKE ?)'); params.push(...Array(4).fill(`%${search}%`)); }
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
  sql += ' ORDER BY category, CAST(sku AS INTEGER)';
  res.json({ data: db.prepare(sql).all(...params) });
});

app.get('/api/products/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json(p);
});

app.post('/api/products', (req, res) => {
  const p = req.body;
  const r = db.prepare(`INSERT INTO products (sku,category,name,price,new_price,availability,unit,min_quantity,dimensions,details,specs,applications,images,flag_available,flag_out_of_stock,flag_for_internal) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(p.sku, p.category, p.name, p.price, p.new_price || '', p.availability || 'yes', p.unit, p.min_quantity || 1, p.dimensions || '', p.details || '', JSON.stringify(p.specs || {}), p.applications || '', '[]', p.flag_available?1:0, p.flag_out_of_stock?1:0, p.flag_for_internal?1:0);
  res.json({ success: true, id: r.lastInsertRowid });
});

app.put('/api/products/:id', (req, res) => {
  const p = req.body;
  db.prepare(`UPDATE products SET sku=?,category=?,name=?,price=?,new_price=?,availability=?,unit=?,min_quantity=?,dimensions=?,details=?,specs=?,applications=?,flag_available=?,flag_out_of_stock=?,flag_for_internal=?,updated_at=datetime('now') WHERE id=?`)
    .run(p.sku, p.category, p.name, p.price, p.new_price || '', p.availability, p.unit, p.min_quantity, p.dimensions || '', p.details || '', JSON.stringify(p.specs || {}), p.applications || '', p.flag_available?1:0, p.flag_out_of_stock?1:0, p.flag_for_internal?1:0, req.params.id);
  res.json({ success: true });
});

app.patch('/api/products/:id/flags', (req, res) => {
  const { flag_available, flag_out_of_stock, flag_for_internal } = req.body;
  db.prepare(`UPDATE products SET flag_available=?,flag_out_of_stock=?,flag_for_internal=?,updated_at=datetime('now') WHERE id=?`)
    .run(flag_available?1:0, flag_out_of_stock?1:0, flag_for_internal?1:0, req.params.id);
  res.json({ success: true });
});

app.delete('/api/products/:id', (req, res) => {
  const p = db.prepare('SELECT images FROM products WHERE id=?').get(req.params.id);
  if (p) {
    JSON.parse(p.images || '[]').forEach(f => {
      const fp = path.join(uploadsDir, f);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    });
  }
  db.prepare('DELETE FROM products WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// Image upload
app.post('/api/products/:id/images', upload.array('images', 10), (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  const existing = JSON.parse(p.images || '[]');
  const safeId = String(p.id);
  const safeSku = (p.sku || 'sku').replace(/[^a-zA-Z0-9]/g, '_');
  const safeCat = (p.category || 'cat').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20);
  const safeName = (p.name || 'product').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
  const newFiles = req.files.map((f, i) => {
    const ext = path.extname(f.originalname).toLowerCase() || '.jpg';
    const idx = existing.length + i + 1;
    const newName = `${safeId}_${safeSku}_${safeCat}_${safeName}_${idx}${ext}`;
    try {
      fs.renameSync(path.join(uploadsDir, f.filename), path.join(uploadsDir, newName));
      return newName;
    } catch(e) {
      console.error('Image rename failed:', e.message);
      return f.filename;
    }
  });
  const all = [...existing, ...newFiles];
  db.prepare('UPDATE products SET images=? WHERE id=?').run(JSON.stringify(all), req.params.id);
  res.json({ success: true, images: all });
});

app.delete('/api/products/:id/images/:filename', (req, res) => {
  const p = db.prepare('SELECT images FROM products WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const images = JSON.parse(p.images || '[]').filter(f => f !== req.params.filename);
  db.prepare('UPDATE products SET images=? WHERE id=?').run(JSON.stringify(images), req.params.id);
  const fp = path.join(uploadsDir, req.params.filename);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  res.json({ success: true });
});

// ── AI Analysis ───────────────────────────────────────────────
app.post('/api/analyze', async (req, res) => {
  try {
    const { question } = req.body;
    const customers = db.prepare('SELECT * FROM customers').all();
    const orders = db.prepare('SELECT * FROM orders').all();
    const products = db.prepare('SELECT id,sku,category,name,price,availability FROM products').all();
    const totalRevenue = orders.reduce((s, o) => s + (o.amount || 0), 0);

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: 'You are a smart ecommerce business analyst. Answer questions about the business data clearly and concisely with specific numbers. Keep answers under 150 words.',
      messages: [{
        role: 'user',
        content: `Question: ${question}

Business Data:
- Customers: ${customers.length}
- Orders: ${orders.length}, Revenue: ₹${totalRevenue.toLocaleString('en-IN')}
- Products: ${products.length} across ${[...new Set(products.map(p => p.category))].join(', ')}
- Pending orders: ${orders.filter(o => o.status === 'Pending').length}

Customers: ${JSON.stringify(customers.slice(0, 20))}
Orders: ${JSON.stringify(orders.slice(0, 30))}
Products: ${JSON.stringify(products)}`
      }]
    });
    res.json({ answer: message.content[0].text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── AI: extract customer fields from voice transcript ─────────
app.post('/api/ai/extract-customer', async (req, res) => {
  try {
    const { transcript } = req.body;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 512,
      system: 'Extract customer info from a sales call transcript. Return ONLY valid JSON, no markdown or explanation.',
      messages: [{ role: 'user', content: `Transcript: "${transcript}"\n\nReturn JSON with these keys (use empty string if not found): name, company, phone, email, city, requirement, next_followup (YYYY-MM-DD if a date is mentioned, else ""), remark, status ("Lead"|"Contacted"|"Contacted but No Response"|"Onboarded")` }]
    });
    const match = msg.content[0].text.match(/\{[\s\S]*\}/);
    res.json(match ? JSON.parse(match[0]) : {});
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── AI: convert voice transcript into a clean CRM note ────────
app.post('/api/ai/extract-note', async (req, res) => {
  try {
    const { transcript, customerName } = req.body;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 200,
      system: 'Convert a raw voice note into a concise, professional CRM note. 1-3 sentences. Past tense. Capture key points: customer interest, objections, next steps.',
      messages: [{ role: 'user', content: `Customer: ${customerName || 'unknown'}\nVoice note: "${transcript}"\n\nWrite the CRM note:` }]
    });
    res.json({ note: msg.content[0].text.trim() });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Dashboard Stats ───────────────────────────────────────────
function buildCSV(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = v => { const s = String(v ?? ''); return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g,'""')}"` : s; };
  return [headers.join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))].join('\r\n');
}

app.get('/api/dashboard/stats', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const customers = db.prepare('SELECT assigned_to, status, next_followup FROM customers_v2').all();
  const byAssignee = { Rohan: 0, Saurabh: 0, Unassigned: 0 };
  const byStatus = { Lead: 0, 'Contacted and Has Potential': 0, 'Contacted but No Response': 0, Onboarded: 0 };
  let overdue = 0, dueToday = 0;
  customers.forEach(c => {
    byAssignee[c.assigned_to] = (byAssignee[c.assigned_to] || 0) + 1;
    byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    if (c.next_followup) {
      if (c.next_followup < today) overdue++;
      else if (c.next_followup === today) dueToday++;
    }
  });
  const recentActivity = db.prepare(`SELECT d.id,d.note,d.author,d.type,d.created_at,c.name as customer_name,c.assigned_to FROM discussions d JOIN customers_v2 c ON c.id=d.customer_id ORDER BY d.created_at DESC LIMIT 12`).all();
  const todayFollowups = db.prepare(`SELECT id,name,company,phone,assigned_to,status,next_followup,requirement FROM customers_v2 WHERE next_followup=? ORDER BY assigned_to`).all(today);
  const overdueList = db.prepare(`SELECT id,name,company,phone,assigned_to,status,next_followup FROM customers_v2 WHERE next_followup<? AND next_followup!='' ORDER BY next_followup LIMIT 20`).all(today);
  res.json({ total: customers.length, byAssignee, byStatus, overdue, dueToday, recentActivity, todayFollowups, overdueList });
});

// ── Download CSV ──────────────────────────────────────────────
app.get('/api/download/customers.csv', (req, res) => {
  const rows = db.prepare('SELECT id,name,company,phone,email,city,assigned_to,status,requirement,next_followup,remark,created_at FROM customers_v2 ORDER BY id').all();
  res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', 'attachment; filename="customers.csv"');
  res.send(buildCSV(rows));
});

app.get('/api/download/products.csv', (req, res) => {
  const rows = db.prepare('SELECT id,sku,category,name,price,new_price,availability,unit,min_quantity,dimensions,details,applications FROM products ORDER BY category, CAST(sku AS INTEGER)').all();
  res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', 'attachment; filename="products_sku.csv"');
  res.send(buildCSV(rows));
});

app.get('/api/download/query/:name', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const queries = {
    'due-today': () => db.prepare("SELECT id,name,company,phone,assigned_to,status,next_followup,requirement FROM customers_v2 WHERE next_followup=? ORDER BY assigned_to").all(today),
    'overdue': () => db.prepare("SELECT id,name,company,phone,assigned_to,status,next_followup,requirement FROM customers_v2 WHERE next_followup<? AND next_followup!='' ORDER BY next_followup").all(today),
    'unassigned': () => db.prepare("SELECT id,name,company,phone,status,requirement,created_at FROM customers_v2 WHERE assigned_to='Unassigned' ORDER BY created_at DESC").all(),
    'no-response': () => db.prepare("SELECT id,name,company,phone,assigned_to,next_followup,requirement FROM customers_v2 WHERE status='Contacted but No Response' ORDER BY next_followup").all(),
    'onboarded': () => db.prepare("SELECT id,name,company,phone,email,city,assigned_to,requirement FROM customers_v2 WHERE status='Onboarded' ORDER BY name").all(),
    'leads': () => db.prepare("SELECT id,name,company,phone,assigned_to,created_at,requirement FROM customers_v2 WHERE status='Lead' ORDER BY created_at DESC").all(),
  };
  const fn = queries[req.params.name];
  if (!fn) return res.status(404).json({ error: 'Unknown query' });
  res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', `attachment; filename="${req.params.name}.csv"`);
  res.send(buildCSV(fn()));
});

// ── Table Viewer ──────────────────────────────────────────────
const ALLOWED_TABLES = ['customers_v2', 'discussions', 'customer_interests', 'orders', 'products'];

app.get('/api/tables', (req, res) => {
  const result = ALLOWED_TABLES.map(t => ({
    name: t,
    count: db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get().c,
    columns: db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name),
  }));
  res.json({ data: result });
});

app.get('/api/tables/:name', (req, res) => {
  if (!ALLOWED_TABLES.includes(req.params.name)) return res.status(403).json({ error: 'Not allowed' });
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = (page - 1) * limit;
  const total = db.prepare(`SELECT COUNT(*) as c FROM ${req.params.name}`).get().c;
  const rows = db.prepare(`SELECT * FROM ${req.params.name} LIMIT ? OFFSET ?`).all(limit, offset);
  res.json({ data: rows, total, page, limit, pages: Math.ceil(total / limit) });
});

// ── AI: suggest product interests from notes ──────────────────
app.post('/api/ai/suggest-interests', async (req, res) => {
  try {
    const { customerId } = req.body;
    const discussions = db.prepare('SELECT note FROM discussions WHERE customer_id=? ORDER BY created_at DESC LIMIT 20').all(customerId);
    if (!discussions.length) return res.json({ suggestions: [] });
    const products = db.prepare('SELECT id,sku,name,category,details FROM products').all();
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 400,
      system: 'You are a sales assistant. Read discussion notes and identify products the customer is interested in. Return ONLY valid JSON, no markdown.',
      messages: [{ role: 'user', content: `Discussion notes:\n${discussions.map(d => '- ' + d.note).join('\n')}\n\nProduct catalog:\n${products.map(p => `[ID:${p.id}] SKU:${p.sku} - ${p.name} (${p.category}): ${(p.details||'').slice(0,80)}`).join('\n')}\n\nReturn JSON array (max 5) of products the customer seems interested in based on the notes. Format: [{"id":1,"name":"Product Name","sku":"123","reason":"why they want it"}]` }]
    });
    const match = msg.content[0].text.match(/\[[\s\S]*\]/);
    res.json({ suggestions: match ? JSON.parse(match[0]) : [] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── AI: customer summary ──────────────────────────────────────
app.post('/api/ai/customer-summary', async (req, res) => {
  try {
    const { customerId } = req.body;
    const c = db.prepare('SELECT * FROM customers_v2 WHERE id=?').get(customerId);
    if (!c) return res.status(404).json({ error: 'Not found' });
    const discs = db.prepare("SELECT note,type,created_at FROM discussions WHERE customer_id=? AND type!='activity' ORDER BY created_at DESC LIMIT 20").all(customerId);
    const ints = db.prepare('SELECT interest,quantity FROM customer_interests WHERE customer_id=?').all(customerId);
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 350,
      system: 'Write a concise CRM customer summary (max 120 words). Cover: who they are, what they need, their current status, product interests, and one clear recommended next action. Be professional and actionable.',
      messages: [{ role: 'user', content: `Name: ${c.name} | Company: ${c.company||'—'} | City: ${c.city||'—'} | Source: ${c.source||'—'}
Status: ${c.status} | Assigned: ${c.assigned_to} | Follow-up: ${c.next_followup||'not set'}
Requirement: ${c.requirement||'not specified'}
Products interested: ${ints.map(i=>i.interest+(i.quantity?' × '+i.quantity:'')).join('; ')||'none'}
Discussion notes (${discs.length}):
${discs.slice(0,8).map(d=>`• [${d.type}] ${d.note}`).join('\n')||'No notes yet'}

Write the summary:` }]
    });
    res.json({ summary: msg.content[0].text.trim() });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── AI: quick update from voice transcript ────────────────────
app.post('/api/ai/quick-update', async (req, res) => {
  try {
    const { transcript, customer, products } = req.body;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 700,
      system: 'You are a CRM assistant. Based on a voice note about a customer call, suggest updates. Return ONLY valid JSON, no markdown.',
      messages: [{ role: 'user', content: `Customer record: ${JSON.stringify({name:customer.name,status:customer.status,assigned_to:customer.assigned_to,requirement:customer.requirement,next_followup:customer.next_followup})}

Voice note: "${transcript}"

Available products (for product_interests): ${JSON.stringify((products||[]).slice(0,40).map(p=>({id:p.id,sku:p.sku,name:p.name,category:p.category})))}

Extract from the voice note and return JSON with ONLY the fields clearly mentioned:
{
  "status": "Lead|Contacted|Contacted but No Response|Onboarded",
  "next_followup": "YYYY-MM-DD",
  "requirement": "full requirement text",
  "note": "discussion note to add",
  "note_type": "call|note|meeting|message",
  "product_interests": [{"id": 1, "sku": "123", "name": "Product Name", "quantity": "100 pcs"}]
}
Omit any field not clearly mentioned in the transcript. Today is ${new Date().toISOString().slice(0,10)}.` }]
    });
    const match = msg.content[0].text.match(/\{[\s\S]*\}/);
    res.json(match ? JSON.parse(match[0]) : {});
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── AI: daily brief for team member ──────────────────────────────────
app.post('/api/ai/daily-brief', async (req, res) => {
  try {
    const { person } = req.body;
    if (!person) return res.status(400).json({ error: 'person required' });
    const today = new Date().toISOString().split('T')[0];
    const customers = db.prepare(`
      SELECT c.id, c.name, c.company, c.phone, c.status, c.next_followup, c.requirement,
        (SELECT note FROM discussions WHERE customer_id=c.id AND type!='activity' ORDER BY created_at DESC LIMIT 1) as last_note,
        (SELECT created_at FROM discussions WHERE customer_id=c.id AND type!='activity' ORDER BY created_at DESC LIMIT 1) as last_contact
      FROM customers_v2 c WHERE c.assigned_to=? ORDER BY c.next_followup ASC NULLS LAST
    `).all(person);
    const overdue   = customers.filter(c => c.next_followup && c.next_followup < today);
    const dueToday  = customers.filter(c => c.next_followup === today);
    const upcoming  = customers.filter(c => c.next_followup && c.next_followup > today);
    const noDate    = customers.filter(c => !c.next_followup && c.status !== 'Onboarded');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 900,
      system: `You are a sales coach writing a sharp daily briefing for ${person}. Be direct, specific, no fluff. Use short paragraphs. Today is ${today}.`,
      messages: [{ role: 'user', content: `Generate today's briefing for ${person}.

OVERDUE (${overdue.length}): ${overdue.slice(0,6).map(c=>`${c.name} [${c.status}, due ${c.next_followup}${c.last_note?', last note: '+c.last_note.slice(0,40):''}]`).join(' | ')}
DUE TODAY (${dueToday.length}): ${dueToday.map(c=>`${c.name} [${c.status}${c.requirement?', needs: '+c.requirement.slice(0,40):''}]`).join(' | ')}
UPCOMING THIS WEEK (${upcoming.filter(c=>c.next_followup<=(new Date(Date.now()+7*86400000).toISOString().slice(0,10))).length}): ${upcoming.slice(0,4).map(c=>`${c.name} [${c.next_followup}]`).join(' | ')}
NO FOLLOW-UP DATE (${noDate.length}): ${noDate.slice(0,5).map(c=>c.name).join(', ')}
TOTAL MANAGED: ${customers.length}

Write:
1. One opening line (today's overview, 1 sentence)
2. "TODAY'S PRIORITIES" — bullet list of specific actions (overdue first, then due today)
3. "THIS WEEK" — 2-3 lines about upcoming customers
4. "ATTENTION NEEDED" — flag customers with no follow-up date set (if any)
Keep it under 250 words. Be specific — use customer names.` }]
    });
    res.json({ brief: msg.content[0].text.trim(), stats: { total: customers.length, overdue: overdue.length, dueToday: dueToday.length, noDate: noDate.length } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── AI: Extract visiting card info ───────────────────────────────────
app.post('/api/ai/extract-card', async (req, res) => {
  try {
    const { imageBase64, mimeType, audioText } = req.body;
    if (!imageBase64 && !audioText) return res.status(400).json({ success: false, error: 'Provide image or audio text' });
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const content = [];
    if (imageBase64) {
      content.push({ type: 'image', source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: imageBase64 } });
    }
    let prompt = `Extract contact/customer details from this visiting card image.
Return ONLY a JSON object with these exact fields (use empty string "" if not found):
name, company, phone, email, city, state, gst_number, designation, website
No explanation, no markdown — just the raw JSON object.`;
    if (audioText) {
      prompt += `\n\nAdditional spoken notes from the user: "${audioText}"\nUse these to supplement missing fields. Put any extra context in a "notes" field.`;
    }
    if (!imageBase64 && audioText) {
      prompt = `Extract customer details from these spoken notes: "${audioText}"
Return ONLY a JSON object with: name, company, phone, email, city, state, gst_number, designation, website, notes
No explanation — just raw JSON.`;
    }
    content.push({ type: 'text', text: prompt });
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 400,
      messages: [{ role: 'user', content }]
    });
    const text = msg.content[0].text.trim();
    const match = text.match(/\{[\s\S]*\}/);
    const data = match ? JSON.parse(match[0]) : {};
    res.json({ success: true, data });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// WhatsApp Cloud API integration
// ══════════════════════════════════════════════════════════════════
const WA_TOKEN = process.env.WHATSAPP_TOKEN;
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const WA_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const WA_API = `https://graph.facebook.com/v21.0/${WA_PHONE_ID}/messages`;

// Normalize phone to last-10-digits for matching across formats (+91-..., 91..., 0..., spaces, dashes)
function waNorm(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.slice(-10);
}
function findCustomerByPhone(phone) {
  const norm = waNorm(phone);
  if (!norm) return null;
  const last10 = norm.slice(-10);
  const direct = db.prepare("SELECT id, name, phone FROM customers_v2 WHERE SUBSTR(REPLACE(phone,' ',''),-10) = ?").get(last10);
  if (direct) return direct;
  const fromPhones = db.prepare("SELECT cp.customer_id, c.name, c.phone FROM customer_phones cp JOIN customers_v2 c ON c.id=cp.customer_id WHERE SUBSTR(REPLACE(cp.phone,' ',''),-10) = ? LIMIT 1").get(last10);
  if (fromPhones) return { id: fromPhones.customer_id, name: fromPhones.name, phone: fromPhones.phone };
  return null;
}
function waToE164(phone) {
  // Build a "to" number for the Graph API: digits only, prefixed with 91 if it's a bare 10-digit Indian number
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return '91' + digits;
  return digits;
}

async function waApiCall(body) {
  const r = await fetch(WA_API, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || 'WhatsApp API error');
  return j;
}

// Upload a local file to Meta's media endpoint, returns a media id we can attach to a message
async function waUploadMedia(filePath, mimeType) {
  const buf = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('file', new Blob([buf], { type: mimeType }), path.basename(filePath));
  const r = await fetch(`https://graph.facebook.com/v21.0/${WA_PHONE_ID}/media`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${WA_TOKEN}` },
    body: form
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || 'Media upload failed');
  return j.id;
}

// Send an image / document / video / audio attachment (optionally with a caption)
app.post('/api/whatsapp/send-media', upload.single('file'), async (req, res) => {
  try {
    const { customerId, phone, caption, author } = req.body;
    if (!phone || !req.file) return res.status(400).json({ error: 'phone and file required' });
    const to = waToE164(phone);
    const mime = req.file.mimetype || 'application/octet-stream';
    let kind = 'document';
    if (mime.startsWith('image/')) kind = 'image';
    else if (mime.startsWith('video/')) kind = 'video';
    else if (mime.startsWith('audio/')) kind = 'audio';

    const mediaId = await waUploadMedia(req.file.path, mime);
    const payload = { messaging_product: 'whatsapp', to, type: kind };
    payload[kind] = { id: mediaId };
    if (caption && (kind === 'image' || kind === 'video' || kind === 'document')) payload[kind].caption = caption;
    if (kind === 'document') payload[kind].filename = req.file.originalname;

    const result = await waApiCall(payload);
    const waId = result.messages?.[0]?.id || '';
    const label = `[${kind}: ${req.file.originalname}]${caption ? ' ' + caption : ''}`;
    db.prepare(`INSERT INTO wa_messages (customer_id, phone, direction, body, msg_type, wa_msg_id, status, author) VALUES (?,?,?,?,?,?,?,?)`)
      .run(customerId || null, phone, 'out', label, kind, waId, 'sent', author || '');
    res.json({ success: true, wa_msg_id: waId });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Send a free-form text message (only works inside the 24-hour customer-service window)
app.post('/api/whatsapp/send', async (req, res) => {
  try {
    const { customerId, phone, text, author } = req.body;
    if (!phone || !text) return res.status(400).json({ error: 'phone and text required' });
    const to = waToE164(phone);
    const result = await waApiCall({
      messaging_product: 'whatsapp', to, type: 'text', text: { body: text }
    });
    const waId = result.messages?.[0]?.id || '';
    db.prepare(`INSERT INTO wa_messages (customer_id, phone, direction, body, msg_type, wa_msg_id, status, author) VALUES (?,?,?,?,?,?,?,?)`)
      .run(customerId || null, phone, 'out', text, 'text', waId, 'sent', author || '');
    res.json({ success: true, wa_msg_id: waId });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// Send a pre-approved template message (required for first contact / outside 24h window)
app.post('/api/whatsapp/send-template', async (req, res) => {
  try {
    const { customerId, phone, template, language, params, author } = req.body;
    if (!phone || !template) return res.status(400).json({ error: 'phone and template required' });
    const to = waToE164(phone);
    const components = (params && params.length) ? [{ type: 'body', parameters: params.map(p => ({ type: 'text', text: String(p) })) }] : [];
    const result = await waApiCall({
      messaging_product: 'whatsapp', to, type: 'template',
      template: { name: template, language: { code: language || 'en_US' }, components }
    });
    const waId = result.messages?.[0]?.id || '';
    db.prepare(`INSERT INTO wa_messages (customer_id, phone, direction, body, msg_type, wa_msg_id, status, author) VALUES (?,?,?,?,?,?,?,?)`)
      .run(customerId || null, phone, 'out', `[template: ${template}]`, 'template', waId, 'sent', author || '');
    res.json({ success: true, wa_msg_id: waId });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// Broadcast a template message to multiple customers
app.post('/api/whatsapp/broadcast', async (req, res) => {
  try {
    const { customerIds, template, language, paramsFn, author } = req.body;
    if (!Array.isArray(customerIds) || !customerIds.length || !template) {
      return res.status(400).json({ error: 'customerIds[] and template required' });
    }
    const results = [];
    for (const cid of customerIds) {
      const c = db.prepare('SELECT id,name,phone FROM customers_v2 WHERE id=?').get(cid);
      if (!c || !c.phone) { results.push({ id: cid, ok: false, error: 'no phone' }); continue; }
      try {
        const to = waToE164(c.phone);
        const params = paramsFn === 'name' ? [{ type: 'text', text: c.name }] : [];
        const result = await waApiCall({
          messaging_product: 'whatsapp', to, type: 'template',
          template: { name: template, language: { code: language || 'en_US' }, components: params.length ? [{ type: 'body', parameters: params }] : [] }
        });
        const waId = result.messages?.[0]?.id || '';
        db.prepare(`INSERT INTO wa_messages (customer_id, phone, direction, body, msg_type, wa_msg_id, status, author) VALUES (?,?,?,?,?,?,?,?)`)
          .run(c.id, c.phone, 'out', `[broadcast template: ${template}]`, 'template', waId, 'sent', author || '');
        results.push({ id: cid, ok: true });
      } catch(e) { results.push({ id: cid, ok: false, error: e.message }); }
      await new Promise(r => setTimeout(r, 250)); // light rate limiting
    }
    res.json({ success: true, results });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// Get chat history for a customer
app.get('/api/whatsapp/messages/:customerId', (req, res) => {
  const rows = db.prepare('SELECT * FROM wa_messages WHERE customer_id=? ORDER BY id ASC').all(req.params.customerId);
  res.json(rows);
});

// Get all conversations grouped by phone (for an inbox view)
app.get('/api/whatsapp/conversations', (req, res) => {
  const rows = db.prepare(`
    SELECT phone, customer_id, MAX(id) as last_id, COUNT(*) as msg_count
    FROM wa_messages GROUP BY phone ORDER BY last_id DESC
  `).all();
  const withLast = rows.map(r => {
    const last = db.prepare('SELECT * FROM wa_messages WHERE id=?').get(r.last_id);
    const cust = r.customer_id ? db.prepare('SELECT id,name,company FROM customers_v2 WHERE id=?').get(r.customer_id) : null;
    return { ...r, last_message: last, customer: cust };
  });
  res.json(withLast);
});

// Webhook verification (Meta calls this with GET when you set up the webhook URL)
app.get('/api/whatsapp/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === WA_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// Webhook receiver (Meta POSTs incoming messages + status updates here)
app.post('/api/whatsapp/webhook', async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    if (value?.messages) {
      for (const m of value.messages) {
        const fromPhone = m.from;
        let body = '';
        if (m.text?.body) { body = m.text.body; }
        else if (m.button?.text) { body = m.button.text; }
        else if (m.interactive?.button_reply?.title) { body = m.interactive.button_reply.title; }
        else if (m.image?.id || m.video?.id || m.document?.id || m.audio?.id) {
          const mediaId = m.image?.id || m.video?.id || m.document?.id || m.audio?.id;
          try {
            const urlR = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, { headers: { Authorization: `Bearer ${WA_TOKEN}` } });
            const urlJ = await urlR.json();
            if (urlJ.url) {
              const mediaR = await fetch(urlJ.url, { headers: { Authorization: `Bearer ${WA_TOKEN}` } });
              const buf = Buffer.from(await mediaR.arrayBuffer());
              let ext = '.bin';
              if (m.image) ext = '.jpg';
              else if (m.video) ext = '.mp4';
              else if (m.audio) ext = '.ogg';
              else if (m.document?.filename) ext = path.extname(m.document.filename) || '.pdf';
              else if (m.document?.mime_type) {
                if (m.document.mime_type.includes('pdf')) ext = '.pdf';
                else if (m.document.mime_type.includes('word') || m.document.mime_type.includes('doc')) ext = '.docx';
                else if (m.document.mime_type.includes('sheet') || m.document.mime_type.includes('xls')) ext = '.xlsx';
              }
              const fname = m.document?.filename ? `wa_${Date.now()}_${m.document.filename.replace(/[^a-zA-Z0-9._-]/g,'')}` : `wa_${Date.now()}${ext}`;
              fs.writeFileSync(path.join(uploadsDir, fname), buf);
              body = `/uploads/${fname}`;
            }
          } catch(e) { body = `[${m.type} - download failed]`; }
          if (m.image?.caption) body += '\n' + m.image.caption;
          if (m.video?.caption) body += '\n' + m.video.caption;
          if (m.document?.caption) body += '\n' + m.document.caption;
        } else { body = `[${m.type}]`; }
        let cust = findCustomerByPhone(fromPhone);
        if (!cust) {
          const clean = fromPhone.replace(/\D/g,'').slice(-10);
          const now = new Date();
          const autoName = 'WA-' + now.toLocaleDateString('en-IN',{day:'2-digit',month:'short'}) + '-' + now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:false}).replace(':','');
          const r = db.prepare("INSERT INTO customers_v2 (name,company,phone,status,source,customer_type,country) VALUES (?,?,?,?,?,?,?)")
            .run(autoName, '', clean, 'Lead', 'WhatsApp Inbound', 'Others', 'India');
          db.prepare("INSERT INTO customer_phones (customer_id, phone, label, is_primary) VALUES (?,?,?,1)").run(r.lastInsertRowid, clean, autoName);
          cust = { id: r.lastInsertRowid, name: autoName, phone: clean };
        }
        db.prepare(`INSERT INTO wa_messages (customer_id, phone, direction, body, msg_type, wa_msg_id, status, author) VALUES (?,?,?,?,?,?,?,?)`)
          .run(cust.id, fromPhone, 'in', body, m.type || 'text', m.id || '', 'received', '');
        try {
          const notifBody = `${cust.name}: ${body}`.slice(0, 200);
          db.prepare('INSERT INTO notifications (customer_id, type, body) VALUES (?,?,?)')
            .run(cust.id, 'wa_message', notifBody);
        } catch(e) {}
      }
    }
    if (value?.statuses) {
      for (const s of value.statuses) {
        db.prepare(`UPDATE wa_messages SET status=? WHERE wa_msg_id=?`).run(s.status, s.id);
      }
    }
    res.sendStatus(200);
  } catch(e) {
    console.log('WA webhook error:', e.message);
    res.sendStatus(200); // always 200 so Meta doesn't retry-storm
  }
});

// ══════════════════════════════════════════════════════════════════
// Instagram inbound (DMs + comments) — same shape as the WhatsApp
// webhook above: resolve contact, auto-create a Lead if unknown, log
// the message, raise a notification. No auto-reply — WhatsApp doesn't
// have one either yet, so this stays consistent with what's actually
// live rather than the aspirational "Claude auto-reply" in the plan.
// ══════════════════════════════════════════════════════════════════
const IG_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const IG_USER_ID = process.env.INSTAGRAM_USER_ID;
const IG_VERIFY_TOKEN = process.env.INSTAGRAM_VERIFY_TOKEN;
const IG_API = 'https://graph.instagram.com/v21.0'; // Instagram Login product, not graph.facebook.com

function findCustomerByInstagram(externalId) {
  if (!externalId) return null;
  const row = db.prepare(
    "SELECT c.id, c.name FROM customer_socials cs JOIN customers_v2 c ON c.id=cs.customer_id WHERE cs.platform='instagram' AND cs.external_id=? LIMIT 1"
  ).get(String(externalId));
  return row || null;
}

function findOrCreateCustomerByInstagram(externalId, handle) {
  let cust = findCustomerByInstagram(externalId);
  if (cust) return cust;
  const now = new Date();
  const autoName = handle
    ? '@' + handle
    : 'IG-' + now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + '-' + now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }).replace(':', '');
  const r = db.prepare("INSERT INTO customers_v2 (name,company,phone,status,source,customer_type,country) VALUES (?,?,?,?,?,?,?)")
    .run(autoName, '', '', 'Lead', 'Instagram Inbound', 'Others', '');
  db.prepare("INSERT INTO customer_socials (customer_id, platform, external_id, handle) VALUES (?,?,?,?)")
    .run(r.lastInsertRowid, 'instagram', String(externalId), handle || '');
  return { id: r.lastInsertRowid, name: autoName };
}

// Best-effort — Instagram only returns profile info for users who've messaged the account
async function igFetchUsername(externalId) {
  try {
    const r = await fetch(`${IG_API}/${externalId}?fields=username&access_token=${IG_TOKEN}`);
    const j = await r.json();
    return j.username || null;
  } catch (e) { return null; }
}

app.get('/api/instagram/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === IG_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

app.post('/api/instagram/webhook', async (req, res) => {
  try {
    const entries = req.body.entry || [];
    for (const entry of entries) {
      // DMs arrive as entry.messaging, same shape as Messenger
      for (const m of (entry.messaging || [])) {
        const senderId = m.sender?.id;
        if (!senderId || senderId === IG_USER_ID) continue; // skip echoes of our own sent messages
        const body = m.message?.text || (m.message?.attachments ? `[${m.message.attachments[0]?.type || 'attachment'}]` : '[unsupported]');
        const handle = await igFetchUsername(senderId);
        const cust = findOrCreateCustomerByInstagram(senderId, handle);
        db.prepare('INSERT INTO instagram_messages (customer_id, external_id, handle, direction, kind, body, ig_msg_id, author) VALUES (?,?,?,?,?,?,?,?)')
          .run(cust.id, senderId, handle || '', 'in', 'dm', body, m.message?.mid || '', '');
        try {
          const notifBody = `${cust.name} (IG DM): ${body}`.slice(0, 200);
          db.prepare('INSERT INTO notifications (customer_id, type, body) VALUES (?,?,?)').run(cust.id, 'ig_message', notifBody);
        } catch (e) {}
      }

      // Comments arrive as entry.changes with field "comments"
      for (const change of (entry.changes || [])) {
        if (change.field !== 'comments') continue;
        const value = change.value || {};
        const senderId = value.from?.id;
        if (!senderId || senderId === IG_USER_ID) continue;
        const handle = value.from?.username || null;
        const body = value.text || '';
        const cust = findOrCreateCustomerByInstagram(senderId, handle);
        db.prepare('INSERT INTO instagram_messages (customer_id, external_id, handle, direction, kind, body, ig_msg_id, author) VALUES (?,?,?,?,?,?,?,?)')
          .run(cust.id, senderId, handle || '', 'in', 'comment', body, value.id || '', '');
        try {
          const notifBody = `${cust.name} (IG comment): ${body}`.slice(0, 200);
          db.prepare('INSERT INTO notifications (customer_id, type, body) VALUES (?,?,?)').run(cust.id, 'ig_message', notifBody);
        } catch (e) {}
      }
    }
    res.sendStatus(200);
  } catch (e) {
    console.log('IG webhook error:', e.message);
    res.sendStatus(200); // always 200 so Meta doesn't retry-storm
  }
});

// ── Image rename to id_sku_category_name_N ───────────────────────────
app.post('/api/products/:id/rename-images', (req, res) => {
  try {
    const p = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
    if (!p) return res.status(404).json({ error: 'Not found' });
    const images = JSON.parse(p.images || '[]');
    const safeId = String(p.id);
    const safeSku = (p.sku || 'sku').replace(/[^a-zA-Z0-9]/g, '_');
    const safeCat = (p.category || 'cat').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20);
    const safeName = (p.name || 'product').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
    const newImages = images.map((oldFile, i) => {
      const ext = path.extname(oldFile).toLowerCase() || '.jpg';
      const newFile = `${safeId}_${safeSku}_${safeCat}_${safeName}_${i + 1}${ext}`;
      const oldPath = path.join(uploadsDir, oldFile);
      const newPath = path.join(uploadsDir, newFile);
      if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) fs.renameSync(oldPath, newPath);
      return fs.existsSync(newPath) ? newFile : oldFile;
    });
    db.prepare('UPDATE products SET images=? WHERE id=?').run(JSON.stringify(newImages), req.params.id);
    res.json({ success: true, images: newImages });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Download all product images as ZIP ───────────────────────
app.get('/api/download/images.zip', (req, res) => {
  try {
    const products = db.prepare('SELECT id, sku, category, name, images FROM products').all();
    const finalFiles = [];

    for (const p of products) {
      const imgs = JSON.parse(p.images || '[]');
      if (!imgs.length) continue;
      const safeId = String(p.id);
      const safeSku = (p.sku || 'sku').replace(/[^a-zA-Z0-9]/g, '_');
      const safeCat = (p.category || 'cat').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20);
      const safeName = (p.name || 'product').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
      const renamed = [];
      imgs.forEach((oldFile, i) => {
        const ext = path.extname(oldFile).toLowerCase() || '.jpg';
        const newFile = `${safeId}_${safeSku}_${safeCat}_${safeName}_${i + 1}${ext}`;
        const oldPath = path.join(uploadsDir, oldFile);
        const newPath = path.join(uploadsDir, newFile);
        if (!fs.existsSync(oldPath)) { renamed.push(null); return; }
        if (oldFile !== newFile && !fs.existsSync(newPath)) {
          try { fs.renameSync(oldPath, newPath); renamed.push(newFile); }
          catch(e) { renamed.push(oldFile); return; }
        } else {
          renamed.push(fs.existsSync(newPath) ? newFile : oldFile);
        }
      });
      // Update DB if any file was renamed
      const cleanRenamed = renamed.filter(Boolean);
      if (JSON.stringify(cleanRenamed) !== JSON.stringify(imgs)) {
        db.prepare('UPDATE products SET images=? WHERE id=?').run(JSON.stringify(cleanRenamed), p.id);
      }
      cleanRenamed.forEach(f => { if (fs.existsSync(path.join(uploadsDir, f))) finalFiles.push(f); });
    }

    if (!finalFiles.length) return res.status(404).json({ error: 'No product images found' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="product-images.zip"');
    const { spawn } = require('child_process');
    const zip = spawn('zip', ['-j', '-', ...finalFiles], { cwd: uploadsDir });
    zip.stdout.pipe(res);
    zip.stderr.on('data', () => {});
    zip.on('error', () => res.status(500).end());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Proforma Invoice ──────────────────────────────────────────
const COMPANY = {
  name: 'SWASTIK METAL COMPONENTS',
  gstin: '09ARLPG4112H1ZY',
  address: 'PLOT NO- 366, UDYOG KENDRA 2nd, ECOTECH 3rd, GRATER NOIDA, GAUTAM BUDDHA NAGAR, UP- 201306',
  stateCode: '9'
};

app.get('/api/crm/customers/:id/invoices', (req, res) => {
  const rows = db.prepare('SELECT * FROM proforma_invoices WHERE customer_id=? ORDER BY created_at DESC').all(req.params.id);
  res.json(rows);
});

app.post('/api/crm/customers/:id/invoices', (req, res) => {
  const cid = req.params.id;
  const c = db.prepare('SELECT * FROM customers_v2 WHERE id=?').get(cid);
  if (!c) return res.status(404).json({ error: 'Customer not found' });
  const { items, freight, pf, remarks } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'At least one item required' });
  const taxableTotal = items.reduce((s, it) => s + (parseFloat(it.taxable) || 0), 0);
  const totalFreight = parseFloat(freight) || 0;
  const totalPF = parseFloat(pf) || 0;
  const tax = taxableTotal * 0.18;
  const total = taxableTotal + totalFreight + totalPF + tax;
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).replace(/:/g, '_').replace(' ', '_');
  const safeName = (c.name || 'Customer').replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_');
  const filename = `${safeName}_${dateStr}_${timeStr}.pdf`;
  const r = db.prepare('INSERT INTO proforma_invoices (customer_id, filename, items, freight, pf, remarks, total) VALUES (?,?,?,?,?,?,?)')
    .run(cid, filename, JSON.stringify(items), totalFreight, totalPF, remarks || '', total);
  res.json({ success: true, id: r.lastInsertRowid, filename });
});

app.delete('/api/crm/invoices/:id', (req, res) => {
  const { password } = req.body || {};
  const admin = db.prepare("SELECT password FROM team_members WHERE role='admin' LIMIT 1").get();
  const loginPw = process.env.ADMIN_PASSWORD || (admin && admin.password) || 'admin';
  if (password !== loginPw) return res.status(403).json({ error: 'Wrong admin password' });
  db.prepare('DELETE FROM proforma_invoices WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/crm/invoices/:id/pdf', (req, res) => {
  const inv = db.prepare('SELECT * FROM proforma_invoices WHERE id=?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  const c = db.prepare('SELECT * FROM customers_v2 WHERE id=?').get(inv.customer_id);
  if (!c) return res.status(404).json({ error: 'Customer not found' });
  const items = JSON.parse(inv.items || '[]');
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${inv.filename}"`);
  doc.pipe(res);
  const W = doc.page.width - 80;
  const LX = 40;
  const invDate = new Date(inv.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');

  // Logo banner
  doc.rect(LX, 30, W, 60).fill('#111827');
  doc.rect(LX, 86, W, 3).fill('#4f7df5');
  doc.font('Helvetica-Bold').fontSize(26).fillColor('#ffffff').text('AR', LX + 20, 40, { continued: true });
  doc.fillColor('#4f7df5').text('/', { continued: true });
  doc.fillColor('#ffffff').text('AMBHIKA', { continued: false });
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#94a3b8').text('E N A B L E R S', LX + 20, 70);
  doc.font('Helvetica').fontSize(8).fillColor('#cbd5e1').text('Nickel & Copper Battery Connectors: Mfg. & Dist.', LX + W - 260, 72, { width: 250, align: 'right' });
  doc.fillColor('#000');

  // Title + Date
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#111827').text('PROFORMA INVOICE', LX, 100, { align: 'center', width: W });
  doc.font('Helvetica').fontSize(10).fillColor('#000').text(`Date: ${invDate}`, LX + W - 180, 100, { width: 180, align: 'right' });

  // Header table
  const HY = 125;
  const HW = W / 2;
  doc.rect(LX, HY, W, 120).stroke();
  doc.moveTo(LX + HW, HY).lineTo(LX + HW, HY + 120).stroke();

  doc.font('Helvetica-Bold').fontSize(9).fillColor('#000').text('Consignee (Ship to)', LX + HW, HY - 12, { width: HW, align: 'right' });

  let ly = HY + 8;
  const lbl = (label, val, y) => {
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#000').text(label, LX + 5, y, { width: 65 });
    doc.font('Helvetica').fontSize(8).text(val, LX + 72, y, { width: HW - 82 });
  };
  lbl('GSTIN :', COMPANY.gstin, ly); ly += 14;
  lbl('NAME :', COMPANY.name, ly); ly += 14;
  lbl('ADDRESS :', COMPANY.address, ly); ly += 36;
  lbl('STATE CODE', COMPANY.stateCode, ly);

  let ry = HY + 8;
  const rlbl = (label, val, y) => {
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#000').text(label, LX + HW + 5, y, { width: 85 });
    doc.font('Helvetica').fontSize(8).text(val || '', LX + HW + 92, y, { width: HW - 102 });
  };
  rlbl('GSTIN :', c.gst_number || '', ry); ry += 14;
  rlbl('NAME :', c.name || '', ry); ry += 14;
  rlbl('ADDRESS :', [c.city, c.state].filter(Boolean).join(', ') || '', ry); ry += 28;
  const custStateCode = (c.state || '').split('-')[0].trim();
  const custStateName = (c.state || '').split('-').slice(1).join('-').trim();
  rlbl('STATE CODE', custStateCode + (custStateName ? ' - ' + custStateName : ''), ry); ry += 14;
  rlbl('CONTACT PERSON :', c.name || '', ry); ry += 14;
  rlbl('CONTACT NO :', c.phone || '', ry);

  // Items table — no width/thickness/grade
  let TY = HY + 135;
  const cols = [
    { label: 'Sr', w: 25 }, { label: 'SKU', w: 50 }, { label: 'HSN CODE', w: 65 }, { label: 'DESCRIPTION OF GOODS', w: 150 },
    { label: 'QTY', w: 40 }, { label: 'PER KG\nRATE', w: 60 }, { label: 'P&F/\nFREIGHT', w: 55 },
    { label: 'TAXABLE\nVALUE', w: 65 }, { label: 'IGST %', w: 40 }, { label: 'Date', w: 55 }
  ];
  const totalColW = cols.reduce((s, c) => s + c.w, 0);
  const scale = W / totalColW;
  cols.forEach(c => c.w = Math.round(c.w * scale));

  doc.rect(LX, TY, W, 28).fillAndStroke('#f0f0f0', '#000');
  let cx = LX;
  cols.forEach(col => {
    doc.fillColor('#000').font('Helvetica-Bold').fontSize(7).text(col.label, cx + 2, TY + 4, { width: col.w - 4, align: 'center' });
    cx += col.w;
  });
  TY += 28;

  items.forEach((it, i) => {
    const rh = 22;
    doc.rect(LX, TY, W, rh).stroke();
    cx = LX;
    const vals = [
      i + 1, it.sku || '', it.hsn || '85079090', it.description || '',
      it.qty || '', parseFloat(it.rate || 0).toFixed(2),
      parseFloat(it.pf_freight || 0).toFixed(2), parseFloat(it.taxable || 0).toFixed(2),
      it.igst || '18', invDate
    ];
    vals.forEach((v, j) => {
      doc.font('Helvetica').fontSize(7).fillColor('#000').text(String(v), cx + 2, TY + 5, { width: cols[j].w - 4, align: 'center' });
      cx += cols[j].w;
    });
    TY += rh;
  });

  // Totals
  const taxableTotal = items.reduce((s, it) => s + (parseFloat(it.taxable) || 0), 0);
  const totalFreight = inv.freight || 0;
  const totalPF = inv.pf || 0;
  const tax = taxableTotal * 0.18;
  const grandTotal = taxableTotal + totalFreight + totalPF + tax;

  const totals = [
    ['TOTAL TAXABLE VALUE', taxableTotal.toFixed(2)],
    ['FREIGHT', totalFreight.toFixed(2)],
    ['TOTAL P and F', totalPF.toFixed(2)],
    ['TAX-18%', tax.toFixed(2)],
    ['TOTAL', grandTotal.toFixed(2)]
  ];
  totals.forEach(([label, val]) => {
    doc.rect(LX, TY, W, 18).stroke();
    doc.font(label === 'TOTAL' ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor('#000');
    doc.text(label, LX + 5, TY + 4, { width: W - 70 });
    doc.text(val, LX + W - 65, TY + 4, { width: 60, align: 'right' });
    TY += 18;
  });

  // Remarks & Signature
  TY += 10;
  doc.rect(LX, TY, W / 2, 80).stroke();
  doc.rect(LX + W / 2, TY, W / 2, 80).stroke();
  doc.font('Helvetica-Bold').fontSize(9).text('REMARKS :', LX + 8, TY + 8);
  doc.font('Helvetica').fontSize(8).text(inv.remarks || '', LX + 8, TY + 24, { width: W / 2 - 20 });
  doc.font('Helvetica-Bold').fontSize(9).text('FOR SWASTIK METAL COMPONENTS', LX + W / 2 + 10, TY + 8);
  doc.font('Helvetica-Bold').fontSize(9).text('AUTHORIZED SIGNATORY', LX + W / 2 + 10, TY + 58);

  doc.end();
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`Arambhika Enablers running on http://localhost:${PORT}`));
