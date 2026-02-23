const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('psb_token');
}

export function setToken(token) {
  localStorage.setItem('psb_token', token);
}

export function clearToken() {
  localStorage.removeItem('psb_token');
}

export function getStoredUser() {
  const user = localStorage.getItem('psb_user');
  return user ? JSON.parse(user) : null;
}

export function setStoredUser(user) {
  localStorage.setItem('psb_user', JSON.stringify(user));
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }

  return res.json();
}

export const api = {
  // Auth
  login: (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request('/auth/me'),
  changePassword: (currentPassword, newPassword) => request('/auth/password', { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) }),
  getStaff: () => request('/auth/staff'),
  createStaff: (data) => request('/auth/staff', { method: 'POST', body: JSON.stringify(data) }),

  // Issues
  getIssues: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/issues?${qs}`);
  },
  getIssueStats: () => request('/issues/stats'),
  getIssue: (id) => request(`/issues/${id}`),
  updateIssue: (id, data) => request(`/issues/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  respondToIssue: (id, message) => request(`/issues/${id}/respond`, { method: 'POST', body: JSON.stringify({ message }) }),

  // Properties
  getProperties: () => request('/properties'),
  createProperty: (data) => request('/properties', { method: 'POST', body: JSON.stringify(data) }),
  updateProperty: (id, data) => request(`/properties/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // Tenants
  getTenants: () => request('/tenants'),
  updateTenant: (id, data) => request(`/tenants/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // Settings
  getSettings: () => request('/settings'),
  updateSettings: (data) => request('/settings', { method: 'PUT', body: JSON.stringify(data) }),
};
