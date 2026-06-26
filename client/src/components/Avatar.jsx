export default function Avatar({ name, color, size = 'md', online, className = '' }) {
  const sizes = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-xl',
  };

  const dotSizes = {
    sm: 'w-2.5 h-2.5 border',
    md: 'w-3 h-3 border-2',
    lg: 'w-3.5 h-3.5 border-2',
    xl: 'w-4 h-4 border-2',
  };

  const isUrl = color && (color.startsWith('/') || color.startsWith('http'));
  const initial = name ? name.charAt(0).toUpperCase() : '?';
  const bgColor = !isUrl && color ? `#${color}` : '#6C63FF';

  return (
    <div className={`relative flex-shrink-0 ${className}`}>
      {isUrl ? (
        <img
          src={color}
          alt={name}
          className={`${sizes[size]} rounded-full object-cover`}
        />
      ) : (
        <div
          className={`${sizes[size]} rounded-full flex items-center justify-center font-semibold text-white`}
          style={{ backgroundColor: bgColor }}
        >
          {initial}
        </div>
      )}
      {online !== undefined && (
        <div
          className={`absolute bottom-0 right-0 ${dotSizes[size]} rounded-full border-[var(--bg-light)] ${
            online ? 'bg-[var(--success)]' : 'bg-[var(--text-muted)]'
          }`}
        />
      )}
    </div>
  );
}
