import initSqlJs from 'sql.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const JWT_SECRET = 'chatwave-secret-key-change-in-production';

let db;

async function getDb() {
  if (!db) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const wasmBuffer = await readFile(join(__dirname, '../node_modules/sql.js/dist/sql-wasm.wasm'));
    const SQL = await initSqlJs({ wasmBinary: wasmBuffer });
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
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

function getUser(req) {
  const token = req.headers.authorization?.split(' ')[1];
  return token ? verifyToken(token) : null;
}

function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const results = [];
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

function queryOne(db, sql, params = []) {
  return queryAll(db, sql, params)[0] || null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

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
      const colors = ['FF6B6B','4ECDC4','45B7D1','96CEB4','FFEAA7','DDA0DD','98D8C8','F7DC6F'];
      const color = colors[Math.floor(Math.random() * colors.length)];

      db.run('INSERT INTO users (id, username, password, avatar) VALUES (?, ?, ?, ?)', [id, username, hashedPassword, color]);
      const user = queryOne(db, 'SELECT id, username, avatar, status, online, created_at FROM users WHERE id = ?', [id]);
      return res.json({ token: generateToken(user), user });
    }

    if (url === '/api/auth/login' && method === 'POST') {
      const { username, password } = req.body;
      const user = queryOne(db, 'SELECT * FROM users WHERE username = ?', [username]);
      if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Invalid credentials' });
      const token = generateToken(user);
      const { password: _, ...userData } = user;
      return res.json({ token, user: userData });
    }

    if (url === '/api/auth/me' && method === 'GET') {
      const decoded = getUser(req);
      if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
      return res.json(queryOne(db, 'SELECT id, username, avatar, status, online, created_at FROM users WHERE id = ?', [decoded.id]));
    }

    if (url === '/api/users' && method === 'GET') {
      const decoded = getUser(req);
      if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
      return res.json(queryAll(db, 'SELECT id, username, avatar, status, online, last_seen FROM users WHERE id != ?', [decoded.id]));
    }

    if (url === '/api/conversations' && method === 'GET') {
      const decoded = getUser(req);
      if (!decoded) return res.status(401).json({ error: 'Unauthorized' });

      const conversations = queryAll(db, 'SELECT c.*, cm.role FROM conversations c JOIN conversation_members cm ON c.id = cm.conversation_id WHERE cm.user_id = ?', [decoded.id]);

      return res.json(conversations.map(conv => {
        const members = queryAll(db, 'SELECT u.id, u.username, u.avatar, u.online, u.last_seen FROM conversation_members cm JOIN users u ON cm.user_id = u.id WHERE cm.conversation_id = ?', [conv.id]);
        const lastMsg = queryOne(db, 'SELECT content, created_at, sender_id FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1', [conv.id]);
        const unread = queryOne(db, 'SELECT COUNT(*) as count FROM messages m WHERE m.conversation_id = ? AND m.sender_id != ? AND NOT EXISTS (SELECT 1 FROM message_reads mr WHERE mr.message_id = m.id AND mr.user_id = ?)', [conv.id, decoded.id, decoded.id]);

        let name = conv.name, avatar = conv.avatar;
        if (conv.type === 'direct') {
          const other = members.find(m => m.id !== decoded.id);
          if (other) { name = other.username; avatar = other.avatar; }
        }

        return { ...conv, members, name, avatar, unread: unread?.count || 0, last_message: lastMsg?.content, last_message_at: lastMsg?.created_at, last_message_sender: lastMsg?.sender_id };
      }).sort((a, b) => !a.last_message_at ? 1 : !b.last_message_at ? -1 : new Date(b.last_message_at) - new Date(a.last_message_at)));
    }

    if (url === '/api/conversations' && method === 'POST') {
      const decoded = getUser(req);
      if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
      const { type = 'direct', memberIds = [], name = '' } = req.body;
      const id = uuidv4();

      if (type === 'direct' && memberIds.length === 1) {
        const existing = queryOne(db, 'SELECT c.id FROM conversations c JOIN conversation_members cm1 ON c.id = cm1.conversation_id AND cm1.user_id = ? JOIN conversation_members cm2 ON c.id = cm2.conversation_id AND cm2.user_id = ? WHERE c.type = \'direct\'', [decoded.id, memberIds[0]]);
        if (existing) return res.json({ id: existing.id });
      }

      db.run('INSERT INTO conversations (id, type, name, created_by) VALUES (?, ?, ?, ?)', [id, type, name, decoded.id]);
      db.run('INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?)', [id, decoded.id, 'admin']);
      memberIds.forEach(mId => db.run('INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)', [id, mId]));
      return res.json({ id });
    }

    const msgMatch = url?.match(/^\/api\/conversations\/([^/]+)\/messages$/);
    if (msgMatch) {
      const decoded = getUser(req);
      if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
      const convId = msgMatch[1];

      if (method === 'GET') {
        const messages = queryAll(db, 'SELECT m.*, u.username as sender_name, u.avatar as sender_avatar FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.conversation_id = ? ORDER BY m.created_at DESC LIMIT 50', [convId]);
        return res.json(messages.reverse().map(msg => ({ ...msg, reads: queryAll(db, 'SELECT u.id, u.username, mr.read_at FROM message_reads mr JOIN users u ON mr.user_id = u.id WHERE mr.message_id = ?', [msg.id]) })));
      }

      if (method === 'POST') {
        const { content, type = 'text' } = req.body;
        const id = uuidv4();
        db.run('INSERT INTO messages (id, conversation_id, sender_id, content, type) VALUES (?, ?, ?, ?, ?)', [id, convId, decoded.id, content, type]);
        db.run('INSERT OR IGNORE INTO message_reads (message_id, user_id) VALUES (?, ?)', [id, decoded.id]);
        const message = queryOne(db, 'SELECT m.*, u.username as sender_name, u.avatar as sender_avatar FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.id = ?', [id]);
        const reads = queryAll(db, 'SELECT u.id, u.username, mr.read_at FROM message_reads mr JOIN users u ON mr.user_id = u.id WHERE mr.message_id = ?', [id]);
        return res.json({ ...message, reads });
      }
    }

    const pollMatch = url?.match(/^\/api\/poll\/([^/]+)/);
    if (pollMatch) {
      const decoded = getUser(req);
      if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
      const convId = pollMatch[1];
      const sinceMatch = url.match(/since=([^&]+)/);
      const since = sinceMatch ? decodeURIComponent(sinceMatch[1]) : null;
      let sql = 'SELECT m.*, u.username as sender_name, u.avatar as sender_avatar FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.conversation_id = ?';
      const params = [convId];
      if (since) { sql += ' AND m.created_at > ?'; params.push(since); }
      return res.json(queryAll(db, sql + ' ORDER BY m.created_at ASC LIMIT 50', params));
    }

    const readMatch = url?.match(/^\/api\/read\/([^/]+)/);
    if (readMatch && method === 'POST') {
      const decoded = getUser(req);
      if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
      const { messageIds } = req.body;
      messageIds.forEach(msgId => db.run('INSERT OR IGNORE INTO message_reads (message_id, user_id) VALUES (?, ?)', [msgId, decoded.id]));
      return res.json({ ok: true });
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    console.error('API Error:', err);
    return res.status(500).json({ error: err.message });
  }
}