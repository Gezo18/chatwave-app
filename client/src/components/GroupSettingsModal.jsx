import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UserPlus, UserMinus, Edit3, Check } from 'lucide-react';
import Avatar from './Avatar';
import { api } from '../utils/api';

export default function GroupSettingsModal({ isOpen, onClose, conversation, onUpdate }) {
  const [name, setName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [users, setUsers] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (isOpen && conversation) {
      setName(conversation.name);
      setEditingName(false);
      setShowAdd(false);
      setSearch('');
      api.users.list().then(setUsers).catch(console.error);
    }
  }, [isOpen, conversation]);

  if (!isOpen || !conversation) return null;

  const members = conversation.members || [];
  const nonMembers = users.filter(u => !members.find(m => m.id === u.id));

  const handleRename = async () => {
    if (!name.trim()) return;
    try {
      await api.conversations.rename(conversation.id, name);
      setEditingName(false);
      onUpdate();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleKick = async (userId) => {
    if (!confirm('Remove this member?')) return;
    try {
      await api.conversations.kick(conversation.id, userId);
      onUpdate();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleAdd = async (userId) => {
    try {
      await api.conversations.addMember(conversation.id, userId);
      setShowAdd(false);
      onUpdate();
    } catch (err) {
      alert(err.message);
    }
  };

  const filteredNonMembers = nonMembers.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase())
  );

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
          className="w-full max-w-md bg-[var(--bg-light)] rounded-2xl border border-[var(--border)] overflow-hidden max-h-[80vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
            <h2 className="text-lg font-semibold">Group Settings</h2>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-[var(--bg)]">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Group Name */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-muted)] mb-1.5">Group Name</label>
              {editingName ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-[var(--primary)]"
                    autoFocus
                  />
                  <button onClick={handleRename} className="p-2 bg-[var(--primary)] text-white rounded-xl hover:bg-[var(--primary-dark)]">
                    <Check className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-sm">{conversation.name}</span>
                  <button onClick={() => setEditingName(true)} className="p-2 rounded-lg hover:bg-[var(--bg)]">
                    <Edit3 className="w-4 h-4 text-[var(--text-muted)]" />
                  </button>
                </div>
              )}
            </div>

            {/* Members */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-[var(--text-muted)]">Members ({members.length})</label>
                <button
                  onClick={() => setShowAdd(!showAdd)}
                  className="p-1.5 rounded-lg hover:bg-[var(--bg)] text-[var(--primary)]"
                >
                  <UserPlus className="w-4 h-4" />
                </button>
              </div>

              {showAdd && (
                <div className="mb-3 space-y-2">
                  <input
                    type="text"
                    placeholder="Search users to add..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-[var(--primary)]"
                  />
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {filteredNonMembers.map(u => (
                      <button
                        key={u.id}
                        onClick={() => handleAdd(u.id)}
                        className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-[var(--bg)] text-sm"
                      >
                        <Avatar name={u.username} color={u.avatar} size="sm" />
                        <span>{u.username}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                {members.map(member => (
                  <div key={member.id} className="flex items-center gap-3 p-2 rounded-lg">
                    <Avatar name={member.username} color={member.avatar} size="sm" online={member.online} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{member.username}</p>
                    </div>
                    <button
                      onClick={() => handleKick(member.id)}
                      className="p-1.5 rounded-lg hover:bg-[var(--danger)]/10 text-[var(--danger)] opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove member"
                    >
                      <UserMinus className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
