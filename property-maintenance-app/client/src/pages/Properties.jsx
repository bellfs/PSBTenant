import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { Plus, Building2, AlertCircle, Users } from 'lucide-react';
import { useAuth } from '../App';

export default function Properties() {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', address: '', postcode: '', num_units: '' });
  const { user } = useAuth();

  useEffect(() => {
    api.getProperties().then(setProperties).catch(console.error).finally(() => setLoading(false));
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      await api.createProperty({ ...form, num_units: parseInt(form.num_units) || 1 });
      const updated = await api.getProperties();
      setProperties(updated);
      setShowAdd(false);
      setForm({ name: '', address: '', postcode: '', num_units: '' });
    } catch (err) {
      alert(err.message);
    }
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
          <h2>Properties</h2>
          <p>{properties.length} properties in your portfolio</p>
        </div>
        {user?.role === 'admin' && (
          <button className="btn btn-primary" onClick={() => setShowAdd(!showAdd)}>
            <Plus size={15} /> Add Property
          </button>
        )}
      </div>

      {showAdd && (
        <div className="card fade-in" style={{ marginBottom: 20 }}>
          <div className="card-header"><h3>Add New Property</h3></div>
          <div className="card-body">
            <form onSubmit={handleAdd} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Property Name</label>
                <input className="form-input" placeholder="e.g. 52 Old Elvet" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label">Address</label>
                <input className="form-input" placeholder="Full address" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label">Postcode</label>
                <input className="form-input" placeholder="DH1 3HN" value={form.postcode} onChange={e => setForm({ ...form, postcode: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Number of Units</label>
                <input className="form-input" type="number" placeholder="8" value={form.num_units} onChange={e => setForm({ ...form, num_units: e.target.value })} />
              </div>
              <div style={{ gridColumn: '1/-1', display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-primary">Save Property</button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {properties.map((prop, i) => (
          <div key={prop.id} className="card" style={{ animationDelay: `${i * 0.05}s` }}>
            <div className="card-body">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: 'var(--accent-subtle)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                  <Building2 size={18} color="var(--accent-light)" />
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>{prop.name}</h3>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{prop.address}</p>
                  {prop.postcode && <p style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{prop.postcode}</p>}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 16, marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-light)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                  <Users size={13} /> {prop.tenant_count || 0} tenants
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: prop.open_issues > 0 ? 'var(--warning)' : 'var(--text-secondary)' }}>
                  <AlertCircle size={13} /> {prop.open_issues || 0} open issues
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                  {prop.num_units} units
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
