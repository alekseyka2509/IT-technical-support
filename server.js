// Lightweight Express server with SQLite for auth, reviews, and callbacks
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));

let db;

function hashPassword(password, salt) {
  return crypto
    .pbkdf2Sync(password, salt, 310000, 32, 'sha256')
    .toString('hex');
}

function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function genSessionId() {
  return crypto.randomBytes(24).toString('hex');
}

const sessions = new Map(); // sessionId -> { userId, createdAt }

async function initDb() {
  db = await open({
    filename: path.join(__dirname, 'database.sqlite'),
    driver: sqlite3.Database,
  });

  await db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      phone TEXT,
      city TEXT,
      plan TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      position TEXT,
      company TEXT,
      message TEXT NOT NULL,
      rating INTEGER CHECK(rating BETWEEN 1 AND 5) NOT NULL,
      user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS callbacks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function requireAuth(req, res, next) {
  const sessionId = req.cookies['sid'];
  if (!sessionId) return res.status(401).json({ error: 'unauthorized' });
  const session = sessions.get(sessionId);
  if (!session) return res.status(401).json({ error: 'unauthorized' });
  req.userId = session.userId;
  next();
}

// Auth routes
app.post('/api/register', async (req, res) => {
  try {
    const { FIO, email, pass } = req.body;
    if (!FIO || !email || !pass) return res.status(400).json({ error: 'missing_fields' });
    const salt = generateSalt();
    const hash = hashPassword(pass, salt);
    const result = await db.run(
      'INSERT INTO users (full_name, email, password_hash, password_salt) VALUES (?, ?, ?, ?)',
      [FIO, email, hash, salt]
    );
    const userId = result.lastID;
    const sid = genSessionId();
    sessions.set(sid, { userId, createdAt: Date.now() });
    res.cookie('sid', sid, { httpOnly: true, sameSite: 'lax' });
    res.json({ ok: true });
  } catch (e) {
    if (e && e.message && e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'email_exists' });
    }
    res.status(500).json({ error: 'server_error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { login, pass } = req.body;
    if (!login || !pass) return res.status(400).json({ error: 'missing_fields' });
    const user = await db.get('SELECT * FROM users WHERE email = ?', [login]);
    if (!user) return res.status(401).json({ error: 'invalid_credentials' });
    const hash = hashPassword(pass, user.password_salt);
    if (hash !== user.password_hash) return res.status(401).json({ error: 'invalid_credentials' });
    const sid = genSessionId();
    sessions.set(sid, { userId: user.id, createdAt: Date.now() });
    res.cookie('sid', sid, { httpOnly: true, sameSite: 'lax' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'server_error' });
  }
});

app.post('/api/logout', (req, res) => {
  const sid = req.cookies['sid'];
  if (sid) sessions.delete(sid);
  res.clearCookie('sid');
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, async (req, res) => {
  const user = await db.get('SELECT id, full_name, email, phone, city, plan, created_at FROM users WHERE id = ?', [req.userId]);
  res.json({ user });
});

app.put('/api/me', requireAuth, async (req, res) => {
  const { full_name, phone, city, plan } = req.body;
  await db.run('UPDATE users SET full_name = ?, phone = ?, city = ?, plan = ? WHERE id = ?', [full_name || null, phone || null, city || null, plan || null, req.userId]);
  res.json({ ok: true });
});

// Reviews
app.post('/api/reviews', async (req, res) => {
  try {
    const { name, position, company, message, rating } = req.body;
    if (!name || !message || !rating) return res.status(400).json({ error: 'missing_fields' });
    await db.run(
      'INSERT INTO reviews (name, position, company, message, rating, user_id) VALUES (?, ?, ?, ?, ?, NULL)',
      [name, position || null, company || null, message, Number(rating)]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'server_error' });
  }
});

app.get('/api/reviews', async (req, res) => {
  const rows = await db.all('SELECT id, name, position, company, message, rating, created_at FROM reviews ORDER BY created_at DESC');
  res.json({ reviews: rows });
});

// Callbacks (contact form)
app.post('/api/callbacks', async (req, res) => {
  try {
    const { name, phone } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'missing_fields' });
    await db.run('INSERT INTO callbacks (name, phone) VALUES (?, ?)', [name, phone]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'server_error' });
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Server started on http://localhost:${PORT}`);
  });
});


