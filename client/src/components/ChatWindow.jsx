import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Send, Phone, Video, MoreVertical, ArrowLeft, Check, CheckCheck, Search, Paperclip, Image, SmilePlus, Reply, Edit3, Trash2, Lock, X, Settings } from 'lucide-react';
import Avatar from './Avatar';
import ReactionPicker from './ReactionPicker';
import SearchPanel from './SearchPanel';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { api } from '../utils/api';
import { format, isToday, isYesterday } from 'date-fns';

function TypingIndicator({ username }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <div className="bg-[var(--message-other)] rounded-2xl rounded-bl-sm px-4 py-2.5">
        <div className="flex gap-1">
          <span className="typing-dot w-2 h-2 bg-[var(--text-muted)] rounded-full" />
          <span className="typing-dot w-2 h-2 bg-[var(--text-muted)] rounded-full" />
          <span className="typing-dot w-2 h-2 bg-[var(--text-muted)] rounded-full" />
        </div>
      </div>
      <span className="text-xs text-[var(--text-muted)]">{username} is typing...</span>
    </div>
  );
}

function MessageBubble({ message, isOwn, showName, isGroupChat, onReply, onEdit, onDelete, onReaction }) {
  const [showActions, setShowActions] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const formatTime = (date) => format(new Date(date), 'HH:mm');
  const readCount = message.reads?.filter(r => r.id !== message.sender_id).length || 0;

  // Group reactions by emoji
  const reactionGroups = {};
  (message.reactions || []).forEach(r => {
    if (!reactionGroups[r.emoji]) reactionGroups[r.emoji] = [];
    reactionGroups[r.emoji].push(r);
  });

  const handleEditSave = async () => {
    if (editContent.trim() && editContent !== message.content) {
      await onEdit(message.id, editContent);
    }
    setEditing(false);
  };

  if (message.deleted) {
    return (
      <div className={`flex gap-2 px-4 ${isOwn ? 'flex-row-reverse' : ''}`}>
        <div className="max-w-[75%]">
          <div className="rounded-2xl px-4 py-2.5 bg-[var(--message-other)] rounded-bl-sm opacity-50">
            <p className="text-sm italic text-[var(--text-muted)]">This message was deleted</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-2 px-4 group relative ${isOwn ? 'flex-row-reverse' : ''}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'}`}>
        {isGroupChat && showName && !isOwn && (
          <p className="text-xs text-[var(--primary)] font-medium mb-1 ml-1">{message.sender_name}</p>
        )}

        {/* Reply preview */}
        {message.reply_to_message && (
          <div className={`mb-1 ml-1 pl-2 border-l-2 border-[var(--primary)] text-xs text-[var(--text-muted)]`}>
            <span className="font-medium">{message.reply_to_message.sender_name}</span>
            <p className="truncate max-w-[200px]">{message.reply_to_message.content}</p>
          </div>
        )}

        <div
          className={`rounded-2xl px-4 py-2.5 ${
            isOwn
              ? 'bg-[var(--message-own)] text-white rounded-br-sm'
              : 'bg-[var(--message-other)] rounded-bl-sm'
          }`}
        >
          {/* File/Image */}
          {message.type === 'image' && message.file_url && (
            <img
              src={message.file_url}
              alt={message.file_name}
              className="max-w-full rounded-lg mb-2 max-h-64 object-cover"
              loading="lazy"
            />
          )}
          {message.type === 'file' && message.file_url && (
            <a
              href={message.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 mb-2 p-2 bg-black/10 rounded-lg hover:bg-black/20 transition-colors"
            >
              <Paperclip className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm truncate">{message.file_name}</span>
            </a>
          )}

          {editing ? (
            <div className="flex gap-1">
              <input
                type="text"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleEditSave(); if (e.key === 'Escape') setEditing(false); }}
                className="flex-1 bg-transparent text-sm border-b border-white/30 focus:outline-none px-0 py-1"
                autoFocus
              />
              <button onClick={handleEditSave} className="text-xs opacity-70 hover:opacity-100">✓</button>
            </div>
          ) : (
            <p className="text-sm break-words whitespace-pre-wrap">{message.content}</p>
          )}

          <div className={`flex items-center gap-1 mt-1 ${isOwn ? 'justify-end' : ''}`}>
            {message.encrypted && <Lock className="w-3 h-3 opacity-50" />}
            {message.edited && <span className="text-[10px] opacity-50">edited</span>}
            <span className="text-[10px] opacity-70">{formatTime(message.created_at)}</span>
            {isOwn && (
              readCount > 0
                ? <CheckCheck className="w-3.5 h-3.5 opacity-70" />
                : <Check className="w-3.5 h-3.5 opacity-70" />
            )}
          </div>
        </div>

        {/* Reactions */}
        {Object.keys(reactionGroups).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1 ml-1">
            {Object.entries(reactionGroups).map(([emoji, users]) => (
              <button
                key={emoji}
                onClick={() => onReaction(message.id, emoji)}
                className="flex items-center gap-0.5 px-1.5 py-0.5 bg-[var(--border)] rounded-full text-xs hover:bg-[var(--primary)]/20 transition-colors"
              >
                <span>{emoji}</span>
                <span className="text-[10px] text-[var(--text-muted)]">{users.length}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Hover actions */}
      {showActions && !editing && (
        <div className={`absolute top-0 ${isOwn ? 'left-0 -translate-x-full' : 'right-0 translate-x-full'} flex items-center gap-0.5 bg-[var(--bg-light)] border border-[var(--border)] rounded-lg px-1 py-0.5 shadow-lg z-10`}>
          <ReactionPicker onSelect={(emoji) => onReaction(message.id, emoji)} />
          <button onClick={() => onReply(message)} className="p-1 rounded hover:bg-[var(--border)] transition-colors" title="Reply">
            <Reply className="w-4 h-4 text-[var(--text-muted)]" />
          </button>
          {isOwn && (
            <>
              <button onClick={() => { setEditing(true); setEditContent(message.content); }} className="p-1 rounded hover:bg-[var(--border)] transition-colors" title="Edit">
                <Edit3 className="w-4 h-4 text-[var(--text-muted)]" />
              </button>
              <button onClick={() => onDelete(message.id)} className="p-1 rounded hover:bg-[var(--danger)]/20 transition-colors" title="Delete">
                <Trash2 className="w-4 h-4 text-[var(--danger)]" />
              </button>
            </>
          )}
        </div>
      )}
    </motion.div>
  );
}

function DateSeparator({ date }) {
  let label;
  if (isToday(new Date(date))) label = 'Today';
  else if (isYesterday(new Date(date))) label = 'Yesterday';
  else label = format(new Date(date), 'MMM d, yyyy');
  return (
    <div className="flex items-center gap-4 px-4 py-2">
      <div className="flex-1 h-px bg-[var(--border)]" />
      <span className="text-xs text-[var(--text-muted)] font-medium">{label}</span>
      <div className="flex-1 h-px bg-[var(--border)]" />
    </div>
  );
}

export default function ChatWindow({ conversation, onBack, onGroupSettings }) {
  const { user } = useAuth();
  const { emit, on, off, typingUsers, onlineUsers } = useSocket();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [encrypt, setEncrypt] = useState(false);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);
  const callModalRef = useRef(null);

  const otherUser = conversation?.type === 'direct'
    ? conversation.members?.find(m => m.id !== user?.id)
    : null;

  const isOnline = otherUser ? onlineUsers.has(otherUser.id) : false;
  const typingInfo = conversation ? typingUsers[conversation.id] : null;

  const scrollToBottom = useCallback((smooth = true) => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' });
    }, 50);
  }, []);

  useEffect(() => {
    if (!conversation) return;
    setLoading(true);
    api.conversations.messages(conversation.id)
      .then(msgs => { setMessages(msgs); scrollToBottom(false); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [conversation, scrollToBottom]);

  // Polling for new messages
  useEffect(() => {
    if (!conversation) return;
    const pollInterval = setInterval(async () => {
      try {
        const lastMsg = messages[messages.length - 1];
        const since = lastMsg?.created_at;
        const newMsgs = await api.conversations.poll(conversation.id, since);
        if (newMsgs.length > 0) {
          setMessages(prev => {
            const existingIds = new Set(prev.map(m => m.id));
            const unique = newMsgs.filter(m => !existingIds.has(m.id));
            return unique.length > 0 ? [...prev, ...unique] : prev;
          });
          scrollToBottom();
        }
      } catch (err) { /* ignore */ }
    }, 2000);
    return () => clearInterval(pollInterval);
  }, [conversation, messages, scrollToBottom]);

  // Socket events
  useEffect(() => {
    if (!conversation) return;

    const handleNewMessage = (msg) => {
      if (msg.conversation_id === conversation.id) {
        setMessages(prev => [...prev, msg]);
        scrollToBottom();
        if (msg.sender_id !== user?.id) {
          emit('message:read', { conversationId: conversation.id, messageIds: [msg.id] });
          // Browser notification
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(`New message from ${msg.sender_name}`, { body: msg.content, icon: '/favicon.svg' });
          }
        }
      }
    };

    const handleReadReceipt = ({ conversationId, messageIds, userId, readAt }) => {
      if (conversationId === conversation.id) {
        setMessages(prev => prev.map(msg => {
          if (messageIds.includes(msg.id)) {
            const existingReads = msg.reads || [];
            if (!existingReads.find(r => r.id === userId)) {
              return { ...msg, reads: [...existingReads, { id: userId, read_at: readAt }] };
            }
          }
          return msg;
        }));
      }
    };

    const handleMessageEdited = ({ message }) => {
      setMessages(prev => prev.map(m => m.id === message.id ? { ...m, ...message } : m));
    };

    const handleMessageDeleted = ({ messageId }) => {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, deleted: 1, content: 'This message was deleted' } : m));
    };

    const handleReactionChanged = ({ messageId, reactions }) => {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions } : m));
    };

    on('message:new', handleNewMessage);
    on('message:read', handleReadReceipt);
    on('message:edited', handleMessageEdited);
    on('message:deleted', handleMessageDeleted);
    on('reaction:changed', handleReactionChanged);

    return () => {
      off('message:new', handleNewMessage);
      off('message:read', handleReadReceipt);
      off('message:edited', handleMessageEdited);
      off('message:deleted', handleMessageDeleted);
      off('reaction:changed', handleReactionChanged);
    };
  }, [conversation, user, on, off, emit, scrollToBottom]);

  // Mark unread messages as read
  useEffect(() => {
    if (!conversation || !messages.length) return;
    const unreadIds = messages
      .filter(m => m.sender_id !== user?.id && !m.deleted && !(m.reads?.find(r => r.id === user?.id)))
      .map(m => m.id);
    if (unreadIds.length > 0) {
      emit('message:read', { conversationId: conversation.id, messageIds: unreadIds });
    }
  }, [conversation, messages, user, emit]);

  const handleSend = () => {
    if (!input.trim() || !conversation) return;

    emit('message:send', {
      conversationId: conversation.id,
      content: input.trim(),
      replyTo: replyTo?.id,
      encrypted: encrypt
    });

    setInput('');
    setReplyTo(null);
    emit('typing:stop', { conversationId: conversation.id });
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !conversation) return;
    try {
      const msg = await api.conversations.uploadFile(conversation.id, file);
      setMessages(prev => [...prev, msg]);
      scrollToBottom();
    } catch (err) {
      console.error('Upload failed:', err);
    }
    e.target.value = '';
  };

  const handleEdit = async (messageId, content) => {
    try {
      const updated = await api.messages.edit(messageId, content);
      setMessages(prev => prev.map(m => m.id === messageId ? updated : m));
      emit('message:edited', { conversationId: conversation.id, message: updated });
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDelete = async (messageId) => {
    if (!confirm('Delete this message?')) return;
    try {
      await api.messages.delete(messageId);
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, deleted: 1, content: 'This message was deleted' } : m));
      emit('message:deleted', { conversationId: conversation.id, messageId });
    } catch (err) {
      alert(err.message);
    }
  };

  const handleReaction = async (messageId, emoji) => {
    try {
      const msg = messages.find(m => m.id === messageId);
      const existing = msg?.reactions?.find(r => r.emoji === emoji && r.user_id === user?.id);
      let reactions;
      if (existing) {
        reactions = await api.messages.removeReaction(messageId, emoji);
      } else {
        reactions = await api.messages.addReaction(messageId, emoji);
      }
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions } : m));
      emit('reaction:changed', { conversationId: conversation.id, messageId, reactions });
    } catch (err) {
      console.error(err);
    }
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    if (!conversation) return;
    emit('typing:start', { conversationId: conversation.id });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      emit('typing:stop', { conversationId: conversation.id });
    }, 2000);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    if (e.key === 'Escape') setReplyTo(null);
  };

  const handleNavigateToMessage = (msg) => {
    setShowSearch(false);
    // highlight message briefly
    const el = document.getElementById(`msg-${msg.id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const startCall = (type) => {
    // Find the CallModal ref from parent
    if (callModalRef.current) {
      callModalRef.current.startCall(type);
    }
  };

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--bg)]">
        <div className="text-center">
          <div className="w-20 h-20 bg-[var(--bg-light)] rounded-full flex items-center justify-center mx-auto mb-4">
            <Send className="w-8 h-8 text-[var(--text-muted)]" />
          </div>
          <h3 className="text-lg font-semibold text-[var(--text-muted)]">Select a conversation</h3>
          <p className="text-sm text-[var(--text-muted)] mt-1">Choose a chat to start messaging</p>
        </div>
      </div>
    );
  }

  const groupedMessages = [];
  let lastDate = null;
  messages.forEach((msg) => {
    const msgDate = format(new Date(msg.created_at), 'yyyy-MM-dd');
    if (msgDate !== lastDate) {
      groupedMessages.push({ type: 'date', date: msg.created_at });
      lastDate = msgDate;
    }
    groupedMessages.push({ type: 'message', data: msg });
  });

  return (
    <div className="flex-1 flex flex-col bg-[var(--bg)] relative">
      {/* Search panel overlay */}
      <SearchPanel
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
        conversationId={conversation.id}
        onNavigate={handleNavigateToMessage}
      />

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-light)]">
        <button onClick={onBack} className="md:hidden p-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <Avatar name={conversation.name} color={conversation.avatar} online={conversation.type === 'direct' ? isOnline : undefined} />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold truncate">{conversation.name}</h3>
          <p className="text-xs text-[var(--text-muted)]">
            {typingInfo?.typing
              ? `${typingInfo.username} is typing...`
              : conversation.type === 'direct'
                ? isOnline ? 'Online' : 'Offline'
                : `${conversation.members?.length || 0} members`}
          </p>
        </div>
        <div className="flex gap-1 relative">
          <button onClick={() => setShowSearch(true)} className="p-2 rounded-lg hover:bg-[var(--bg)] transition-colors" title="Search">
            <Search className="w-5 h-5 text-[var(--text-muted)]" />
          </button>
          <button onClick={() => startCall('audio')} className="p-2 rounded-lg hover:bg-[var(--bg)] transition-colors" title="Audio call">
            <Phone className="w-5 h-5 text-[var(--text-muted)]" />
          </button>
          <button onClick={() => startCall('video')} className="p-2 rounded-lg hover:bg-[var(--bg)] transition-colors" title="Video call">
            <Video className="w-5 h-5 text-[var(--text-muted)]" />
          </button>
          <div className="relative">
            <button onClick={() => setShowMenu(!showMenu)} className="p-2 rounded-lg hover:bg-[var(--bg)] transition-colors">
              <MoreVertical className="w-5 h-5 text-[var(--text-muted)]" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 bg-[var(--bg-light)] border border-[var(--border)] rounded-xl py-1 shadow-lg z-20 min-w-[180px] animate-fadeIn">
                <button onClick={() => { setEncrypt(!encrypt); setShowMenu(false); }} className="w-full px-4 py-2 text-sm text-left hover:bg-[var(--bg)] flex items-center gap-2">
                  <Lock className="w-4 h-4" /> {encrypt ? 'Disable' : 'Enable'} Encryption
                </button>
                {conversation.type === 'group' && (
                  <button onClick={() => { onGroupSettings?.(); setShowMenu(false); }} className="w-full px-4 py-2 text-sm text-left hover:bg-[var(--bg)] flex items-center gap-2">
                    <Settings className="w-4 h-4" /> Group Settings
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto py-4 space-y-1">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {groupedMessages.map((item, i) => {
              if (item.type === 'date') return <DateSeparator key={`date-${i}`} date={item.date} />;
              const msg = item.data;
              const isOwn = msg.sender_id === user?.id;
              const prevMsg = i > 0 ? groupedMessages[i - 1] : null;
              const showName = !prevMsg || prevMsg.type === 'date' || prevMsg.data?.sender_id !== msg.sender_id;
              return (
                <div key={msg.id} id={`msg-${msg.id}`}>
                  <MessageBubble
                    message={msg}
                    isOwn={isOwn}
                    showName={showName}
                    isGroupChat={conversation.type === 'group'}
                    onReply={setReplyTo}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onReaction={handleReaction}
                  />
                </div>
              );
            })}
            {typingInfo?.typing && <TypingIndicator username={typingInfo.username} />}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Reply preview */}
      {replyTo && (
        <div className="px-4 py-2 bg-[var(--bg-light)] border-t border-[var(--border)] flex items-center gap-2">
          <Reply className="w-4 h-4 text-[var(--primary)] flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium text-[var(--primary)]">{replyTo.sender_name}</span>
            <p className="text-xs text-[var(--text-muted)] truncate">{replyTo.content}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="p-1">
            <X className="w-4 h-4 text-[var(--text-muted)]" />
          </button>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-[var(--border)] bg-[var(--bg-light)]">
        <div className="flex items-end gap-2">
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-3 rounded-xl hover:bg-[var(--bg)] transition-colors"
            title="Attach file"
          >
            <Paperclip className="w-5 h-5 text-[var(--text-muted)]" />
          </button>
          <div className="flex-1 bg-[var(--bg)] rounded-2xl border border-[var(--border)] focus-within:border-[var(--primary)] transition-colors">
            <textarea
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={encrypt ? 'Encrypted message...' : 'Type a message...'}
              rows={1}
              className="w-full bg-transparent px-4 py-3 text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none resize-none max-h-32"
              style={{ minHeight: '44px' }}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="p-3 bg-[var(--primary)] text-white rounded-xl hover:bg-[var(--primary-dark)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        {encrypt && (
          <div className="flex items-center gap-1 mt-1 text-xs text-[var(--success)]">
            <Lock className="w-3 h-3" /> End-to-end encrypted
          </div>
        )}
      </div>
    </div>
  );
}
