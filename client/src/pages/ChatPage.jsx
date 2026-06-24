import { useState, useEffect, useCallback } from 'react';
import ChatList from '../components/ChatList';
import ChatWindow from '../components/ChatWindow';
import NewChatModal from '../components/NewChatModal';
import { useSocket } from '../context/SocketContext';
import { api } from '../utils/api';

export default function ChatPage() {
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [loading, setLoading] = useState(true);
  const { on, off } = useSocket();

  const loadConversations = useCallback(async () => {
    try {
      const convs = await api.conversations.list();
      setConversations(convs);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Poll conversation list every 2 seconds
  useEffect(() => {
    let lastCheck = new Date().toISOString();

    const interval = setInterval(async () => {
      try {
        const updates = await api.conversations.pollList(lastCheck);
        if (updates.length > 0) {
          await loadConversations();
        }
        lastCheck = new Date().toISOString();
      } catch (err) {
        // ignore
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [loadConversations]);

  useEffect(() => {
    const handleNewMessage = (msg) => {
      setConversations(prev => {
        return prev.map(conv => {
          if (conv.id === msg.conversation_id) {
            return {
              ...conv,
              last_message: msg.content,
              last_message_at: msg.created_at,
              last_message_sender: msg.sender_id,
              unread: msg.sender_id !== activeConv?.id ? (conv.unread || 0) + 1 : conv.unread
            };
          }
          return conv;
        }).sort((a, b) => {
          if (!a.last_message_at) return 1;
          if (!b.last_message_at) return -1;
          return new Date(b.last_message_at) - new Date(a.last_message_at);
        });
      });
    };

    const handleReadReceipt = ({ conversationId }) => {
      setConversations(prev => prev.map(conv => {
        if (conv.id === conversationId) {
          return { ...conv, unread: 0 };
        }
        return conv;
      }));
    };

    on('message:new', handleNewMessage);
    on('message:read', handleReadReceipt);

    return () => {
      off('message:new', handleNewMessage);
      off('message:read', handleReadReceipt);
    };
  }, [activeConv, on, off]);

  const handleSelectConv = async (conv) => {
    setActiveConv(conv);
    setConversations(prev => prev.map(c => 
      c.id === conv.id ? { ...c, unread: 0 } : c
    ));
  };

  const handleNewChatCreated = async (convId) => {
    await loadConversations();
    const convs = await api.conversations.list();
    const newConv = convs.find(c => c.id === convId);
    if (newConv) setActiveConv(newConv);
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="w-10 h-10 border-3 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-[var(--bg)]">
      <div className={`${activeConv ? 'hidden md:flex' : 'flex'} w-full md:w-80 lg:w-96 flex-shrink-0`}>
        <ChatList
          conversations={conversations}
          activeId={activeConv?.id}
          onSelect={handleSelectConv}
          onNewChat={() => setShowNewChat(true)}
        />
      </div>

      <div className={`${activeConv ? 'flex' : 'hidden md:flex'} flex-1 min-w-0`}>
        <ChatWindow
          conversation={activeConv}
          onBack={() => setActiveConv(null)}
        />
      </div>

      <NewChatModal
        isOpen={showNewChat}
        onClose={() => setShowNewChat(false)}
        onCreated={handleNewChatCreated}
      />
    </div>
  );
}