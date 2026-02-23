import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../utils/api';
import { Building2 } from 'lucide-react';

export default function Properties() {
  const [properties, setProperties] = useState([]);
  useEffect(() => { api.getProperties().then(setProperties); }, []);
  return (
    <div className="fade-in">
      <div className="page-header"><h2>Properties</h2><p>{properties.length} properties in portfolio</p></div>
      <div className="card"><div className="table-container"><table><thead><tr><th>Property</th><th>Address</th><th>Units</th><th>Tenants</th><th>Open Issues</th><th>Total Issues</th><th>Total Spend</th></tr></thead><tbody>
        {properties.map(p => (
          <tr key={p.id}>
            <td><Link to={`/properties/${p.id}`} style={{color:'var(--accent-light)',textDecoration:'none',fontWeight:500}}>{p.name}</Link></td>
            <td style={{color:'var(--text-secondary)',fontSize:13}}>{p.address}</td>
            <td>{p.num_units}</td>
            <td>{p.tenant_count}</td>
            <td>{p.open_issues > 0 ? <span className="badge badge-open">{p.open_issues}</span> : <span style={{color:'var(--text-muted)'}}>0</span>}</td>
            <td>{p.total_issues || 0}</td>
            <td>{p.total_spend ? '£'+Number(p.total_spend).toFixed(0) : '£0'}</td>
          </tr>
        ))}
      </tbody></table></div></div>
    </div>
  );
}
