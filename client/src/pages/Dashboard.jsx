import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../utils/api';
import { AlertCircle, Clock, CheckCircle, AlertTriangle, PoundSterling, Wrench } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  useEffect(() => { api.getIssueStats().then(setStats); }, []);
  if (!stats) return <div style={{ padding: 40, textAlign: 'center' }}><div className="loading-spinner" style={{ margin: '0 auto' }} /></div>;
  return (
    <div className="fade-in">
      <div className="page-header"><h2>Dashboard</h2><p>Overview of maintenance operations</p></div>
      <div className="stats-grid">
        <div className="stat-card accent"><div className="stat-card-label">Open Issues</div><div className="stat-card-value">{stats.open}</div><div className="stat-card-sub">{stats.today} reported today</div></div>
        <div className="stat-card warning"><div className="stat-card-label">In Progress</div><div className="stat-card-value">{stats.in_progress}</div></div>
        <div className="stat-card danger"><div className="stat-card-label">Escalated</div><div className="stat-card-value">{stats.escalated}</div><div className="stat-card-sub">{stats.urgent} urgent</div></div>
        <div className="stat-card success"><div className="stat-card-label">Resolved</div><div className="stat-card-value">{stats.resolved}</div><div className="stat-card-sub">{stats.this_week} this week</div></div>
        <div className="stat-card" style={{ borderLeft: '3px solid #a855f7' }}><div className="stat-card-label">Est. Total Cost</div><div className="stat-card-value">£{(stats.total_estimated_cost || 0).toFixed(0)}</div></div>
        <div className="stat-card" style={{ borderLeft: '3px solid #22d3ee' }}><div className="stat-card-label">Actual Spend</div><div className="stat-card-value">£{(stats.total_final_cost || 0).toFixed(0)}</div></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="card-header"><h3>By Category</h3></div>
          <div className="card-body">
            {stats.by_category?.length ? stats.by_category.map(c => (
              <div key={c.category} className="detail-field"><span className="detail-field-label" style={{ textTransform: 'capitalize' }}>{(c.category || 'uncategorised').replace(/_/g, ' ')}</span><span className="badge badge-medium">{c.count}</span></div>
            )) : <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No active issues</p>}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h3>By Property</h3></div>
          <div className="card-body">
            {stats.by_property?.length ? stats.by_property.map(p => (
              <div key={p.name} className="detail-field"><span className="detail-field-label">{p.name || 'Unassigned'}</span><span className="badge badge-open">{p.count}</span></div>
            )) : <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No active issues</p>}
          </div>
        </div>
      </div>

      {stats.recent_escalations?.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header"><h3>Recent Escalations</h3></div>
          <div className="table-container"><table><thead><tr><th>Ref</th><th>Issue</th><th>Tenant</th><th>Property</th><th>When</th></tr></thead><tbody>
            {stats.recent_escalations.map(i => (
              <tr key={i.id}><td><Link to={`/issues/${i.id}`} className="issue-ref">{i.uuid}</Link></td><td>{i.title}</td><td>{i.tenant_name}</td><td>{i.property_name}</td><td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{i.escalated_at ? new Date(i.escalated_at).toLocaleDateString() : ''}</td></tr>
            ))}
          </tbody></table></div>
        </div>
      )}
    </div>
  );
}
