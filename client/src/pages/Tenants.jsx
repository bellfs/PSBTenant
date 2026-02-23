import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { Search, User, Phone, Building2 } from 'lucide-react';

export default function Tenants() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.getTenants().then(setTenants).catch(console.error).finally(() => setLoading(false));
  }, []);

  const filtered = tenants.filter(t =>
    !search || t.name?.toLowerCase().includes(search.toLowerCase()) ||
    t.phone?.includes(search) || t.property_name?.toLowerCase().includes(search.toLowerCase())
  );

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
        <h2>Tenants</h2>
        <p>{tenants.length} registered tenants across your properties</p>
      </div>

      <div className="filters-bar">
        <div className="search-input-wrapper">
          <Search />
          <input
            type="text"
            className="form-input"
            placeholder="Search tenants by name, phone, property..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <User />
          <h3>No tenants found</h3>
          <p>Tenants are automatically registered when they first message the WhatsApp bot</p>
        </div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Phone</th>
                  <th>Property</th>
                  <th>Flat</th>
                  <th>Open Issues</th>
                  <th>Total Issues</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(tenant => (
                  <tr key={tenant.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 30, height: 30, borderRadius: 8,
                          background: 'var(--accent-subtle)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                          <User size={14} color="var(--accent-light)" />
                        </div>
                        <span style={{ fontWeight: 500 }}>{tenant.name}</span>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                        {tenant.phone}
                      </span>
                    </td>
                    <td>{tenant.property_name || 'Not assigned'}</td>
                    <td>{tenant.flat_number || 'N/A'}</td>
                    <td>
                      {tenant.open_issues > 0 ? (
                        <span className="badge badge-open">{tenant.open_issues}</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>None</span>
                      )}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{tenant.total_issues || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
