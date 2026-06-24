const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const JWT_SECRET = 'chatwave-secret-key-change-in-production';

let db;

async function getDb() {
  if (!db) {
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs();
    db = new SQL.Database();

    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        avatar TEXT DEFAULT '',
        status TEXT DEFAULT 'Hey there! I am using ChatWave',
        online INTEGER DEFAULT 0,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL DEFAULT 'direct',
        name TEXT DEFAULT '',
        avatar TEXT DEFAULT '',
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS conversation_members (
        conversation_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT DEFAULT 'member',
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (conversation_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        content TEXT NOT NULL,
        type TEXT DEFAULT 'text',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS message_reads (
        message_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (message_id, user_id)
      );
    `);
  }
  return db;
}

function generateToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function getUser(req) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return null;
  return verifyToken(token);
}

function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(db, sql, params = []) {
  return queryAll(db, sql, params)[0] || null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const db = await getDb();
    const { url, method } = req;

    if (url === '/api/auth/register' && method === 'POST') {
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
      if (username.length < 3 || username.length > 20) return res.status(400).json({ error: 'Username must be 3-20 characters' });
      if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });

      const existing = queryOne(db, 'SELECT id FROM users WHERE username = ?', [username]);
      if (existing) return res.status(400).json({ error: 'Username already taken' });

      const id = uuidv4();
      const hashedPassword = bcrypt.hashSync(password, 10);
      const colors = ['FF6B6B', '4ECDC4', '45B7D1', '96CEB4', 'FFEAA7', 'DDA0DD', '98D8C8', 'F7DC6F'];
      const color = colors[Math.floor(Math.random() * colors.length)];

      db.run('INSERT INTO users (id, username, password, avatar) VALUES (?, ?, ?, ?)', [id, username, hashedPassword, color]);
      const user = queryOne(db, 'SELECT id, username, avatar, status, online, created_at FROM users WHERE id = ?', [id]);
      const token = generateToken(user);
      return res.json({ token, user });
    }

    if (url === '/api/auth/login' && method === 'POST') {
      const { username, password } = req.body;
      const user = queryOne(db, 'SELECT * FROM users WHERE username = ?', [username]);
      if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const token = generateToken(user);
      const { password: _, ...userData } = user;
      return res.json({ token, user: userData });
    }

    if (url === '/api/auth/me' && method === 'GET') {
      const decoded = getUser(req);
      if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
      const user = queryOne(db, 'SELECT id, username, avatar, status, online, created_at FROM users WHERE id = ?', [decoded.id]);
      return res.json(user);
    }

    if (url === '/api/users' && method === 'GET') {
      const decoded = getUser(req);
      if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
      const users = queryAll(db, 'SELECT id, username, avatar, status, online, last_seen FROM users WHERE id != ?', [decoded.id]);
      return res.json(users);
    }

    if (url === '/api/conversations' && method === 'GET') {
      const decoded = getUser(req);
      if (!decoded) return res.status(401).json({ error: 'Unauthorized' });

      const conversations = queryAll(db, `
        SELECT c.*, cm.role FROM conversations c
        JOIN conversation_members cm ON c.id = cm.conversation_id
        WHERE cm.user_id = ?
      `, [decoded.id]);

      const enriched = conversations.map(conv => {
        const members = queryAll(db, `
          SELECT u.id, u.username, u.avatar, u.online, u.last_seen
          FROM conversation_members cm JOIN users u ON cm.user_id = u.id
          WHERE cm.conversation_id = ?
        `, [conv.id]);

        const lastMsg = queryOne(db, `
          SELECT content, created_at, sender_id FROM messages
          WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1
        `, [conv.id]);

        const unread = queryOne(db, `
          SELECT COUNT(*) as count FROM messages m
          WHERE m.conversation_id = ? AND m.sender_id != ?
          AND NOT EXISTS (SELECT 1 FROM message_reads mr WHERE mr.message_id = m.id AND mr.user_id = ?)
        `, [conv.id, decoded.id, decoded.id]);

        let name = conv.name, avatar = conv.avatar;
        if (conv.type === 'direct') {
          const other = members.find(m => m.id !== decoded.id);
          if (other) { name = other.username; avatar = other.avatar; }
        }

        return { ...conv, members, name, avatar, unread: unread?.count || 0, last_message: lastMsg?.content, last_message_at: lastMsg?.created_at, last_message_sender: lastMsg?.sender_id };
      });

      enriched.sort((a, b) => (!a.last_message_at ? 1 : !b.last_message_at ? -1 : new Date(b.last_message_at) - new Date(a.last_message_at)));
      return res.json(enriched);
    }

    if (url === '/api/conversations' && method === 'POST') {
      const decoded = getUser(req);
      if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
      const { type = 'direct', memberIds = [], name = '' } = req.body;
      const id = uuidv4();

      if (type === 'direct' && memberIds.length === 1) {
        const existing = queryOne(db, `SELECT c.id FROM conversations c JOIN conversation_members cm1 ON c.id = cm1.conversation_id AND cm1.user_id = ? JOIN conversation_members cm2 ON c.id = cm2.conversation_id AND cm2.user_id = ? WHERE c.type = 'direct'`, [decoded.id, memberIds[0]]);
        if (existing) return res.json({ id: existing.id });
      }

      db.run('INSERT INTO conversations (id, type, name, created_by) VALUES (?, ?, ?, ?)', [id, type, name, decoded.id]);
      db.run('INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?)', [id, decoded.id, 'admin']);
      for (const memberId of memberIds) db.run('INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)', [id, memberId]);
      return res.json({ id });
    }

    if (url?.match(/^\/api\/conversations\/[^/]+\/messages$/)) {
      const decoded = getUser(req);
      if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
      const convId = url.split('/')[3];

      if (method === 'GET') {
        const messages = queryAll(db, `SELECT m.*, u.username as sender_name, u.avatar as sender_avatar FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.conversation_id = ? ORDER BY m.created_at DESC LIMIT 50`, [convId]);
        const enriched = messages.map(msg => ({ ...msg, reads: queryAll(db, `SELECT u.id, u.username, mr.read_at FROM message_reads mr JOIN users u ON mr.user_id = u.id WHERE mr.message_id = ?`, [msg.id]) }));
        return res.json(enriched.reverse());
      }

      if (method === 'POST') {
        const { content, type = 'text' } = req.body;
        const id = uuidv4();
        db.run('INSERT INTO messages (id, conversation_id, sender_id, content, type) VALUES (?, ?, ?, ?, ?)', [id, convId, decoded.id, content, type]);
        db.run('INSERT OR IGNORE INTO message_reads (message_id, user_id) VALUES (?, ?)', [id, decoded.id]);
        const message = queryOne(db, `SELECT m.*, u.username as sender_name, u.avatar as sender_avatar FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.id = ?`, [id]);
        const reads = queryAll(db, `SELECT u.id, u.username, mr.read_at FROM message_reads mr JOIN users u ON mr.user_id = u.id WHERE mr.message_id = ?`, [id]);
        return res.json({ ...message, reads });
      }
    }

    if (url?.match(/^\/api\/poll\/[^/]+/)) {
      const decoded = getUser(req);
      if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
      const convId = url.split('/')[3]?.split('?')[0];
      const sinceMatch = url.match(/since=([^&]+)/);
      const since = sinceMatch ? decodeURIComponent(sinceMatch[1]) : null;

      let sql = `SELECT m.*, u.username as sender_name, u.avatar as sender_avatar FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.conversation_id = ?`;
      const params = [convId];
      if (since) { sql += ' AND m.created_at > ?'; params.push(since); }
      sql += ' ORDER BY m.created_at ASC LIMIT 50';
      return res.json(queryAll(db, sql, params));
    }

    if (url?.match(/^\/api\/read\/[^/]+/) && method === 'POST') {
      const decoded = getUser(req);
      if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
      const { messageIds } = req.body;
      for (const msgId of messageIds) db.run('INSERT OR IGNORE INTO message_reads (message_id, user_id) VALUES (?, ?)', [msgId, decoded.id]);
      return res.json({ ok: true });
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    console.error('API Error:', err);
    return res.status(500).json({ error: err.message });
  }
}