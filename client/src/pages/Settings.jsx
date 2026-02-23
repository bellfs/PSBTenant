import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { Save, Key, Bot, Mail, Shield, UserPlus } from 'lucide-react';

export default function SettingsPage() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('ai');

  // Staff management
  const [staff, setStaff] = useState([]);
  const [newStaff, setNewStaff] = useState({ name: '', email: '', password: '', role: 'maintenance' });
  const [showAddStaff, setShowAddStaff] = useState(false);

  useEffect(() => {
    Promise.all([
      api.getSettings().then(setSettings),
      api.getStaff().then(setStaff)
    ]).catch(console.error).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      alert('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddStaff = async (e) => {
    e.preventDefault();
    try {
      await api.createStaff(newStaff);
      const updated = await api.getStaff();
      setStaff(updated);
      setShowAddStaff(false);
      setNewStaff({ name: '', email: '', password: '', role: 'maintenance' });
    } catch (err) {
      alert(err.message);
    }
  };

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 100 }}>
        <div className="loading-spinner" />
      </div>
    );
  }

  return (
    <div className="fade-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2>Settings</h2>
          <p>Configure your maintenance hub, AI, and integrations</p>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <div className="loading-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <Save size={15} />}
          {saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      <div className="tabs">
        <button className={`tab ${activeTab === 'ai' ? 'active' : ''}`} onClick={() => setActiveTab('ai')}>
          AI Configuration
        </button>
        <button className={`tab ${activeTab === 'bot' ? 'active' : ''}`} onClick={() => setActiveTab('bot')}>
          Bot Settings
        </button>
        <button className={`tab ${activeTab === 'email' ? 'active' : ''}`} onClick={() => setActiveTab('email')}>
          Email / Escalation
        </button>
        <button className={`tab ${activeTab === 'team' ? 'active' : ''}`} onClick={() => setActiveTab('team')}>
          Team
        </button>
      </div>

      {activeTab === 'ai' && (
        <div style={{ maxWidth: 640 }}>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <h3><Key size={14} style={{ display: 'inline', marginRight: 6 }} /> LLM Provider</h3>
            </div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">Active Provider</label>
                <div className="toggle-group">
                  <button
                    className={`toggle-option ${settings.llm_provider === 'anthropic' ? 'active' : ''}`}
                    onClick={() => updateSetting('llm_provider', 'anthropic')}
                  >
                    Anthropic (Claude)
                  </button>
                  <button
                    className={`toggle-option ${settings.llm_provider === 'openai' ? 'active' : ''}`}
                    onClick={() => updateSetting('llm_provider', 'openai')}
                  >
                    OpenAI (GPT)
                  </button>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                  Select which LLM powers the WhatsApp bot and image analysis
                </p>
              </div>

              <div className="form-group">
                <label className="form-label">Anthropic API Key</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="sk-ant-..."
                  value={settings.anthropic_api_key || ''}
                  onChange={e => updateSetting('anthropic_api_key', e.target.value)}
                />
                {settings.anthropic_api_key_set && (
                  <p style={{ fontSize: 11, color: 'var(--success)', marginTop: 4 }}>Key configured (leave blank to keep current)</p>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">OpenAI API Key</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="sk-..."
                  value={settings.openai_api_key || ''}
                  onChange={e => updateSetting('openai_api_key', e.target.value)}
                />
                {settings.openai_api_key_set && (
                  <p style={{ fontSize: 11, color: 'var(--success)', marginTop: 4 }}>Key configured (leave blank to keep current)</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'bot' && (
        <div style={{ maxWidth: 640 }}>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <h3><Bot size={14} style={{ display: 'inline', marginRight: 6 }} /> Bot Behaviour</h3>
            </div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">Escalation Threshold</label>
                <input
                  type="number"
                  className="form-input"
                  style={{ width: 100 }}
                  min="1"
                  max="10"
                  value={settings.escalation_threshold || '3'}
                  onChange={e => updateSetting('escalation_threshold', e.target.value)}
                />
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  Number of bot responses before automatic escalation to your team
                </p>
              </div>

              <div className="form-group">
                <label className="form-label">Welcome Message</label>
                <textarea
                  className="form-textarea"
                  rows={4}
                  value={settings.bot_greeting || ''}
                  onChange={e => updateSetting('bot_greeting', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Escalation Message</label>
                <textarea
                  className="form-textarea"
                  rows={3}
                  value={settings.bot_escalation_message || ''}
                  onChange={e => updateSetting('bot_escalation_message', e.target.value)}
                />
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  Use {'{ref}'} for the issue reference number
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'email' && (
        <div style={{ maxWidth: 640 }}>
          <div className="card">
            <div className="card-header">
              <h3><Mail size={14} style={{ display: 'inline', marginRight: 6 }} /> Escalation Email</h3>
            </div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">Escalation Email Address</label>
                <input
                  type="email"
                  className="form-input"
                  value={settings.escalation_email || ''}
                  onChange={e => updateSetting('escalation_email', e.target.value)}
                />
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  When issues are escalated, full details and photos are emailed here
                </p>
              </div>
              <div style={{ padding: 16, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', marginTop: 12 }}>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  <strong>SMTP configuration</strong> is set via environment variables (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS).
                  The escalation email includes the full conversation log, all photos, tenant details, and AI diagnosis.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'team' && (
        <div style={{ maxWidth: 720 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Team Members</h3>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddStaff(!showAddStaff)}>
              <UserPlus size={14} /> Add Member
            </button>
          </div>

          {showAddStaff && (
            <div className="card fade-in" style={{ marginBottom: 16 }}>
              <div className="card-body">
                <form onSubmit={handleAddStaff} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Name</label>
                    <input className="form-input" value={newStaff.name} onChange={e => setNewStaff({ ...newStaff, name: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input className="form-input" type="email" value={newStaff.email} onChange={e => setNewStaff({ ...newStaff, email: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Password</label>
                    <input className="form-input" type="password" value={newStaff.password} onChange={e => setNewStaff({ ...newStaff, password: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Role</label>
                    <select className="form-select" value={newStaff.role} onChange={e => setNewStaff({ ...newStaff, role: e.target.value })}>
                      <option value="maintenance">Maintenance</option>
                      <option value="admin">Admin</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </div>
                  <div style={{ gridColumn: '1/-1', display: 'flex', gap: 8 }}>
                    <button type="submit" className="btn btn-primary btn-sm">Create</button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAddStaff(false)}>Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <div className="card">
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Last Login</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map(s => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 500 }}>{s.name}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{s.email}</td>
                      <td>
                        <span className={`badge ${s.role === 'admin' ? 'badge-escalated' : 'badge-open'}`}>
                          {s.role}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {s.last_login ? new Date(s.last_login + 'Z').toLocaleDateString('en-GB') : 'Never'}
                      </td>
                      <td>
                        <span className={`badge ${s.active ? 'badge-resolved' : 'badge-closed'}`}>
                          {s.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
