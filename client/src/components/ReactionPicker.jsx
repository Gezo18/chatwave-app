import { useState, useRef, useEffect } from 'react';
import { SmilePlus } from 'lucide-react';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '🎉', '🤔', '💯', '✅', '🙏'];

export default function ReactionPicker({ onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="p-1 rounded hover:bg-[var(--border)] transition-colors opacity-0 group-hover:opacity-100"
        title="Add reaction"
      >
        <SmilePlus className="w-4 h-4 text-[var(--text-muted)]" />
      </button>
      {open && (
        <div className="absolute bottom-full mb-1 left-0 bg-[var(--bg-light)] border border-[var(--border)] rounded-xl p-2 shadow-lg z-20 animate-fadeIn">
          <div className="reaction-picker">
            {QUICK_EMOJIS.map(emoji => (
              <button
                key={emoji}
                onClick={() => { onSelect(emoji); setOpen(false); }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
