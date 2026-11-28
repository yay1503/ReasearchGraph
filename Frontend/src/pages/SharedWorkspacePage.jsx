import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

export default function SharedWorkspacePage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API}/share/${token}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('Share link not found.');
        return r.json();
      })
      .then(setData)
      .catch((err) => setError(err.message));
  }, [token]);

  if (error) {
    return (
      <div style={{ padding: '48px', fontFamily: 'Satoshi, sans-serif', textAlign: 'center' }}>
        <h2>{error}</h2>
        <Link to="/" className="rg-btn rg-btn-secondary" style={{ marginTop: '12px', display: 'inline-flex' }}>
          <ArrowLeft size={14} /> Back to ResearchGraph
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: '48px', fontFamily: 'Satoshi, sans-serif', textAlign: 'center' }}>
        Loading shared research workspace...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1040px', margin: '0 auto', padding: '32px 20px', fontFamily: 'Satoshi, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <span className="rg-node-badge" data-node-type="group">SHARED WORKSPACE (READ-ONLY)</span>
          <h1 style={{ margin: '8px 0 4px', fontSize: '28px' }}>{data.workspace?.name}</h1>
        </div>
        <Link to="/" className="rg-btn rg-btn-secondary">
          <ArrowLeft size={14} /> Open ResearchGraph
        </Link>
      </div>

      <h2 style={{ fontSize: '17px', marginBottom: '12px' }}>Nodes ({data.nodes?.length || 0})</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px', marginBottom: '28px' }}>
        {(data.nodes || []).map((n) => (
          <div key={n.id} className="rg-research-node" style={{ width: '100%' }}>
            <div className="rg-research-node-header">
              <span className="rg-node-badge" data-node-type={n.type}>{n.type}</span>
            </div>
            <div className="rg-research-node-title">{n.title}</div>
            {n.url && (
              <a href={n.url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#2196F3', marginTop: '6px' }}>
                <ExternalLink size={11} /> Source Link
              </a>
            )}
            {n.content && <p className="rg-research-node-preview">{n.content}</p>}
          </div>
        ))}
      </div>

      {data.memory?.length > 0 && (
        <>
          <h2 style={{ fontSize: '17px', marginBottom: '12px' }}>Research Memory ({data.memory.length})</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {data.memory.map((m) => (
              <div key={m.id} className="rg-card">
                <strong style={{ textTransform: 'uppercase', fontSize: '11px' }}>{m.outcome}</strong>
                {m.error_signature && <div style={{ fontSize: '12px', color: '#e11d48', marginTop: '4px' }}>{m.error_signature}</div>}
                {m.resolution && <div style={{ fontSize: '12.5px', marginTop: '4px' }}>{m.resolution}</div>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
