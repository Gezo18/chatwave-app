import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { api } from '../utils/api';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const [connected] = useState(true);
  const [onlineUsers] = useState(new Set());
  const [typingUsers] = useState({});
  const callbacksRef = useRef({});

  const emit = useCallback((event, data) => {
    if (event === 'message:send') {
      api.conversations.sendMessage(data.conversationId, data.content).then(msg => {
        (callbacksRef.current['message:new'] || []).forEach(cb => cb(msg));
      });
    } else if (event === 'message:read') {
      api.conversations.read(data.conversationId, data.messageIds);
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
    <SocketContext.Provider value={{ connected, onlineUsers, typingUsers, emit, on, off }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
}