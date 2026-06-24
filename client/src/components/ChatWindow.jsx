import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Send, Phone, Video, MoreVertical, ArrowLeft, Check, CheckCheck } from 'lucide-react';
import Avatar from './Avatar';
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

function MessageBubble({ message, isOwn, showName, isGroupChat }) {
  const formatTime = (date) => {
    return format(new Date(date), 'HH:mm');
  };

  const readCount = message.reads?.filter(r => r.id !== message.sender_id).length || 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-2 px-4 ${isOwn ? 'flex-row-reverse' : ''}`}
    >
      <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'}`}>
        {isGroupChat && showName && !isOwn && (
          <p className="text-xs text-[var(--primary)] font-medium mb-1 ml-1">{message.sender_name}</p>
        )}
        <div
          className={`rounded-2xl px-4 py-2.5 ${
            isOwn
              ? 'bg-[var(--message-own)] text-white rounded-br-sm'
              : 'bg-[var(--message-other)] rounded-bl-sm'
          }`}
        >
          <p className="text-sm break-words">{message.content}</p>
          <div className={`flex items-center gap-1 mt-1 ${isOwn ? 'justify-end' : ''}`}>
            <span className="text-[10px] opacity-70">{formatTime(message.created_at)}</span>
            {isOwn && (
              readCount > 0
                ? <CheckCheck className="w-3.5 h-3.5 opacity-70" />
                : <Check className="w-3.5 h-3.5 opacity-70" />
            )}
          </div>
        </div>
      </div>
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

export default function ChatWindow({ conversation, onBack }) {
  const { user } = useAuth();
  const { emit, on, off, typingUsers, onlineUsers } = useSocket();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const containerRef = useRef(null);

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
      .then(msgs => {
        setMessages(msgs);
        scrollToBottom(false);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [conversation, scrollToBottom]);

  useEffect(() => {
    if (!conversation) return;

    const handleNewMessage = (msg) => {
      if (msg.conversation_id === conversation.id) {
        setMessages(prev => [...prev, msg]);
        scrollToBottom();

        if (msg.sender_id !== user?.id) {
          emit('message:read', {
            conversationId: conversation.id,
            messageIds: [msg.id]
          });
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

    on('message:new', handleNewMessage);
    on('message:read', handleReadReceipt);

    return () => {
      off('message:new', handleNewMessage);
      off('message:read', handleReadReceipt);
    };
  }, [conversation, user, on, off, emit, scrollToBottom]);

  useEffect(() => {
    if (!conversation || !messages.length) return;

    const unreadIds = messages
      .filter(m => m.sender_id !== user?.id && !(m.reads?.find(r => r.id === user?.id)))
      .map(m => m.id);

    if (unreadIds.length > 0) {
      emit('message:read', {
        conversationId: conversation.id,
        messageIds: unreadIds
      });
    }
  }, [conversation, messages, user, emit]);

  const handleSend = () => {
    if (!input.trim() || !conversation) return;

    emit('message:send', {
      conversationId: conversation.id,
      content: input.trim()
    });

    setInput('');
    emit('typing:stop', { conversationId: conversation.id });
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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
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
    <div className="flex-1 flex flex-col bg-[var(--bg)]">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-light)]">
        <button onClick={onBack} className="md:hidden p-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <Avatar
          name={conversation.name}
          color={conversation.avatar}
          online={conversation.type === 'direct' ? isOnline : undefined}
        />
        <div className="flex-1">
          <h3 className="font-semibold">{conversation.name}</h3>
          <p className="text-xs text-[var(--text-muted)]">
            {typingInfo?.typing
              ? `${typingInfo.username} is typing...`
              : conversation.type === 'direct'
                ? isOnline ? 'Online' : 'Offline'
                : `${conversation.members?.length || 0} members`
            }
          </p>
        </div>
        <div className="flex gap-1">
          <button className="p-2 rounded-lg hover:bg-[var(--bg)] transition-colors">
            <Phone className="w-5 h-5 text-[var(--text-muted)]" />
          </button>
          <button className="p-2 rounded-lg hover:bg-[var(--bg)] transition-colors">
            <Video className="w-5 h-5 text-[var(--text-muted)]" />
          </button>
          <button className="p-2 rounded-lg hover:bg-[var(--bg)] transition-colors">
            <MoreVertical className="w-5 h-5 text-[var(--text-muted)]" />
          </button>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-y-auto py-4 space-y-1">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {groupedMessages.map((item, i) => {
              if (item.type === 'date') {
                return <DateSeparator key={`date-${i}`} date={item.date} />;
              }

              const msg = item.data;
              const isOwn = msg.sender_id === user?.id;
              const prevMsg = i > 0 ? groupedMessages[i - 1] : null;
              const showName = !prevMsg || prevMsg.type === 'date' || prevMsg.data?.sender_id !== msg.sender_id;

              return (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isOwn={isOwn}
                  showName={showName}
                  isGroupChat={conversation.type === 'group'}
                />
              );
            })}

            {typingInfo?.typing && (
              <TypingIndicator username={typingInfo.username} />
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      <div className="p-4 border-t border-[var(--border)] bg-[var(--bg-light)]">
        <div className="flex items-end gap-2">
          <div className="flex-1 bg-[var(--bg)] rounded-2xl border border-[var(--border)] focus-within:border-[var(--primary)] transition-colors">
            <textarea
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
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
      </div>
    </div>
  );
}