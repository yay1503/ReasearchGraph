import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Edit3 } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

export default function SharedWorkspacePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    fetch(`${API}/share/${token}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('Share link not found.');
        return r.json();
      })
      .then(setData)
      .catch((err) => setError(err.message));
  }, [token]);

  const handleJoinAndEdit = async () => {
    const authToken = localStorage.getItem('rg_token');
    if (!authToken) {
      navigate('/login');
      return;
    }
    setIsJoining(true);
    try {
      const res = await fetch(`${API}/share/${token}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) throw new Error('Join failed');
      const joined = await res.json();
      localStorage.setItem('rg_workspace_id', joined.workspace_id);
      navigate(`/workspace/${joined.workspace_id}`);
    } catch {
      setError('Please sign in again to join this shared workspace.');
    } finally {
      setIsJoining(false);
    }
  };

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

  const isEditor = data.role === 'editor';

  return (
    <div style={{ maxWidth: '1040px', margin: '0 auto', padding: '32px 20px', fontFamily: 'Satoshi, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <span className="rg-node-badge" data-node-type="group">
            {isEditor ? 'SHARED WORKSPACE (EDITABLE)' : 'SHARED WORKSPACE (READ-ONLY)'}
          </span>
          <h1 style={{ margin: '8px 0 4px', fontSize: '28px' }}>{data.workspace?.name}</h1>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {isEditor && (
            <button
              type="button"
              className="rg-btn rg-btn-accent"
              onClick={handleJoinAndEdit}
              disabled={isJoining}
            >
              <Edit3 size={14} />
              <span>{isJoining ? 'Joining...' : 'Join & Edit Workspace'}</span>
            </button>
          )}
          <Link to="/" className="rg-btn rg-btn-secondary">
            <ArrowLeft size={14} /> Open ResearchGraph
          </Link>
        </div>
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
