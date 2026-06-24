import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

const JWT_SECRET = 'chatwave-secret-key-change-in-production';

// In-memory database (resets on cold start in serverless)
let db;

function getDb() {
  if (!db) {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    db.exec(`
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

      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_conversation_members_user ON conversation_members(user_id);
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

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url, method } = req;
  const db = getDb();

  // Auth routes
  if (url === '/api/auth/register' && method === 'POST') {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    if (username.length < 3 || username.length > 20) return res.status(400).json({ error: 'Username must be 3-20 characters' });
    if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) return res.status(400).json({ error: 'Username already taken' });

    const id = uuidv4();
    const hashedPassword = bcrypt.hashSync(password, 10);
    const colors = ['FF6B6B', '4ECDC4', '45B7D1', '96CEB4', 'FFEAA7', 'DDA0DD', '98D8C8', 'F7DC6F'];
    const color = colors[Math.floor(Math.random() * colors.length)];

    db.prepare('INSERT INTO users (id, username, password, avatar) VALUES (?, ?, ?, ?)').run(id, username, hashedPassword, color);
    const user = db.prepare('SELECT id, username, avatar, status, online, created_at FROM users WHERE id = ?').get(id);
    const token = generateToken(user);

    return res.json({ token, user });
  }

  if (url === '/api/auth/login' && method === 'POST') {
    const { username, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
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
    const user = db.prepare('SELECT id, username, avatar, status, online, created_at FROM users WHERE id = ?').get(decoded.id);
    return res.json(user);
  }

  // Users
  if (url === '/api/users' && method === 'GET') {
    const decoded = getUser(req);
    if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
    const users = db.prepare('SELECT id, username, avatar, status, online, last_seen FROM users WHERE id != ?').all(decoded.id);
    return res.json(users);
  }

  // Conversations
  if (url === '/api/conversations' && method === 'GET') {
    const decoded = getUser(req);
    if (!decoded) return res.status(401).json({ error: 'Unauthorized' });

    const conversations = db.prepare(`
      SELECT c.*, cm.role,
        (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_at,
        (SELECT sender_id FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_sender
      FROM conversations c
      JOIN conversation_members cm ON c.id = cm.conversation_id
      WHERE cm.user_id = ?
      ORDER BY last_message_at DESC
    `).all(decoded.id);

    const enriched = conversations.map(conv => {
      const members = db.prepare(`
        SELECT u.id, u.username, u.avatar, u.online, u.last_seen
        FROM conversation_members cm
        JOIN users u ON cm.user_id = u.id
        WHERE cm.conversation_id = ?
      `).all(conv.id);

      const unread = db.prepare(`
        SELECT COUNT(*) as count FROM messages m
        WHERE m.conversation_id = ? AND m.sender_id != ?
        AND NOT EXISTS (SELECT 1 FROM message_reads mr WHERE mr.message_id = m.id AND mr.user_id = ?)
      `).get(conv.id, decoded.id, decoded.id);

      let name = conv.name;
      let avatar = conv.avatar;
      if (conv.type === 'direct') {
        const other = members.find(m => m.id !== decoded.id);
        if (other) { name = other.username; avatar = other.avatar; }
      }

      return { ...conv, members, name, avatar, unread: unread.count };
    });

    return res.json(enriched);
  }

  if (url === '/api/conversations' && method === 'POST') {
    const decoded = getUser(req);
    if (!decoded) return res.status(401).json({ error: 'Unauthorized' });

    const { type = 'direct', memberIds = [], name = '' } = req.body;
    const id = uuidv4();

    if (type === 'direct' && memberIds.length === 1) {
      const existing = db.prepare(`
        SELECT c.id FROM conversations c
        JOIN conversation_members cm1 ON c.id = cm1.conversation_id AND cm1.user_id = ?
        JOIN conversation_members cm2 ON c.id = cm2.conversation_id AND cm2.user_id = ?
        WHERE c.type = 'direct'
      `).get(decoded.id, memberIds[0]);

      if (existing) return res.json({ id: existing.id });
    }

    db.prepare('INSERT INTO conversations (id, type, name, created_by) VALUES (?, ?, ?, ?)').run(id, type, name, decoded.id);
    db.prepare('INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?)').run(id, decoded.id, 'admin');
    for (const memberId of memberIds) {
      db.prepare('INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)').run(id, memberId);
    }

    return res.json({ id });
  }

  // Messages
  if (url?.startsWith('/api/conversations/') && url.endsWith('/messages')) {
    const decoded = getUser(req);
    if (!decoded) return res.status(401).json({ error: 'Unauthorized' });

    const convId = url.split('/')[3];

    if (method === 'GET') {
      const messages = db.prepare(`
        SELECT m.*, u.username as sender_name, u.avatar as sender_avatar
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.conversation_id = ?
        ORDER BY m.created_at DESC LIMIT 50
      `).all(convId);

      const enriched = messages.map(msg => {
        const reads = db.prepare(`
          SELECT u.id, u.username, mr.read_at
          FROM message_reads mr
          JOIN users u ON mr.user_id = u.id
          WHERE mr.message_id = ?
        `).all(msg.id);
        return { ...msg, reads };
      });

      return res.json(enriched.reverse());
    }

    if (method === 'POST') {
      const { content, type = 'text' } = req.body;
      const id = uuidv4();

      db.prepare('INSERT INTO messages (id, conversation_id, sender_id, content, type) VALUES (?, ?, ?, ?, ?)').run(id, convId, decoded.id, content, type);

      // Auto-mark as read by sender
      db.prepare('INSERT OR IGNORE INTO message_reads (message_id, user_id) VALUES (?, ?)').run(id, decoded.id);

      const message = db.prepare(`
        SELECT m.*, u.username as sender_name, u.avatar as sender_avatar
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.id = ?
      `).get(id);

      const reads = db.prepare('SELECT u.id, u.username, mr.read_at FROM message_reads mr JOIN users u ON mr.user_id = u.id WHERE mr.message_id = ?').all(id);

      return res.json({ ...message, reads });
    }
  }

  // Polling: get new messages since timestamp
  if (url?.startsWith('/api/poll/') && method === 'GET') {
    const decoded = getUser(req);
    if (!decoded) return res.status(401).json({ error: 'Unauthorized' });

    const convId = url.split('/')[3];
    const since = url.split('?since=')[1];

    let query = `
      SELECT m.*, u.username as sender_name, u.avatar as sender_avatar
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = ?
    `;
    const params = [convId];

    if (since) {
      query += ' AND m.created_at > ?';
      params.push(decodeURIComponent(since));
    }

    query += ' ORDER BY m.created_at ASC LIMIT 50';
    const messages = db.prepare(query).all(...params);

    return res.json(messages);
  }

  // Mark messages as read
  if (url?.startsWith('/api/read/') && method === 'POST') {
    const decoded = getUser(req);
    if (!decoded) return res.status(401).json({ error: 'Unauthorized' });

    const convId = url.split('/')[3];
    const { messageIds } = req.body;

    for (const msgId of messageIds) {
      db.prepare('INSERT OR IGNORE INTO message_reads (message_id, user_id) VALUES (?, ?)').run(msgId, decoded.id);
    }

    return res.json({ ok: true });
  }

  return res.status(404).json({ error: 'Not found' });
}