import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../App';
import { Save, Plus } from 'lucide-react';

export default function Settings() {
  const { user } = useAuth();
  const [tab, setTab] = useState('ai');
  const [settings, setSettings] = useState({});
  const [staff, setStaff] = useState([]);
  const [saved, setSaved] = useState(false);
  const [newStaff, setNewStaff] = useState({ name: '', email: '', password: '', role: 'maintenance' });
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '' });

  useEffect(() => { api.getSettings().then(setSettings); api.getStaff().then(setStaff); }, []);

  const saveSettings = async () => {
    await api.updateSettings(settings); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };
  const createStaff = async () => {
    if (!newStaff.name || !newStaff.email || !newStaff.password) return;
    await api.createStaff(newStaff); setNewStaff({ name: '', email: '', password: '', role: 'maintenance' });
    api.getStaff().then(setStaff);
  };
  const changePw = async () => {
    await api.changePassword(pwForm.currentPassword, pwForm.newPassword);
    setPwForm({ currentPassword: '', newPassword: '' }); alert('Password changed');
  };

  return (
    <div className="fade-in">
      <div className="page-header"><h2>Settings</h2></div>
      <div className="tabs">
        {['ai','whatsapp','team','account'].map(t => <button key={t} className={`tab ${tab===t?'active':''}`} onClick={()=>setTab(t)}>{t==='ai'?'AI Config':t==='whatsapp'?'WhatsApp':t==='team'?'Team':t==='account'?'Account':t}</button>)}
      </div>

      {tab === 'ai' && <div className="card"><div className="card-body">
        <div className="form-group"><label className="form-label">LLM Provider</label>
          <div className="toggle-group">
            <button className={`toggle-option ${settings.llm_provider==='openai'?'active':''}`} onClick={()=>setSettings(s=>({...s,llm_provider:'openai'}))}>OpenAI</button>
            <button className={`toggle-option ${settings.llm_provider==='anthropic'?'active':''}`} onClick={()=>setSettings(s=>({...s,llm_provider:'anthropic'}))}>Anthropic</button>
          </div>
          <p style={{fontSize:11,color:'var(--text-muted)',marginTop:6}}>Set via Railway env vars for security (OPENAI_API_KEY / ANTHROPIC_API_KEY)</p>
        </div>
        <div className="form-group"><label className="form-label">OpenAI Key</label><input className="form-input" value={settings.openai_api_key||''} onChange={e=>setSettings(s=>({...s,openai_api_key:e.target.value}))} placeholder="sk-..."/>{settings.openai_api_key_set && <span style={{fontSize:11,color:'var(--success)'}}>Key configured</span>}</div>
        <div className="form-group"><label className="form-label">Anthropic Key</label><input className="form-input" value={settings.anthropic_api_key||''} onChange={e=>setSettings(s=>({...s,anthropic_api_key:e.target.value}))} placeholder="sk-ant-..."/>{settings.anthropic_api_key_set && <span style={{fontSize:11,color:'var(--success)'}}>Key configured</span>}</div>
        <div className="form-group"><label className="form-label">Escalation Threshold (bot attempts)</label><input className="form-input" type="number" value={settings.escalation_threshold||3} onChange={e=>setSettings(s=>({...s,escalation_threshold:e.target.value}))}/></div>
        <div className="form-group"><label className="form-label">Escalation Email</label><input className="form-input" value={settings.escalation_email||''} onChange={e=>setSettings(s=>({...s,escalation_email:e.target.value}))}/></div>
        <button className="btn btn-primary" onClick={saveSettings}><Save size={15}/> {saved ? 'Saved!' : 'Save'}</button>
      </div></div>}

      {tab === 'whatsapp' && <div className="card"><div className="card-body">
        <p style={{fontSize:13,color:'var(--text-secondary)',marginBottom:16}}>WhatsApp credentials are set via Railway environment variables for security. The following are configured there:</p>
        <div className="detail-field"><span className="detail-field-label">WHATSAPP_PHONE_NUMBER_ID</span><span className={process.env.WHATSAPP_PHONE_NUMBER_ID?'badge badge-resolved':'badge badge-open'}>{process.env.WHATSAPP_PHONE_NUMBER_ID?'Set':'Set in Railway'}</span></div>
        <div className="detail-field"><span className="detail-field-label">WHATSAPP_ACCESS_TOKEN</span><span className="badge badge-open">Set in Railway</span></div>
        <div className="detail-field"><span className="detail-field-label">WHATSAPP_VERIFY_TOKEN</span><span className="badge badge-open">Set in Railway</span></div>
      </div></div>}

      {tab === 'team' && <div>
        <div className="card" style={{marginBottom:16}}><div className="card-header"><h3>Team Members</h3></div>
          <div className="table-container"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last Login</th></tr></thead><tbody>
            {staff.map(s => <tr key={s.id}><td style={{fontWeight:500}}>{s.name}</td><td>{s.email}</td><td><span className="badge badge-open">{s.role}</span></td><td style={{fontSize:12,color:'var(--text-secondary)'}}>{s.last_login?new Date(s.last_login).toLocaleString('en-GB'):''}</td></tr>)}
          </tbody></table></div>
        </div>
        {user?.role === 'admin' && <div className="card"><div className="card-header"><h3>Add Team Member</h3></div><div className="card-body">
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr auto',gap:12,alignItems:'end'}}>
            <div className="form-group"><label className="form-label">Name</label><input className="form-input" value={newStaff.name} onChange={e=>setNewStaff(s=>({...s,name:e.target.value}))}/></div>
            <div className="form-group"><label className="form-label">Email</label><input className="form-input" value={newStaff.email} onChange={e=>setNewStaff(s=>({...s,email:e.target.value}))}/></div>
            <div className="form-group"><label className="form-label">Password</label><input className="form-input" type="password" value={newStaff.password} onChange={e=>setNewStaff(s=>({...s,password:e.target.value}))}/></div>
            <button className="btn btn-primary" onClick={createStaff} style={{marginBottom:16}}><Plus size={15}/> Add</button>
          </div>
        </div></div>}
      </div>}

      {tab === 'account' && <div className="card"><div className="card-header"><h3>Change Password</h3></div><div className="card-body">
        <div className="form-group"><label className="form-label">Current Password</label><input className="form-input" type="password" value={pwForm.currentPassword} onChange={e=>setPwForm(s=>({...s,currentPassword:e.target.value}))}/></div>
        <div className="form-group"><label className="form-label">New Password</label><input className="form-input" type="password" value={pwForm.newPassword} onChange={e=>setPwForm(s=>({...s,newPassword:e.target.value}))}/></div>
        <button className="btn btn-primary" onClick={changePw}>Change Password</button>
      </div></div>}
    </div>
  );
}
