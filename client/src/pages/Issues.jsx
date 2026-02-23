import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../utils/api';
import { Search, Filter } from 'lucide-react';

export default function Issues() {
  const [data, setData] = useState({ issues: [], pagination: {} });
  const [filters, setFilters] = useState({ status: 'all', priority: 'all', search: '', page: 1 });
  const [properties, setProperties] = useState([]);
  useEffect(() => { api.getProperties().then(setProperties); }, []);
  useEffect(() => { api.getIssues(filters).then(setData); }, [filters]);
  const update = (k, v) => setFilters(f => ({ ...f, [k]: v, page: 1 }));
  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
  return (
    <div className="fade-in">
      <div className="page-header"><h2>Issues</h2><p>{data.pagination.total || 0} total issues</p></div>
      <div className="filters-bar">
        <div className="search-input-wrapper"><Search size={15} /><input className="form-input" placeholder="Search issues..." value={filters.search} onChange={e => update('search', e.target.value)} /></div>
        <select className="form-select" value={filters.status} onChange={e => update('status', e.target.value)}>
          <option value="all">All Status</option><option value="open">Open</option><option value="in_progress">In Progress</option><option value="escalated">Escalated</option><option value="resolved">Resolved</option><option value="closed">Closed</option>
        </select>
        <select className="form-select" value={filters.priority} onChange={e => update('priority', e.target.value)}>
          <option value="all">All Priority</option><option value="urgent">Urgent</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
        </select>
      </div>
      <div className="issue-list">
        {data.issues.map(i => (
          <Link to={`/issues/${i.id}`} key={i.id} className="issue-row">
            <span className="issue-ref">{i.uuid}</span>
            <div><div className="issue-title">{i.title}</div><div className="issue-title-sub">{i.tenant_name} · {i.property_name}{i.tenant_flat ? ' · ' + i.tenant_flat : ''}</div></div>
            <span className="issue-meta">{i.estimated_cost ? '£' + Number(i.estimated_cost).toFixed(0) : ''}{i.estimated_hours ? ' · ' + Number(i.estimated_hours).toFixed(1) + 'h' : ''}</span>
            <span className={`badge badge-${i.status}`}>{i.status?.replace(/_/g, ' ')}</span>
            <span className={`badge badge-${i.priority}`}>{i.priority}</span>
            <span className="issue-meta">{fmt(i.created_at)}</span>
          </Link>
        ))}
        {data.issues.length === 0 && <div className="empty-state"><AlertCircle size={40} /><h3>No issues found</h3></div>}
      </div>
      {data.pagination.pages > 1 && (
        <div className="pagination">
          <button disabled={filters.page <= 1} onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}>Prev</button>
          <span>{filters.page} of {data.pagination.pages}</span>
          <button disabled={filters.page >= data.pagination.pages} onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}>Next</button>
        </div>
      )}
    </div>
  );
}
