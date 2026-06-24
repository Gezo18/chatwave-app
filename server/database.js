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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id),
    FOREIGN KEY (sender_id) REFERENCES users(id)
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
`);

export default db;