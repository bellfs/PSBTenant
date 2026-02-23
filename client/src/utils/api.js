const API_BASE = '/api';
function getToken() { return localStorage.getItem('psb_token'); }
export function setToken(token) { localStorage.setItem('psb_token', token); }
export function clearToken() { localStorage.removeItem('psb_token'); }
export function getStoredUser() { const u = localStorage.getItem('psb_user'); return u ? JSON.parse(u) : null; }
export function setStoredUser(user) { localStorage.setItem('psb_user', JSON.stringify(user)); }

async function request(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}), ...options.headers };
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401) { clearToken(); window.location.href = '/login'; throw new Error('Session expired'); }
  if (!res.ok) { const err = await res.json().catch(() => ({ error: 'Request failed' })); throw new Error(err.error || 'Request failed'); }
  return res.json();
}

function downloadFile(path, filename) {
  const token = getToken();
  return fetch(`${API_BASE}${path}`, { headers: { 'Authorization': `Bearer ${token}` } })
    .then(r => r.blob())
    .then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    });
}

export const api = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request('/auth/me'),
  changePassword: (currentPassword, newPassword) => request('/auth/password', { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) }),
  getStaff: () => request('/auth/staff'),
  createStaff: (data) => request('/auth/staff', { method: 'POST', body: JSON.stringify(data) }),
  getStaffList: () => request('/staff-list'),

  getIssues: (params = {}) => { const qs = new URLSearchParams(params).toString(); return request(`/issues?${qs}`); },
  getIssueStats: () => request('/issues/stats'),
  getIssue: (id) => request(`/issues/${id}`),
  updateIssue: (id, data) => request(`/issues/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  respondToIssue: (id, message) => request(`/issues/${id}/respond`, { method: 'POST', body: JSON.stringify({ message }) }),

  getProperties: () => request('/properties'),
  getPropertyIssues: (id) => request(`/properties/${id}/issues`),
  createProperty: (data) => request('/properties', { method: 'POST', body: JSON.stringify(data) }),
  updateProperty: (id, data) => request(`/properties/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  exportPropertyIssues: (id) => downloadFile(`/properties/${id}/export`, 'property-issues.csv'),

  getTenants: () => request('/tenants'),
  getTenantIssues: (id) => request(`/tenants/${id}/issues`),
  updateTenant: (id, data) => request(`/tenants/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  exportTenantIssues: (id) => downloadFile(`/tenants/${id}/export`, 'tenant-issues.csv'),

  getAnalytics: () => request('/analytics'),
  exportAllIssues: () => downloadFile('/analytics/export', 'maintenance-export.csv'),

  getSettings: () => request('/settings'),
  updateSettings: (data) => request('/settings', { method: 'PUT', body: JSON.stringify(data) }),
};
