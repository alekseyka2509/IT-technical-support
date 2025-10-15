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

function normalizePhone(phone) {
  if (!phone) return null;
  // Убираем все символы кроме цифр
  const digits = phone.replace(/\D/g, '');
  // Если номер начинается с 8, заменяем на 7
  if (digits.startsWith('8') && digits.length === 11) {
    return '7' + digits.slice(1);
  }
  // Если номер начинается с 7 и имеет 11 цифр, возвращаем как есть
  if (digits.startsWith('7') && digits.length === 11) {
    return digits;
  }
  // Если номер имеет 10 цифр, добавляем 7 в начало
  if (digits.length === 10) {
    return '7' + digits;
  }
  // Возвращаем как есть, если не можем нормализовать
  return digits;
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
      role TEXT DEFAULT 'user',
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

  // Ensure role column exists (for existing databases without role)
  const cols = await db.all("PRAGMA table_info(users)");
  const hasRole = cols.some(c => c.name === 'role');
  if (!hasRole) {
    await db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
  }

  // Seed admin user if not exists
  const adminEmail = 'it-support@example.com';
  const adminPass = 'It-support1234';
  const admin = await db.get('SELECT id FROM users WHERE lower(email) = ?', [adminEmail]);
  if (!admin) {
    const salt = generateSalt();
    const hash = hashPassword(adminPass, salt);
    await db.run(
      'INSERT INTO users (full_name, email, password_hash, password_salt, role, plan) VALUES (?, ?, ?, ?, ?, ?)',
      ['Администратор', adminEmail, hash, salt, 'admin', null]
    );
  } else {
    // Ensure role is admin and reset password to known admin password; normalize email to lowercase
    const salt = generateSalt();
    const hash = hashPassword(adminPass, salt);
    await db.run('UPDATE users SET role = ?, password_hash = ?, password_salt = ?, email = ? WHERE id = ?', ['admin', hash, salt, adminEmail, admin.id]);
  }
}

function requireAuth(req, res, next) {
  const sessionId = req.cookies['sid'];
  if (!sessionId) return res.status(401).json({ error: 'unauthorized' });
  const session = sessions.get(sessionId);
  if (!session) return res.status(401).json({ error: 'unauthorized' });
  req.userId = session.userId;
  next();
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, async () => {
    try {
      const user = await db.get('SELECT role FROM users WHERE id = ?', [req.userId]);
      if (!user || user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
      next();
    } catch (_) {
      return res.status(500).json({ error: 'server_error' });
    }
  });
}

