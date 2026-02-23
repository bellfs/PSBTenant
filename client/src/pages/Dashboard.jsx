import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../utils/api';
import { AlertCircle, CheckCircle2, ArrowUpRight, Building2, Zap } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getIssueStats().then(setStats).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 100 }}>
        <div className="loading-spinner" />
      </div>
    );
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>Overview of your maintenance operations across all properties</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card accent">
          <div className="stat-card-label">Open Issues</div>
          <div className="stat-card-value">{stats?.open || 0}</div>
          <div className="stat-card-sub">{stats?.today || 0} reported today</div>
        </div>
        <div className="stat-card warning">
          <div className="stat-card-label">In Progress</div>
          <div className="stat-card-value">{stats?.in_progress || 0}</div>
          <div className="stat-card-sub">Being worked on</div>
        </div>
        <div className="stat-card danger">
          <div className="stat-card-label">Escalated</div>
          <div className="stat-card-value">{stats?.escalated || 0}</div>
          <div className="stat-card-sub">{stats?.urgent || 0} urgent</div>
        </div>
        <div className="stat-card success">
          <div className="stat-card-label">Resolved</div>
          <div className="stat-card-value">{stats?.resolved || 0}</div>
          <div className="stat-card-sub">All time</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card fade-in-delay-1">
          <div className="card-header">
            <h3>
              <Zap size={14} style={{ display: 'inline', marginRight: 6, color: 'var(--danger)' }} />
              Recent Escalations
            </h3>
            <Link to="/issues?status=escalated" className="btn btn-ghost btn-sm">
              View all <ArrowUpRight size={12} />
            </Link>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {stats?.recent_escalations?.length > 0 ? (
              <table>
                <tbody>
                  {stats.recent_escalations.map(issue => (
                    <tr key={issue.id}>
                      <td style={{ width: 80 }}>
                        <span className="issue-ref">{issue.uuid}</span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{issue.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {issue.tenant_name} &middot; {issue.property_name}
                        </div>
                      </td>
                      <td style={{ width: 80 }}>
                        <span className={`badge badge-${issue.priority}`}>{issue.priority}</span>
                      </td>
                      <td style={{ width: 40 }}>
                        <Link to={`/issues/${issue.id}`} className="btn btn-ghost btn-sm">
                          <ArrowUpRight size={14} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty-state" style={{ padding: 40 }}>
                <CheckCircle2 />
                <h3>All clear</h3>
                <p>No escalated issues at the moment</p>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card fade-in-delay-2">
            <div className="card-header">
              <h3>
                <AlertCircle size={14} style={{ display: 'inline', marginRight: 6 }} />
                By Category
              </h3>
            </div>
            <div className="card-body" style={{ padding: '12px 20px' }}>
              {stats?.by_category?.length > 0 ? stats.by_category.map((cat, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 0',
                  borderBottom: i < stats.by_category.length - 1 ? '1px solid var(--border-light)' : 'none'
                }}>
                  <span style={{ fontSize: 13, textTransform: 'capitalize' }}>
                    {cat.category?.replace(/_/g, ' ') || 'Uncategorised'}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{cat.count}</span>
                </div>
              )) : (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  No open issues
                </div>
              )}
            </div>
          </div>

          <div className="card fade-in-delay-3">
            <div className="card-header">
              <h3>
                <Building2 size={14} style={{ display: 'inline', marginRight: 6 }} />
                By Property
              </h3>
            </div>
            <div className="card-body" style={{ padding: '12px 20px' }}>
              {stats?.by_property?.length > 0 ? stats.by_property.map((prop, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 0',
                  borderBottom: i < stats.by_property.length - 1 ? '1px solid var(--border-light)' : 'none'
                }}>
                  <span style={{ fontSize: 13 }}>{prop.name || 'Unknown'}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{prop.count}</span>
                </div>
              )) : (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  No open issues
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
        <Link to="/issues" className="btn btn-primary">
          <AlertCircle size={15} /> View All Issues
        </Link>
        <Link to="/properties" className="btn btn-secondary">
          <Building2 size={15} /> Manage Properties
        </Link>
      </div>
    </div>
  );
}
