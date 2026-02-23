import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../utils/api';
import { ArrowLeft, Download } from 'lucide-react';

export default function PropertyDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  useEffect(() => { api.getPropertyIssues(id).then(setData); }, [id]);
  if (!data) return <div style={{padding:40,textAlign:'center'}}><div className="loading-spinner" style={{margin:'0 auto'}}/></div>;
  const { property, issues } = data;
  const fmt = d => d ? new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '';
  return (
    <div className="fade-in">
      <div style={{marginBottom:20}}><Link to="/properties" className="btn btn-ghost btn-sm"><ArrowLeft size={15}/> Back</Link></div>
      <div className="page-header" style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
        <div><h2>{property.name}</h2><p>{property.address} · {property.postcode} · {property.num_units} units</p></div>
        <button className="btn btn-secondary" onClick={() => api.exportPropertyIssues(id)}><Download size={15}/> Export CSV</button>
      </div>
      <div className="card"><div className="card-header"><h3>All Issues ({issues.length})</h3></div>
        <div className="table-container"><table><thead><tr><th>Ref</th><th>Issue</th><th>Tenant</th><th>Flat</th><th>Category</th><th>Status</th><th>Priority</th><th>Est. Cost</th><th>Final Cost</th><th>Reported</th><th>Resolved</th></tr></thead><tbody>
          {issues.map(i => (
            <tr key={i.id}>
              <td><Link to={`/issues/${i.id}`} className="issue-ref">{i.uuid}</Link></td>
              <td style={{maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{i.title}</td>
              <td>{i.tenant_name}</td><td>{i.tenant_flat||i.flat_number}</td>
              <td style={{textTransform:'capitalize',fontSize:12}}>{(i.category||'').replace(/_/g,' ')}</td>
              <td><span className={`badge badge-${i.status}`}>{i.status?.replace(/_/g,' ')}</span></td>
              <td><span className={`badge badge-${i.priority}`}>{i.priority}</span></td>
              <td>{i.estimated_cost ? '£'+Number(i.estimated_cost).toFixed(0) : ''}</td>
              <td style={{fontWeight:i.final_cost?600:'normal'}}>{i.final_cost ? '£'+Number(i.final_cost).toFixed(2) : ''}</td>
              <td style={{fontSize:12,color:'var(--text-secondary)'}}>{fmt(i.created_at)}</td>
              <td style={{fontSize:12,color:'var(--text-secondary)'}}>{fmt(i.resolved_at)}</td>
            </tr>
          ))}
          {issues.length === 0 && <tr><td colSpan={11} style={{textAlign:'center',color:'var(--text-muted)',padding:40}}>No issues reported for this property</td></tr>}
        </tbody></table></div>
      </div>
    </div>
  );
}
