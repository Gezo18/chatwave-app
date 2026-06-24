import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import db from './database.js';
import { generateToken, verifyToken, authMiddleware } from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, '../client/dist')));
}

// ==================== REST API ====================

// Register
app.post('/api/auth/register', (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be 3-20 characters' });
    }

    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    const id = uuidv4();
    const hashedPassword = bcrypt.hashSync(password, 10);
    const avatarColors = ['FF6B6B', '4ECDC4', '45B7D1', '96CEB4', 'FFEAA7', 'DDA0DD', '98D8C8', 'F7DC6F'];
    const color = avatarColors[Math.floor(Math.random() * avatarColors.length)];

    db.prepare('INSERT INTO users (id, username, password, avatar) VALUES (?, ?, ?, ?)').run(
      id, username, hashedPassword, color
    );

    const user = db.prepare('SELECT id, username, avatar, status, online, created_at FROM users WHERE id = ?').get(id);
    const token = generateToken(user);

    res.json({ token, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user);
    const { password: _, ...userData } = user;

    res.json({ token, user: userData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get current user
app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, username, avatar, status, online, created_at FROM users WHERE id = ?').get(req.userId);
  res.json(user);
});

// Get all users
app.get('/api/users', authMiddleware, (req, res) => {
  const users = db.prepare('SELECT id, username, avatar, status, online, last_seen FROM users WHERE id != ?').all(req.userId);
  res.json(users);
});

// Get conversations
app.get('/api/conversations', authMiddleware, (req, res) => {
  const conversations = db.prepare(`
    SELECT c.*, cm.role,
      (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
      (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_at,
      (SELECT sender_id FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_sender
    FROM conversations c
    JOIN conversation_members cm ON c.id = cm.conversation_id
    WHERE cm.user_id = ?
    ORDER BY last_message_at DESC
  `).all(req.userId);

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
    `).get(conv.id, req.userId, req.userId);

    let name = conv.name;
    let avatar = conv.avatar;

    if (conv.type === 'direct') {
      const other = members.find(m => m.id !== req.userId);
      if (other) {
        name = other.username;
        avatar = other.avatar;
      }
    }

    return { ...conv, members, name, avatar, unread: unread.count };
  });

  res.json(enriched);
});

// Create conversation
app.post('/api/conversations', authMiddleware, (req, res) => {
  try {
    const { type = 'direct', memberIds = [], name = '' } = req.body;
    const id = uuidv4();

    if (type === 'direct' && memberIds.length === 1) {
      const existing = db.prepare(`
        SELECT c.id FROM conversations c
        JOIN conversation_members cm1 ON c.id = cm1.conversation_id AND cm1.user_id = ?
        JOIN conversation_members cm2 ON c.id = cm2.conversation_id AND cm2.user_id = ?
        WHERE c.type = 'direct'
      `).get(req.userId, memberIds[0]);

      if (existing) {
        return res.json({ id: existing.id });
      }
    }

    db.prepare('INSERT INTO conversations (id, type, name, created_by) VALUES (?, ?, ?, ?)').run(
      id, type, name, req.userId
    );

    db.prepare('INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?)').run(
      id, req.userId, 'admin'
    );

    for (const memberId of memberIds) {
      db.prepare('INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)').run(
        id, memberId
      );
    }

    // Auto-save contacts
    const contactStmt = db.prepare('INSERT OR IGNORE INTO contacts (user_id, contact_id) VALUES (?, ?)');
    for (const memberId of memberIds) {
      contactStmt.run(req.userId, memberId);
      contactStmt.run(memberId, req.userId);
    }

    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Poll: get conversations with new activity
app.get('/api/conversations/poll', authMiddleware, (req, res) => {
  const { since } = req.query;
  if (!since) return res.json([]);

  const conversations = db.prepare(`
    SELECT DISTINCT c.id, m.created_at as last_message_at, m.content as last_message, m.sender_id as last_message_sender
    FROM conversations c
    JOIN conversation_members cm ON c.id = cm.conversation_id
    JOIN messages m ON c.id = m.conversation_id
    WHERE cm.user_id = ? AND m.created_at > ?
    ORDER BY m.created_at DESC
  `).all(req.userId, since);

  res.json(conversations);
});

// Get messages
app.get('/api/conversations/:id/messages', authMiddleware, (req, res) => {
  const { limit = 50, before, since } = req.query;

  let query = `
    SELECT m.*, u.username as sender_name, u.avatar as sender_avatar
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    WHERE m.conversation_id = ?
  `;
  const params = [req.params.id];

  if (before) {
    query += ' AND m.created_at < ?';
    params.push(before);
  }

  if (since) {
    query += ' AND m.created_at > ?';
    params.push(since);
  }

  query += ' ORDER BY m.created_at DESC LIMIT ?';
  params.push(parseInt(limit));

  const messages = db.prepare(query).all(...params);

  const enriched = messages.map(msg => {
    const reads = db.prepare(`
      SELECT u.id, u.username, mr.read_at
      FROM message_reads mr
      JOIN users u ON mr.user_id = u.id
      WHERE mr.message_id = ?
    `).all(msg.id);
    return { ...msg, reads };
  });

  res.json(enriched.reverse());
});

// Poll for new messages in a conversation
app.get('/api/conversations/:id/poll', authMiddleware, (req, res) => {
  const { since } = req.query;
  if (!since) return res.json([]);

  const messages = db.prepare(`
    SELECT m.*, u.username as sender_name, u.avatar as sender_avatar
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    WHERE m.conversation_id = ? AND m.created_at > ?
    ORDER BY m.created_at ASC
  `).all(req.params.id, since);

  const enriched = messages.map(msg => {
    const reads = db.prepare(`
      SELECT u.id, u.username, mr.read_at
      FROM message_reads mr
      JOIN users u ON mr.user_id = u.id
      WHERE mr.message_id = ?
    `).all(msg.id);
    return { ...msg, reads };
  });

  res.json(enriched);
});



// Send message
app.post('/api/conversations/:id/messages', authMiddleware, (req, res) => {
  try {
    const { content, type = 'text' } = req.body;
    const id = uuidv4();

    db.prepare('INSERT INTO messages (id, conversation_id, sender_id, content, type) VALUES (?, ?, ?, ?, ?)').run(
      id, req.params.id, req.userId, content, type
    );

    const message = db.prepare(`
      SELECT m.*, u.username as sender_name, u.avatar as sender_avatar
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.id = ?
    `).get(id);

    res.json(message);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get contacts
app.get('/api/contacts', authMiddleware, (req, res) => {
  const contacts = db.prepare(`
    SELECT u.id, u.username, u.avatar, u.status, u.online, u.last_seen
    FROM contacts c
    JOIN users u ON c.contact_id = u.id
    WHERE c.user_id = ?
    ORDER BY u.username ASC
  `).all(req.userId);
  res.json(contacts);
});

// Remove contact
app.delete('/api/contacts/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM contacts WHERE user_id = ? AND contact_id = ?').run(req.userId, req.params.id);
  res.json({ success: true });
});

// ==================== SOCKET.IO ====================

const onlineUsers = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication error'));

  const decoded = verifyToken(token);
  if (!decoded) return next(new Error('Authentication error'));

  socket.userId = decoded.id;
  socket.username = decoded.username;
  next();
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.username}`);

  // Track online status
  onlineUsers.set(socket.userId, socket.id);
  db.prepare('UPDATE users SET online = 1, last_seen = CURRENT_TIMESTAMP WHERE id = ?').run(socket.userId);

  // Join user's conversation rooms
  const conversations = db.prepare('SELECT conversation_id FROM conversation_members WHERE user_id = ?').all(socket.userId);
  conversations.forEach(c => socket.join(c.conversation_id));

  // Broadcast online status
  io.emit('user:online', { userId: socket.userId, online: true });

  // Handle sending messages
  socket.on('message:send', (data) => {
    const { conversationId, content, type = 'text' } = data;
    const id = uuidv4();

    db.prepare('INSERT INTO messages (id, conversation_id, sender_id, content, type) VALUES (?, ?, ?, ?, ?)').run(
      id, conversationId, socket.userId, content, type
    );

    const message = db.prepare(`
      SELECT m.*, u.username as sender_name, u.avatar as sender_avatar
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.id = ?
    `).get(id);

    io.to(conversationId).emit('message:new', { ...message, reads: [] });
  });

  // Handle typing
  socket.on('typing:start', ({ conversationId }) => {
    socket.to(conversationId).emit('typing:start', {
      conversationId,
      userId: socket.userId,
      username: socket.username
    });
  });

  socket.on('typing:stop', ({ conversationId }) => {
    socket.to(conversationId).emit('typing:stop', {
      conversationId,
      userId: socket.userId
    });
  });

  // Handle read receipts
  socket.on('message:read', ({ conversationId, messageIds }) => {
    const insertRead = db.prepare('INSERT OR IGNORE INTO message_reads (message_id, user_id) VALUES (?, ?)');

    for (const msgId of messageIds) {
      insertRead.run(msgId, socket.userId);
    }

    io.to(conversationId).emit('message:read', {
      conversationId,
      messageIds,
      userId: socket.userId,
      readAt: new Date().toISOString()
    });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.username}`);
    onlineUsers.delete(socket.userId);
    db.prepare('UPDATE users SET online = 0, last_seen = CURRENT_TIMESTAMP WHERE id = ?').run(socket.userId);
    io.emit('user:online', { userId: socket.userId, online: false });
  });
});

// ==================== START SERVER ====================

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(join(__dirname, '../client/dist/index.html'));
  });
}

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`ChatWave server running on port ${PORT}`);
});