import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new Database(join(__dirname, 'chatwave.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    avatar TEXT DEFAULT '',
    status TEXT DEFAULT 'Hey there! I am using ChatWave',
    bio TEXT DEFAULT '',
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS conversation_members (
    conversation_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT DEFAULT 'member',
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (conversation_id, user_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT DEFAULT 'text',
    reply_to TEXT,
    edited INTEGER DEFAULT 0,
    deleted INTEGER DEFAULT 0,
    file_url TEXT,
    file_name TEXT,
    file_size INTEGER,
    encrypted INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id),
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (reply_to) REFERENCES messages(id)
  );

  CREATE TABLE IF NOT EXISTS message_reactions (
    message_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    emoji TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (message_id, user_id, emoji),
    FOREIGN KEY (message_id) REFERENCES messages(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS user_keys (
    user_id TEXT PRIMARY KEY,
    public_key TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS message_reads (
    message_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (message_id, user_id),
    FOREIGN KEY (message_id) REFERENCES messages(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS contacts (
    user_id TEXT NOT NULL,
    contact_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, contact_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (contact_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_conversation_members_user ON conversation_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_message_reads_message ON message_reads(message_id);
  CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id);
  CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id);
  CREATE INDEX IF NOT EXISTS idx_messages_reply ON messages(reply_to);
`);

// Migrations for existing databases
try { db.prepare('SELECT muted FROM conversation_members LIMIT 1').get(); } catch { db.exec('ALTER TABLE conversation_members ADD COLUMN muted INTEGER DEFAULT 0'); }
try { db.prepare('SELECT bio FROM users LIMIT 1').get(); } catch { db.exec('ALTER TABLE users ADD COLUMN bio TEXT DEFAULT \'\''); }
try { db.prepare('SELECT reply_to FROM messages LIMIT 1').get(); } catch { db.exec('ALTER TABLE messages ADD COLUMN reply_to TEXT'); }
try { db.prepare('SELECT edited FROM messages LIMIT 1').get(); } catch { db.exec('ALTER TABLE messages ADD COLUMN edited INTEGER DEFAULT 0'); }
try { db.prepare('SELECT deleted FROM messages LIMIT 1').get(); } catch { db.exec('ALTER TABLE messages ADD COLUMN deleted INTEGER DEFAULT 0'); }
try { db.prepare('SELECT file_url FROM messages LIMIT 1').get(); } catch { db.exec('ALTER TABLE messages ADD COLUMN file_url TEXT'); }
try { db.prepare('SELECT file_name FROM messages LIMIT 1').get(); } catch { db.exec('ALTER TABLE messages ADD COLUMN file_name TEXT'); }
try { db.prepare('SELECT file_size FROM messages LIMIT 1').get(); } catch { db.exec('ALTER TABLE messages ADD COLUMN file_size INTEGER'); }
try { db.prepare('SELECT encrypted FROM messages LIMIT 1').get(); } catch { db.exec('ALTER TABLE messages ADD COLUMN encrypted INTEGER DEFAULT 0'); }
try { db.prepare('SELECT updated_at FROM messages LIMIT 1').get(); } catch { db.exec('ALTER TABLE messages ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP'); }

export default db;