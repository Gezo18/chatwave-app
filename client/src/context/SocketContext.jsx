import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [typingUsers, setTypingUsers] = useState({});
  const callbacksRef = useRef({});
  const [incomingCall, setIncomingCall] = useState(null);

  useEffect(() => {
    if (!user) return;

    const token = localStorage.getItem('chatwave_token');
    const socket = io(window.location.origin, {
      auth: { token },
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('user:online', ({ userId, online }) => {
      setOnlineUsers(prev => {
        const next = new Set(prev);
        online ? next.add(userId) : next.delete(userId);
        return next;
      });
    });

    socket.on('typing:start', ({ conversationId, userId, username }) => {
      setTypingUsers(prev => ({ ...prev, [conversationId]: { typing: true, userId, username } }));
    });

    socket.on('typing:stop', ({ conversationId }) => {
      setTypingUsers(prev => ({ ...prev, [conversationId]: { typing: false } }));
    });

    // Forward all events to registered callbacks
    const events = ['message:new', 'message:read', 'message:edited', 'message:deleted', 'reaction:changed',
      'call:incoming', 'call:accepted', 'call:rejected', 'call:ended', 'call:signal'];
    events.forEach(event => {
      socket.on(event, (data) => {
        if (event === 'call:incoming') {
          setIncomingCall(data);
        }
        (callbacksRef.current[event] || []).forEach(cb => cb(data));
      });
    });

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  const emit = useCallback((event, data) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    }
  }, []);

  const on = useCallback((event, callback) => {
    if (!callbacksRef.current[event]) callbacksRef.current[event] = [];
    callbacksRef.current[event].push(callback);
  }, []);

  const off = useCallback((event, callback) => {
    callbacksRef.current[event] = (callbacksRef.current[event] || []).filter(cb => cb !== callback);
  }, []);

  return (
    <SocketContext.Provider value={{ connected, onlineUsers, typingUsers, emit, on, off, incomingCall, setIncomingCall }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
}
