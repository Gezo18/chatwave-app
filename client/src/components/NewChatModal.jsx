import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Users, Check } from 'lucide-react';
import Avatar from './Avatar';
import { api } from '../utils/api';

export default function NewChatModal({ isOpen, onClose, onCreated }) {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [isGroup, setIsGroup] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      api.users.list().then(setUsers).catch(console.error);
      setSearch('');
      setSelected([]);
      setGroupName('');
      setIsGroup(false);
    }
  }, [isOpen]);

  const filtered = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase())
  );

  const toggleUser = (userId) => {
    setSelected(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleCreate = async () => {
    if (selected.length === 0) return;
    setLoading(true);

    try {
      const type = isGroup && selected.length > 1 ? 'group' : 'direct';
      const name = isGroup ? groupName : '';
      
      const { id } = await api.conversations.create({
        type,
        memberIds: selected,
        name
      });

      onCreated(id);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-md bg-[var(--bg-light)] rounded-2xl border border-[var(--border)] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
            <h2 className="text-lg font-semibold">New Chat</h2>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-[var(--bg)]">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4">
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => setIsGroup(false)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                  !isGroup ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg)] text-[var(--text-muted)]'
                }`}
              >
                Direct Message
              </button>
              <button
                onClick={() => setIsGroup(true)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                  isGroup ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg)] text-[var(--text-muted)]'
                }`}
              >
                <Users className="w-4 h-4 inline mr-2" />
                Group
              </button>
            </div>

            {isGroup && (
              <input
                type="text"
                placeholder="Group name"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] mb-3"
              />
            )}

            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Search users..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)]"
              />
            </div>

            {selected.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {selected.map(id => {
                  const u = users.find(u => u.id === id);
                  return u ? (
                    <span
                      key={id}
                      className="flex items-center gap-1 px-2 py-1 bg-[var(--primary)]/20 text-[var(--primary)] text-xs rounded-full"
                    >
                      {u.username}
                      <button onClick={() => toggleUser(id)}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ) : null;
                })}
              </div>
            )}

            <div className="max-h-64 overflow-y-auto space-y-1">
              {filtered.map(u => (
                <button
                  key={u.id}
                  onClick={() => toggleUser(u.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${
                    selected.includes(u.id) ? 'bg-[var(--primary)]/10' : 'hover:bg-[var(--bg)]'
                  }`}
                >
                  <Avatar name={u.username} color={u.avatar} online={u.online} />
                  <div className="flex-1 text-left">
                    <p className="font-medium text-sm">{u.username}</p>
                    <p className="text-xs text-[var(--text-muted)]">{u.status}</p>
                  </div>
                  {selected.includes(u.id) && (
                    <div className="w-6 h-6 bg-[var(--primary)] rounded-full flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 border-t border-[var(--border)]">
            <button
              onClick={handleCreate}
              disabled={selected.length === 0 || (isGroup && !groupName) || loading}
              className="w-full bg-[var(--primary)] text-white font-semibold py-3 rounded-xl hover:bg-[var(--primary-dark)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating...' : selected.length === 0 ? 'Select users' : `Start ${isGroup ? 'group' : 'chat'}`}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}