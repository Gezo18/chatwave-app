import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { api } from '../utils/api';
import { format } from 'date-fns';

export default function SearchPanel({ isOpen, onClose, conversationId, onNavigate }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [globalSearch, setGlobalSearch] = useState(false);

  const handleSearch = async (q) => {
    setQuery(q);
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const data = globalSearch
        ? await api.search.global(q)
        : await api.conversations.search(conversationId, q);
      setResults(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="absolute top-0 left-0 right-0 bottom-0 z-30 bg-[var(--bg-light)] flex flex-col">
      <div className="p-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search messages..."
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-[var(--primary)]"
              autoFocus
            />
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--bg)]">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] cursor-pointer">
            <input
              type="checkbox"
              checked={globalSearch}
              onChange={(e) => { setGlobalSearch(e.target.checked); handleSearch(query); }}
              className="rounded"
            />
            Search all conversations
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : results.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-[var(--text-muted)] text-sm">
            {query ? 'No results found' : 'Type to search'}
          </div>
        ) : (
          <div className="py-2">
            {results.map((msg) => (
              <button
                key={msg.id}
                onClick={() => onNavigate(msg)}
                className="w-full px-4 py-3 hover:bg-[var(--bg)] transition-colors text-left"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{msg.sender_name}</span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {format(new Date(msg.created_at), 'MMM d, HH:mm')}
                  </span>
                </div>
                <p className="text-sm text-[var(--text-muted)] line-clamp-2">{msg.content}</p>
                {globalSearch && msg.conversation_name && (
                  <p className="text-xs text-[var(--primary)] mt-1">in {msg.conversation_name}</p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
