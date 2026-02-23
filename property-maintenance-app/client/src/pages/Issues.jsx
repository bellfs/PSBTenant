import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../utils/api';
import { Search, Camera, MessageSquare, ArrowUpRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function Issues() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState({ issues: [], pagination: {} });
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState({
    status: searchParams.get('status') || 'all',
    priority: searchParams.get('priority') || 'all',
    property_id: searchParams.get('property_id') || 'all',
    search: searchParams.get('search') || '',
    page: parseInt(searchParams.get('page') || '1')
  });

  const fetchIssues = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.status !== 'all') params.status = filters.status;
      if (filters.priority !== 'all') params.priority = filters.priority;
      if (filters.property_id !== 'all') params.property_id = filters.property_id;
      if (filters.search) params.search = filters.search;
      params.page = filters.page;

      const result = await api.getIssues(params);
      setData(result);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  useEffect(() => {
    api.getProperties().then(setProperties).catch(console.error);
  }, []);

  const updateFilter = (key, value) => {
    const newFilters = { ...filters, [key]: value, page: 1 };
    setFilters(newFilters);
  };

  const formatTime = (dateStr) => {
    try {
      return formatDistanceToNow(new Date(dateStr + 'Z'), { addSuffix: true });
    } catch { return dateStr; }
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <h2>Issues</h2>
        <p>{data.pagination.total || 0} total issues across your portfolio</p>
      </div>

      <div className="filters-bar">
        <div className="search-input-wrapper">
          <Search />
          <input
            type="text"
            className="form-input"
            placeholder="Search issues, tenants, refs..."
            value={filters.search}
            onChange={e => updateFilter('search', e.target.value)}
          />
        </div>

        <select className="form-select" value={filters.status} onChange={e => updateFilter('status', e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="awaiting_tenant">Awaiting Tenant</option>
          <option value="escalated">Escalated</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>

        <select className="form-select" value={filters.priority} onChange={e => updateFilter('priority', e.target.value)}>
          <option value="all">All Priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <select className="form-select" value={filters.property_id} onChange={e => updateFilter('property_id', e.target.value)}>
          <option value="all">All Properties</option>
          {properties.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div className="loading-spinner" />
        </div>
      ) : data.issues.length === 0 ? (
        <div className="empty-state">
          <Search />
          <h3>No issues found</h3>
          <p>Try adjusting your filters or search terms</p>
        </div>
      ) : (
        <>
          <div className="issue-list">
            {data.issues.map((issue, i) => (
              <Link
                key={issue.id}
                to={`/issues/${issue.id}`}
                className="issue-row"
                style={{ animationDelay: `${i * 0.03}s` }}
              >
                <div>
                  <span className="issue-ref">{issue.uuid}</span>
                </div>
                <div>
                  <div className="issue-title">{issue.title}</div>
                  <div className="issue-title-sub">
                    {issue.tenant_name} &middot; {issue.property_name}
                    {issue.flat_number ? `, Flat ${issue.flat_number}` : ''}
                  </div>
                </div>
                <div>
                  <span className={`badge badge-${issue.status}`}>
                    {issue.status?.replace(/_/g, ' ')}
                  </span>
                </div>
                <div>
                  <span className={`badge badge-${issue.priority}`}>{issue.priority}</span>
                </div>
                <div className="issue-meta" style={{ display: 'flex', gap: 10 }}>
                  <span title="Messages"><MessageSquare size={12} /> {issue.message_count}</span>
                  {issue.photo_count > 0 && <span title="Photos"><Camera size={12} /> {issue.photo_count}</span>}
                </div>
                <div className="issue-meta">
                  {formatTime(issue.created_at)}
                </div>
              </Link>
            ))}
          </div>

          {data.pagination.pages > 1 && (
            <div className="pagination">
              <button
                disabled={filters.page <= 1}
                onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}
              >
                Previous
              </button>
              <span>Page {data.pagination.page} of {data.pagination.pages}</span>
              <button
                disabled={filters.page >= data.pagination.pages}
                onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
