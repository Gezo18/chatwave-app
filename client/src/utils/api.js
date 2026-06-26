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
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function uploadFile(path, file) {
  const token = localStorage.getItem('chatwave_token');
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data;
}

export const api = {
  auth: {
    register: (username, password) => request('/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) }),
    login: (username, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    me: () => request('/auth/me'),
    updateProfile: (data) => request('/auth/profile', { method: 'PUT', body: JSON.stringify(data) }),
    uploadAvatar: (file) => uploadFile('/auth/avatar', file),
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
    sendMessage: (id, content, type = 'text', replyTo, encrypted) =>
      request(`/conversations/${id}/messages`, { method: 'POST', body: JSON.stringify({ content, type, replyTo, encrypted }) }),
    uploadFile: (id, file) => uploadFile(`/conversations/${id}/upload`, file),
    search: (id, q) => request(`/conversations/${id}/search?q=${encodeURIComponent(q)}`),
    read: (conversationId, messageIds) => request(`/read/${conversationId}`, { method: 'POST', body: JSON.stringify({ messageIds }) }),
    poll: (id, since) => request(`/conversations/${id}/poll${since ? `?since=${encodeURIComponent(since)}` : ''}`),
    pollList: (since) => request(`/conversations/poll${since ? `?since=${encodeURIComponent(since)}` : ''}`),
    kick: (id, userId) => request(`/conversations/${id}/kick`, { method: 'POST', body: JSON.stringify({ userId }) }),
    addMember: (id, userId) => request(`/conversations/${id}/add`, { method: 'POST', body: JSON.stringify({ userId }) }),
    rename: (id, name) => request(`/conversations/${id}/name`, { method: 'PUT', body: JSON.stringify({ name }) }),
    mute: (id, muted) => request(`/conversations/${id}/mute`, { method: 'PUT', body: JSON.stringify({ muted }) }),
  },
  messages: {
    edit: (id, content) => request(`/messages/${id}`, { method: 'PUT', body: JSON.stringify({ content }) }),
    delete: (id) => request(`/messages/${id}`, { method: 'DELETE' }),
    addReaction: (id, emoji) => request(`/messages/${id}/reactions`, { method: 'POST', body: JSON.stringify({ emoji }) }),
    removeReaction: (id, emoji) => request(`/messages/${id}/reactions/${encodeURIComponent(emoji)}`, { method: 'DELETE' }),
  },
  search: {
    global: (q) => request(`/search?q=${encodeURIComponent(q)}`),
  },
  keys: {
    store: (publicKey) => request('/keys', { method: 'POST', body: JSON.stringify({ publicKey }) }),
    get: (userId) => request(`/keys/${userId}`),
  },
};
