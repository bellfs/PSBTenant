import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../utils/api';
import { ArrowLeft, Send } from 'lucide-react';

export default function IssueDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [ef, setEf] = useState({});
  const [saving, setSaving] = useState(false);

  const load = () => api.getIssue(id).then(d => {
    setData(d);
    setEf({ final_cost: d.issue.final_cost ?? '', final_notes: d.issue.final_notes || '', attended_by: d.issue.attended_by || '', resolution_notes: d.issue.resolution_notes || '', resolved_at: d.issue.resolved_at ? d.issue.resolved_at.slice(0,10) : '' });
  });
  useEffect(() => { load(); }, [id]);
  if (!data) return <div style={{padding:40,textAlign:'center'}}><div className="loading-spinner" style={{margin:'0 auto'}}/></div>;
  const { issue, messages, staff } = data;
  const sendReply = async () => { if (!reply.trim()) return; setSending(true); try { await api.respondToIssue(id, reply); setReply(''); await load(); } finally { setSending(false); } };
  const updateField = async (f) => { await api.updateIssue(id, f); await load(); };
  const saveRes = async () => { setSaving(true); try { await api.updateIssue(id, { final_cost: ef.final_cost !== '' ? parseFloat(ef.final_cost) : null, final_notes: ef.final_notes, attended_by: ef.attended_by, resolution_notes: ef.resolution_notes, resolved_at: ef.resolved_at || null }); await load(); } finally { setSaving(false); } };
  const fmt = d => d ? new Date(d).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : 'N/A';

  return (
    <div className="fade-in">
      <div style={{marginBottom:20}}><Link to="/issues" className="btn btn-ghost btn-sm"><ArrowLeft size={15}/> Back</Link></div>
      <div className="page-header">
        <h2>{issue.title}</h2>
        <p>Ref: {issue.uuid} · <Link to={`/tenants/${issue.tenant_id_ref}`} style={{color:'var(--accent-light)'}}>{issue.tenant_name}</Link> · {issue.property_name}{issue.tenant_flat ? ' · '+issue.tenant_flat : ''}</p>
      </div>
      <div className="detail-grid">
        <div>
          <div className="card">
            <div className="card-header"><h3>Conversation</h3></div>
            <div className="chat-container">
              {messages.map(m => (
                <div key={m.id} className={`chat-bubble ${m.sender}`}>
                  <div className="chat-sender">{m.sender==='tenant'?issue.tenant_name:m.sender==='bot'?'AI Bot':'Staff'}</div>
                  <div style={{whiteSpace:'pre-wrap'}}>{m.content}</div>
                  <div className="chat-time">{fmt(m.created_at)}</div>
                </div>
              ))}
            </div>
            {!['resolved','closed'].includes(issue.status) && (
              <div className="reply-box">
                <textarea className="form-textarea" placeholder="Reply via WhatsApp..." value={reply} onChange={e=>setReply(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendReply();}}}/>
                <button className="btn btn-primary" onClick={sendReply} disabled={sending}><Send size={15}/></button>
              </div>
            )}
          </div>
        </div>
        <div className="detail-sidebar">
          <div className="card"><div className="card-body">
            <div className="detail-field"><span className="detail-field-label">Status</span>
              <select className="form-select" style={{width:'auto',fontSize:12}} value={issue.status} onChange={e=>updateField({status:e.target.value})}>
                <option value="open">Open</option><option value="in_progress">In Progress</option><option value="escalated">Escalated</option><option value="resolved">Resolved</option><option value="closed">Closed</option>
              </select></div>
            <div className="detail-field"><span className="detail-field-label">Priority</span>
              <select className="form-select" style={{width:'auto',fontSize:12}} value={issue.priority} onChange={e=>updateField({priority:e.target.value})}>
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
              </select></div>
            <div className="detail-field"><span className="detail-field-label">Category</span><span style={{textTransform:'capitalize'}}>{(issue.category||'Pending').replace(/_/g,' ')}</span></div>
            <div className="detail-field"><span className="detail-field-label">Reported</span><span>{fmt(issue.created_at)}</span></div>
            {issue.escalated_at && <div className="detail-field"><span className="detail-field-label">Escalated</span><span>{fmt(issue.escalated_at)}</span></div>}
          </div></div>

          <div className="card"><div className="card-header"><h3>AI Estimates</h3></div><div className="card-body">
            <div className="detail-field"><span className="detail-field-label">Est. Cost</span><span>£{Number(issue.estimated_cost||0).toFixed(2)}</span></div>
            <div className="detail-field"><span className="detail-field-label">Est. Hours</span><span>{Number(issue.estimated_hours||0).toFixed(1)}h</span></div>
            {issue.estimated_materials && <div className="detail-field"><span className="detail-field-label">Materials</span><span style={{fontSize:12}}>{(() => { try { return JSON.parse(issue.estimated_materials).join(', '); } catch(e) { return issue.estimated_materials; } })()}</span></div>}
            {issue.ai_diagnosis && <div style={{marginTop:8,fontSize:12,color:'var(--text-secondary)',padding:'8px 0',borderTop:'1px solid var(--border-light)'}}><strong>AI Diagnosis:</strong> {issue.ai_diagnosis}</div>}
          </div></div>

          <div className="card"><div className="card-header"><h3>Resolution Details</h3></div><div className="card-body">
            <div className="form-group"><label className="form-label">Attended By</label>
              <select className="form-select" value={ef.attended_by} onChange={e=>setEf(p=>({...p,attended_by:e.target.value}))}>
                <option value="">Select team member</option>
                {staff?.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select></div>
            <div className="form-group"><label className="form-label">Final Cost (£)</label><input className="form-input" type="number" step="0.01" placeholder="0.00" value={ef.final_cost} onChange={e=>setEf(p=>({...p,final_cost:e.target.value}))}/></div>
            <div className="form-group"><label className="form-label">Date Resolved</label><input className="form-input" type="date" value={ef.resolved_at} onChange={e=>setEf(p=>({...p,resolved_at:e.target.value}))}/></div>
            <div className="form-group"><label className="form-label">Resolution Notes</label><textarea className="form-textarea" rows={3} placeholder="What was done to fix this..." value={ef.resolution_notes} onChange={e=>setEf(p=>({...p,resolution_notes:e.target.value}))}/></div>
            <div className="form-group"><label className="form-label">Additional Notes</label><textarea className="form-textarea" rows={2} placeholder="Any other notes..." value={ef.final_notes} onChange={e=>setEf(p=>({...p,final_notes:e.target.value}))}/></div>
            <button className="btn btn-primary" onClick={saveRes} disabled={saving} style={{width:'100%'}}>{saving ? 'Saving...' : 'Save Resolution Details'}</button>
          </div></div>
        </div>
      </div>
    </div>
  );
}
