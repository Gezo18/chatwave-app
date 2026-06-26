import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Camera, Save } from 'lucide-react';
import Avatar from './Avatar';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';

export default function ProfileModal({ isOpen, onClose }) {
  const { user, updateUser } = useAuth();
  const [username, setUsername] = useState(user?.username || '');
  const [status, setStatus] = useState(user?.status || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await api.auth.updateProfile({ username, status, bio });
      updateUser(updated);
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const { avatar } = await api.auth.uploadAvatar(file);
      updateUser({ ...user, avatar });
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  };

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
            <h2 className="text-lg font-semibold">Edit Profile</h2>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-[var(--bg)]">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <Avatar name={user?.username} color={user?.avatar} size="xl" />
                <label className="absolute bottom-0 right-0 w-8 h-8 bg-[var(--primary)] rounded-full flex items-center justify-center cursor-pointer hover:bg-[var(--primary-dark)] transition-colors">
                  <Camera className="w-4 h-4 text-white" />
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                </label>
                {uploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-muted)] mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition-colors"
                minLength={3}
                maxLength={20}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-muted)] mb-1.5">Status</label>
              <input
                type="text"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                placeholder="Hey there! I am using ChatWave"
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-muted)] mb-1.5">Bio</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell something about yourself..."
                rows={3}
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition-colors resize-none"
              />
            </div>
          </div>

          <div className="p-4 border-t border-[var(--border)]">
            <button
              onClick={handleSave}
              disabled={saving || !username.trim()}
              className="w-full bg-[var(--primary)] text-white font-semibold py-3 rounded-xl hover:bg-[var(--primary-dark)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
