import { useState } from 'react';
import { Search, Plus, MessageCircle, LogOut, X } from 'lucide-react';
import Avatar from './Avatar';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { formatDistanceToNow } from 'date-fns';

export default function ChatList({ conversations, activeId, onSelect, onNewChat }) {
  const { user, logout } = useAuth();
  const { onlineUsers } = useSocket();
  const [search, setSearch] = useState('');

  const filtered = conversations.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col bg-[var(--bg-light)] border-r border-[var(--border)]">
      <div className="p-4 border-b border-[var(--border)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Avatar name={user?.username} color={user?.avatar} size="md" />
            <div>
              <h2 className="font-semibold">{user?.username}</h2>
              <p className="text-xs text-[var(--success)]">Online</p>
            </div>
          </div>
          <div className="flex gap-1">
            <button
              onClick={onNewChat}
              className="p-2 rounded-lg hover:bg-[var(--bg)] transition-colors"
              title="New chat"
            >
              <Plus className="w-5 h-5 text-[var(--text-muted)]" />
            </button>
            <button
              onClick={logout}
              className="p-2 rounded-lg hover:bg-[var(--bg)] transition-colors"
              title="Logout"
            >
              <LogOut className="w-5 h-5 text-[var(--text-muted)]" />
            </button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X className="w-4 h-4 text-[var(--text-muted)]" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] p-4">
            <MessageCircle className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm">No conversations yet</p>
            <button
              onClick={onNewChat}
              className="mt-2 text-sm text-[var(--primary)] hover:underline"
            >
              Start a new chat
            </button>
          </div>
        ) : (
          <div className="py-1">
            {filtered.map((conv) => {
              const otherUser = conv.type === 'direct' ? conv.members?.find(m => m.id !== user?.id) : null;
              const isOnline = otherUser ? onlineUsers.has(otherUser.id) : false;

              return (
                <button
                  key={conv.id}
                  onClick={() => onSelect(conv)}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg)] transition-colors ${
                    activeId === conv.id ? 'bg-[var(--bg)]' : ''
                  }`}
                >
                  <Avatar
                    name={conv.name}
                    color={conv.avatar}
                    online={conv.type === 'direct' ? isOnline : undefined}
                  />
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium truncate">{conv.name}</h3>
                      {conv.last_message_at && (
                        <span className="text-xs text-[var(--text-muted)]">
                          {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: false })}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-sm text-[var(--text-muted)] truncate">
                        {conv.last_message || 'No messages yet'}
                      </p>
                      {conv.unread > 0 && (
                        <span className="ml-2 px-2 py-0.5 bg-[var(--primary)] text-white text-xs rounded-full font-medium">
                          {conv.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}