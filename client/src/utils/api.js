const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

async function request(path, options = {}) {
  const token = localStorage.getItem('chatwave_token');
  
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  };

  const res = await fetch(`${API_BASE}${path}`, config);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

export const api = {
  auth: {
    register: (username, password) => request('/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) }),
    login: (username, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    me: () => request('/auth/me'),
  },
  users: {
    list: () => request('/users'),
  },
  contacts: {
    list: () => request('/contacts'),
    remove: (id) => request(`/contacts/${id}`, { method: 'DELETE' }),
  },
  conversations: {
    list: () => request('/conversations'),
    create: (data) => request('/conversations', { method: 'POST', body: JSON.stringify(data) }),
    messages: (id, params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/conversations/${id}/messages${query ? `?${query}` : ''}`);
    },
    sendMessage: (id, content, type = 'text') => request(`/conversations/${id}/messages`, { method: 'POST', body: JSON.stringify({ content, type }) }),
    read: (conversationId, messageIds) => request(`/read/${conversationId}`, { method: 'POST', body: JSON.stringify({ messageIds }) }),
    poll: (id, since) => request(`/conversations/${id}/poll${since ? `?since=${encodeURIComponent(since)}` : ''}`),
    pollList: (since) => request(`/conversations/poll${since ? `?since=${encodeURIComponent(since)}` : ''}`),
  },
};