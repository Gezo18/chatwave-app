import initSqlJs from 'sql.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const JWT_SECRET = process.env.JWT_SECRET || 'chatwave-secret-key-change-in-production';

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
        id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
        avatar TEXT DEFAULT '', status TEXT DEFAULT 'Hey there! I am using ChatWave',
        bio TEXT DEFAULT '', online INTEGER DEFAULT 0,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY, type TEXT NOT NULL DEFAULT 'direct', name TEXT DEFAULT '',
        avatar TEXT DEFAULT '', created_by TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS conversation_members (
        conversation_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT DEFAULT 'member',
        muted INTEGER DEFAULT 0, joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (conversation_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, sender_id TEXT NOT NULL,
        content TEXT NOT NULL, type TEXT DEFAULT 'text', reply_to TEXT,
        edited INTEGER DEFAULT 0, deleted INTEGER DEFAULT 0,
        file_url TEXT, file_name TEXT, file_size INTEGER, encrypted INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS message_reactions (
        message_id TEXT NOT NULL, user_id TEXT NOT NULL, emoji TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (message_id, user_id, emoji)
      );
      CREATE TABLE IF NOT EXISTS message_reads (
        message_id TEXT NOT NULL, user_id TEXT NOT NULL,
        read_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (message_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS contacts (
        user_id TEXT NOT NULL, contact_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, contact_id)
      );
      CREATE TABLE IF NOT EXISTS user_keys (
        user_id TEXT PRIMARY KEY, public_key TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    const { url, method } = body = req.body || {};

    // Parse URL path
    const path = url || req.url;
    const bodyData = req.body || {};

    // ===== AUTH =====
    if (path === '/api/auth/register' && method === 'POST') {
      const { username, password } = bodyData;
      if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
      const existing = queryOne(db, 'SELECT id FROM users WHERE username = ?', [username]);
      if (existing) return res.status(400).json({ error: 'Username already taken' });
      const id = uuidv4();
      const colors = ['FF6B6B','4ECDC4','45B7D1','96CEB4','FFEAA7','DDA0DD','98D8C8','F7DC6F'];
      db.run('INSERT INTO users (id, username, password, avatar) VALUES (?, ?, ?, ?)', [id, username, bcrypt.hashSync(password, 10), colors[Math.floor(Math.random() * colors.length)]]);
      const user = queryOne(db, 'SELECT id, username, avatar, status, bio, online, created_at FROM users WHERE id = ?', [id]);
      return res.json({ token: generateToken(user), user });
    }

    if (path === '/api/auth/login' && method === 'POST') {
      const { username, password } = bodyData;
      const user = queryOne(db, 'SELECT * FROM users WHERE username = ?', [username]);
      if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Invalid credentials' });
      const { password: _, ...userData } = user;
      return res.json({ token: generateToken(user), user: userData });
    }

    if (path === '/api/auth/me' && method === 'GET') {
      const decoded = getUser(req);
      if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
      return res.json(queryOne(db, 'SELECT id, username, avatar, status, bio, online, created_at FROM users WHERE id = ?', [decoded.id]));
    }

    if (path === '/api/auth/profile' && method === 'PUT') {
      const decoded = getUser(req);
      if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
      const { username, status, bio } = bodyData;
      if (username) {
        const existing = queryOne(db, 'SELECT id FROM users WHERE username = ? AND id != ?', [username, decoded.id]);
        if (existing) return res.status(400).json({ error: 'Username already taken' });
        db.run('UPDATE users SET username = ? WHERE id = ?', [username, decoded.id]);
      }
      if (status !== undefined) db.run('UPDATE users SET status = ? WHERE id = ?', [status, decoded.id]);
      if (bio !== undefined) db.run('UPDATE users SET bio = ? WHERE id = ?', [bio, decoded.id]);
      return res.json(queryOne(db, 'SELECT id, username, avatar, status, bio, online, created_at FROM users WHERE id = ?', [decoded.id]));
    }

    // ===== USERS =====
    if (path === '/api/users' && method === 'GET') {
      const decoded = getUser(req);
      if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
      return res.json(queryAll(db, 'SELECT id, username, avatar, status, bio, online, last_seen FROM users WHERE id != ?', [decoded.id]));
    }

    // ===== CONVERSATIONS =====
    if (path === '/api/conversations' && method === 'GET') {
      const decoded = getUser(req);
      if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
      const conversations = queryAll(db, 'SELECT c.*, cm.role, cm.muted FROM conversations c JOIN conversation_members cm ON c.id = cm.conversation_id WHERE cm.user_id = ?', [decoded.id]);
      return res.json(conversations.map(conv => {
        const members = queryAll(db, 'SELECT u.id, u.username, u.avatar, u.online, u.last_seen FROM conversation_members cm JOIN users u ON cm.user_id = u.id WHERE cm.conversation_id = ?', [conv.id]);
        const lastMsg = queryOne(db, 'SELECT content, created_at, sender_id FROM messages WHERE conversation_id = ? AND deleted = 0 ORDER BY created_at DESC LIMIT 1', [conv.id]);
        const unread = queryOne(db, 'SELECT COUNT(*) as count FROM messages m WHERE m.conversation_id = ? AND m.sender_id != ? AND m.deleted = 0 AND NOT EXISTS (SELECT 1 FROM message_reads mr WHERE mr.message_id = m.id AND mr.user_id = ?)', [conv.id, decoded.id, decoded.id]);
        let name = conv.name, avatar = conv.avatar;
        if (conv.type === 'direct') { const other = members.find(m => m.id !== decoded.id); if (other) { name = other.username; avatar = other.avatar; } }
        return { ...conv, members, name, avatar, unread: unread?.count || 0, last_message: lastMsg?.content, last_message_at: lastMsg?.created_at, last_message_sender: lastMsg?.sender_id };
      }).sort((a, b) => !a.last_message_at ? 1 : !b.last_message_at ? -1 : new Date(b.last_message_at) - new Date(a.last_message_at)));
    }

    if (path === '/api/conversations' && method === 'POST') {
      const decoded = getUser(req);
      if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
      const { type = 'direct', memberIds = [], name = '' } = bodyData;
      const id = uuidv4();
      if (type === 'direct' && memberIds.length === 1) {
        const existing = queryOne(db, "SELECT c.id FROM conversations c JOIN conversation_members cm1 ON c.id = cm1.conversation_id AND cm1.user_id = ? JOIN conversation_members cm2 ON c.id = cm2.conversation_id AND cm2.user_id = ? WHERE c.type = 'direct'", [decoded.id, memberIds[0]]);
        if (existing) return res.json({ id: existing.id });
      }
      db.run('INSERT INTO conversations (id, type, name, created_by) VALUES (?, ?, ?, ?)', [id, type, name, decoded.id]);
      db.run('INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?)', [id, decoded.id, 'admin']);
      memberIds.forEach(mId => db.run('INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)', [id, mId]));
      return res.json({ id });
    }

    // ===== MESSAGES =====
    const msgMatch = path?.match(/^\/api\/conversations\/([^/]+)\/messages$/);
    if (msgMatch) {
      const decoded = getUser(req);
      if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
      const convId = msgMatch[1];
      if (method === 'GET') {
        const messages = queryAll(db, 'SELECT m.*, u.username as sender_name, u.avatar as sender_avatar FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.conversation_id = ? ORDER BY m.created_at DESC LIMIT 50', [convId]);
        return res.json(messages.reverse().map(msg => ({
          ...msg,
          reads: queryAll(db, 'SELECT u.id, u.username, mr.read_at FROM message_reads mr JOIN users u ON mr.user_id = u.id WHERE mr.message_id = ?', [msg.id]),
          reactions: queryAll(db, 'SELECT r.emoji, r.user_id, u.username FROM message_reactions r JOIN users u ON r.user_id = u.id WHERE r.message_id = ?', [msg.id]),
          reply_to_message: msg.reply_to ? queryOne(db, 'SELECT m.id, m.content, u.username as sender_name FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.id = ?', [msg.reply_to]) : null
        })));
      }
      if (method === 'POST') {
        const { content, type = 'text', replyTo, encrypted } = bodyData;
        const id = uuidv4();
        db.run('INSERT INTO messages (id, conversation_id, sender_id, content, type, reply_to, encrypted) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, convId, decoded.id, content, type, replyTo || null, encrypted ? 1 : 0]);
        db.run('INSERT OR IGNORE INTO message_reads (message_id, user_id) VALUES (?, ?)', [id, decoded.id]);
        const message = queryOne(db, 'SELECT m.*, u.username as sender_name, u.avatar as sender_avatar FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.id = ?', [id]);
        return res.json({ ...message, reads: [], reactions: [] });
      }
    }

    // ===== EDIT / DELETE =====
    const editMatch = path?.match(/^\/api\/messages\/([^/]+)$/);
    if (editMatch) {
      const decoded = getUser(req);
      if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
      const msgId = editMatch[1];
      if (method === 'PUT') {
        const msg = queryOne(db, 'SELECT * FROM messages WHERE id = ?', [msgId]);
        if (!msg || msg.sender_id !== decoded.id) return res.status(403).json({ error: 'Not allowed' });
        db.run('UPDATE messages SET content = ?, edited = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [bodyData.content, msgId]);
        const updated = queryOne(db, 'SELECT m.*, u.username as sender_name, u.avatar as sender_avatar FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.id = ?', [msgId]);
        return res.json(updated);
      }
      if (method === 'DELETE') {
        const msg = queryOne(db, 'SELECT * FROM messages WHERE id = ?', [msgId]);
        if (!msg || msg.sender_id !== decoded.id) return res.status(403).json({ error: 'Not allowed' });
        db.run("UPDATE messages SET deleted = 1, content = 'This message was deleted', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [msgId]);
        return res.json({ success: true });
      }
    }

    // ===== REACTIONS =====
    const reactMatch = path?.match(/^\/api\/messages\/([^/]+)\/reactions$/);
    if (reactMatch && method === 'POST') {
      const decoded = getUser(req);
      if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
      db.run('INSERT OR IGNORE INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)', [reactMatch[1], decoded.id, bodyData.emoji]);
      return res.json(queryAll(db, 'SELECT r.emoji, r.user_id, u.username FROM message_reactions r JOIN users u ON r.user_id = u.id WHERE r.message_id = ?', [reactMatch[1]]));
    }

    const reactDelMatch = path?.match(/^\/api\/messages\/([^/]+)\/reactions\/(.+)$/);
    if (reactDelMatch && method === 'DELETE') {
      const decoded = getUser(req);
      if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
      db.run('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?', [reactDelMatch[1], decoded.id, decodeURIComponent(reactDelMatch[2])]);
      return res.json(queryAll(db, 'SELECT r.emoji, r.user_id, u.username FROM message_reactions r JOIN users u ON r.user_id = u.id WHERE r.message_id = ?', [reactDelMatch[1]]));
    }

    // ===== SEARCH =====
    if (path?.startsWith('/api/search') && method === 'GET') {
      const decoded = getUser(req);
      if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
      const q = new URL(path, 'http://x').searchParams.get('q');
      if (!q) return res.json([]);
      return res.json(queryAll(db, 'SELECT m.*, u.username as sender_name, u.avatar as sender_avatar, c.name as conversation_name FROM messages m JOIN users u ON m.sender_id = u.id JOIN conversations c ON m.conversation_id = c.id JOIN conversation_members cm ON c.id = cm.conversation_id AND cm.user_id = ? WHERE m.content LIKE ? AND m.deleted = 0 ORDER BY m.created_at DESC LIMIT 50', [decoded.id, `%${q}%`]));
    }

    // ===== GROUP ADMIN =====
    if (path?.match(/^\/api\/conversations\/([^/]+)\/kick$/) && method === 'POST') {
      const decoded = getUser(req);
      if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
      const convId = path.match(/^\/api\/conversations\/([^/]+)\/kick$/)[1];
      const role = queryOne(db, 'SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [convId, decoded.id]);
      if (!role || role.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
      db.run('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [convId, bodyData.userId]);
      return res.json({ success: true });
    }

    if (path?.match(/^\/api\/conversations\/([^/]+)\/add$/) && method === 'POST') {
      const decoded = getUser(req);
      if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
      const convId = path.match(/^\/api\/conversations\/([^/]+)\/add$/)[1];
      const role = queryOne(db, 'SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [convId, decoded.id]);
      if (!role || role.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
      db.run('INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)', [convId, bodyData.userId]);
      return res.json({ success: true });
    }

    if (path?.match(/^\/api\/conversations\/([^/]+)\/name$/) && method === 'PUT') {
      const decoded = getUser(req);
      if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
      const convId = path.match(/^\/api\/conversations\/([^/]+)\/name$/)[1];
      db.run('UPDATE conversations SET name = ? WHERE id = ?', [bodyData.name, convId]);
      return res.json({ success: true });
    }

    if (path?.match(/^\/api\/conversations\/([^/]+)\/mute$/) && method === 'PUT') {
      const decoded = getUser(req);
      if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
      const convId = path.match(/^\/api\/conversations\/([^/]+)\/mute$/)[1];
      db.run('UPDATE conversation_members SET muted = ? WHERE conversation_id = ? AND user_id = ?', [bodyData.muted ? 1 : 0, convId, decoded.id]);
      return res.json({ success: true });
    }

    // ===== KEYS =====
    if (path === '/api/keys' && method === 'POST') {
      const decoded = getUser(req);
      if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
      db.run('INSERT OR REPLACE INTO user_keys (user_id, public_key) VALUES (?, ?)', [decoded.id, bodyData.publicKey]);
      return res.json({ success: true });
    }

    const keyMatch = path?.match(/^\/api\/keys\/([^/]+)$/);
    if (keyMatch && method === 'GET') {
      const key = queryOne(db, 'SELECT public_key FROM user_keys WHERE user_id = ?', [keyMatch[1]]);
      return res.json(key || { public_key: null });
    }

    // ===== CONTACTS =====
    if (path === '/api/contacts' && method === 'GET') {
      const decoded = getUser(req);
      if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
      return res.json(queryAll(db, 'SELECT u.id, u.username, u.avatar, u.status, u.bio, u.online, u.last_seen FROM contacts c JOIN users u ON c.contact_id = u.id WHERE c.user_id = ? ORDER BY u.username', [decoded.id]));
    }

    const contactDelMatch = path?.match(/^\/api\/contacts\/([^/]+)$/);
    if (contactDelMatch && method === 'DELETE') {
      const decoded = getUser(req);
      if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
      db.run('DELETE FROM contacts WHERE user_id = ? AND contact_id = ?', [decoded.id, contactDelMatch[1]]);
      return res.json({ success: true });
    }

    // ===== POLL =====
    if (path?.startsWith('/api/conversations/poll') && method === 'GET') {
      const decoded = getUser(req);
      if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
      const since = new URL(path, 'http://x').searchParams.get('since');
      if (!since) return res.json([]);
      return res.json(queryAll(db, 'SELECT DISTINCT c.id, m.created_at as last_message_at, m.content as last_message FROM conversations c JOIN conversation_members cm ON c.id = cm.conversation_id JOIN messages m ON c.id = m.conversation_id WHERE cm.user_id = ? AND m.created_at > ? ORDER BY m.created_at DESC', [decoded.id, since]));
    }

    const pollMatch = path?.match(/^\/api\/conversations\/([^/]+)\/poll$/);
    if (pollMatch) {
      const decoded = getUser(req);
      if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
      const since = new URL(path, 'http://x').searchParams.get('since');
      if (!since) return res.json([]);
      return res.json(queryAll(db, 'SELECT m.*, u.username as sender_name, u.avatar as sender_avatar FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.conversation_id = ? AND m.created_at > ? ORDER BY m.created_at ASC', [pollMatch[1], since]));
    }

    // ===== SEARCH CONVERSATION =====
    const searchMatch = path?.match(/^\/api\/conversations\/([^/]+)\/search$/);
    if (searchMatch && method === 'GET') {
      const decoded = getUser(req);
      if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
      const q = new URL(path, 'http://x').searchParams.get('q');
      if (!q) return res.json([]);
      return res.json(queryAll(db, 'SELECT m.*, u.username as sender_name, u.avatar as sender_avatar FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.conversation_id = ? AND m.content LIKE ? AND m.deleted = 0 ORDER BY m.created_at DESC LIMIT 50', [searchMatch[1], `%${q}%`]));
    }

    // ===== READ =====
    const readMatch = path?.match(/^\/api\/read\/([^/]+)$/);
    if (readMatch && method === 'POST') {
      const decoded = getUser(req);
      if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
      (bodyData.messageIds || []).forEach(msgId => db.run('INSERT OR IGNORE INTO message_reads (message_id, user_id) VALUES (?, ?)', [msgId, decoded.id]));
      return res.json({ ok: true });
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    console.error('API Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