// Auth routes
app.post('/api/register', async (req, res) => {
  try {
    const { FIO, email, pass } = req.body;
    if (!FIO || !email || !pass) return res.status(400).json({ error: 'missing_fields' });
    const emailLc = String(email).toLowerCase();
    const salt = generateSalt();
    const hash = hashPassword(pass, salt);
    const result = await db.run(
      'INSERT INTO users (full_name, email, password_hash, password_salt) VALUES (?, ?, ?, ?)',
      [FIO, emailLc, hash, salt]
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
    const loginLc = String(login).toLowerCase();
    const user = await db.get('SELECT * FROM users WHERE lower(email) = ?', [loginLc]);
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
  const user = await db.get('SELECT id, full_name, email, phone, city, plan, role, created_at FROM users WHERE id = ?', [req.userId]);
  res.json({ user });
});

app.put('/api/me', requireAuth, async (req, res) => {
  try {
    const { full_name, phone, city } = req.body;
    
    // Проверяем уникальность номера телефона, если он указан
    if (phone && phone.trim() !== '') {
      const normalizedPhone = normalizePhone(phone.trim());
      console.log(`Проверяем телефон: "${phone}" -> нормализованный: "${normalizedPhone}" для пользователя ${req.userId}`);
      
      if (normalizedPhone) {
        const existingUser = await db.get('SELECT id, phone FROM users WHERE phone = ? AND id != ?', [normalizedPhone, req.userId]);
        if (existingUser) {
          console.log(`Найден существующий пользователь с ID ${existingUser.id} и телефоном ${existingUser.phone}`);
          return res.status(409).json({ error: 'phone_exists' });
        }
      }
    }
    
    const phoneToSave = phone ? normalizePhone(phone.trim()) : null;
    await db.run('UPDATE users SET full_name = ?, phone = ?, city = ? WHERE id = ?', [full_name || null, phoneToSave, city || null, req.userId]);
    console.log(`Обновлен профиль пользователя ${req.userId}: phone="${phone}" -> сохранен как "${phoneToSave}"`);
    res.json({ ok: true });
  } catch (e) {
    console.error('Ошибка при обновлении профиля:', e);
    res.status(500).json({ error: 'server_error' });
  }
});

// Admin APIs
const ALLOWED_PLANS = ['Базовый', 'Стандарт', 'Премиум'];

app.get('/api/admin/users', requireAdmin, async (_req, res) => {
  const rows = await db.all('SELECT id, full_name, email, phone, city, plan, role, created_at FROM users ORDER BY created_at DESC');
  res.json({ users: rows });
});

app.put('/api/admin/users/:id/plan', requireAdmin, async (req, res) => {
  const userId = Number(req.params.id);
  const { plan } = req.body || {};
  let normalizedPlan = null;
  if (typeof plan === 'string') {
    const trimmed = plan.trim();
    normalizedPlan = (trimmed === '' || trimmed.toLowerCase() === 'нет тарифа') ? null : trimmed;
  } else if (plan != null) {
    normalizedPlan = plan;
  }
  if (normalizedPlan !== null && !ALLOWED_PLANS.includes(normalizedPlan)) return res.status(400).json({ error: 'invalid_plan' });
  await db.run('UPDATE users SET plan = ? WHERE id = ?', [normalizedPlan, userId]);
  res.json({ ok: true });
});

// Update full user (admin)
app.put('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    let { full_name, email, phone, city, plan } = req.body || {};
    if (email != null) email = String(email).toLowerCase();
    let normalizedPlan = null;
    if (typeof plan === 'string') {
      const trimmed = plan.trim();
      normalizedPlan = (trimmed === '' || trimmed.toLowerCase() === 'нет тарифа') ? null : trimmed;
    } else if (plan != null) {
      normalizedPlan = plan;
    }
    if (normalizedPlan !== null && !ALLOWED_PLANS.includes(normalizedPlan)) return res.status(400).json({ error: 'invalid_plan' });

    // Проверяем уникальность номера телефона, если он указан
    if (phone && phone.trim() !== '') {
      const normalizedPhone = normalizePhone(phone.trim());
      console.log(`Админ проверяет телефон: "${phone}" -> нормализованный: "${normalizedPhone}" для пользователя ${userId}`);
      
      if (normalizedPhone) {
        const existingUser = await db.get('SELECT id, phone FROM users WHERE phone = ? AND id != ?', [normalizedPhone, userId]);
        if (existingUser) {
          console.log(`Админ: найден существующий пользователь с ID ${existingUser.id} и телефоном ${existingUser.phone}`);
          return res.status(409).json({ error: 'phone_exists' });
        }
      }
    }

    // Build dynamic update
    const fields = [];
    const params = [];
    if (typeof full_name !== 'undefined') { fields.push('full_name = ?'); params.push(full_name || null); }
    if (typeof email !== 'undefined') { fields.push('email = ?'); params.push(email || null); }
    if (typeof phone !== 'undefined') { 
      const phoneToSave = phone ? normalizePhone(phone.trim()) : null;
      fields.push('phone = ?'); 
      params.push(phoneToSave); 
    }
    if (typeof city !== 'undefined') { fields.push('city = ?'); params.push(city || null); }
    if (typeof plan !== 'undefined') { fields.push('plan = ?'); params.push(normalizedPlan); }
    if (!fields.length) return res.status(400).json({ error: 'nothing_to_update' });
    params.push(userId);

    await db.run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);
    res.json({ ok: true });
  } catch (e) {
    if (e && e.message && e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'email_exists' });
    }
    res.status(500).json({ error: 'server_error' });
  }
});

app.get('/api/admin/callbacks', requireAdmin, async (_req, res) => {
  const rows = await db.all('SELECT id, name, phone, created_at FROM callbacks ORDER BY created_at DESC');
  res.json({ callbacks: rows });
});

app.get('/api/admin/reviews', requireAdmin, async (_req, res) => {
  const rows = await db.all('SELECT id, name, position, company, message, rating, created_at FROM reviews ORDER BY created_at DESC');
  res.json({ reviews: rows });
});

app.delete('/api/admin/reviews/:id', requireAdmin, async (req, res) => {
  const reviewId = Number(req.params.id);
  await db.run('DELETE FROM reviews WHERE id = ?', [reviewId]);
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



