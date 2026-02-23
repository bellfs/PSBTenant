import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../utils/api';

export default function Tenants() {
  const [tenants, setTenants] = useState([]);
  useEffect(() => { api.getTenants().then(setTenants); }, []);
  return (
    <div className="fade-in">
      <div className="page-header"><h2>Tenants</h2><p>{tenants.length} registered tenants</p></div>
      <div className="card"><div className="table-container"><table><thead><tr><th>Name</th><th>Property</th><th>Flat</th><th>Phone</th><th>Open Issues</th><th>Total Issues</th><th>Total Spend</th></tr></thead><tbody>
        {tenants.map(t => (
          <tr key={t.id}>
            <td><Link to={`/tenants/${t.id}`} style={{color:'var(--accent-light)',textDecoration:'none',fontWeight:500}}>{t.name}</Link></td>
            <td style={{color:'var(--text-secondary)',fontSize:13}}>{t.property_name || 'Not assigned'}</td>
            <td>{t.flat_number}</td>
            <td style={{fontFamily:'var(--font-mono)',fontSize:12}}>{t.phone}</td>
            <td>{t.open_issues > 0 ? <span className="badge badge-open">{t.open_issues}</span> : <span style={{color:'var(--text-muted)'}}>0</span>}</td>
            <td>{t.total_issues || 0}</td>
            <td>{t.total_spend ? '£'+Number(t.total_spend).toFixed(0) : '£0'}</td>
          </tr>
        ))}
      </tbody></table></div></div>
    </div>
  );
}
