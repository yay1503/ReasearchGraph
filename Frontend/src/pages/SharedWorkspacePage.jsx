import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CopyPlus, ExternalLink, GitBranch, History } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

export default function SharedWorkspacePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [isContinuing, setIsContinuing] = useState(false);

  useEffect(() => {
    fetch(`${API}/share/${token}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('Share link not found.');
        return r.json();
      })
      .then(setData)
      .catch((err) => setError(err.message));
  }, [token]);

  const handleContinueInMyAccount = async () => {
    const authToken = localStorage.getItem('rg_token');
    if (!authToken) {
      navigate(`/login?next=${encodeURIComponent(`/share/${token}`)}`);
      return;
    }
    setIsContinuing(true);
    setError('');
    try {
      const res = await fetch(`${API}/share/${token}/continue`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.status === 401) {
        navigate(`/login?next=${encodeURIComponent(`/share/${token}`)}`);
        return;
      }
      if (!res.ok) throw new Error('Could not create a copy in your account.');
      const continued = await res.json();
      localStorage.setItem('rg_workspace_id', continued.workspace_id);
      navigate(`/workspace/${continued.workspace_id}`);
    } catch {
      setError('Please sign in to save and continue a copy in your account.');
    } finally {
      setIsContinuing(false);
    }
  };

  if (error && !data) {
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
        Loading shared research snapshot...
      </div>
    );
  }

  const nodeTitleById = Object.fromEntries((data.nodes || []).map((n) => [n.id, n.title]));
  const isLoggedIn = Boolean(localStorage.getItem('rg_token'));

  return (
    <div style={{ maxWidth: '1040px', margin: '0 auto', padding: '32px 20px', fontFamily: 'Satoshi, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span className="rg-node-badge" data-node-type="group">
              SHARED RESEARCH SNAPSHOT
            </span>
            {data.shared_by_name && (
              <span style={{ fontSize: '12.5px', opacity: 0.72 }}>
                Shared by {data.shared_by_name}
              </span>
            )}
          </div>
          <h1 style={{ margin: '8px 0 4px', fontSize: '28px' }}>{data.workspace?.name}</h1>
          {data.workspace?.description && (
            <p style={{ margin: '0 0 6px', fontSize: '14px', opacity: 0.78 }}>{data.workspace.description}</p>
          )}
          <p style={{ margin: 0, fontSize: '12.5px', opacity: 0.68 }}>
            Read-only snapshot ({data.nodes?.length || 0} nodes · {data.edges?.length || 0} connections · {data.agent_logs?.length || 0} history events). Continuing creates your own private copy.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            className="rg-btn rg-btn-accent"
            onClick={handleContinueInMyAccount}
            disabled={isContinuing}
          >
            <CopyPlus size={15} />
            <span>
              {isContinuing
                ? 'Creating Copy...'
                : isLoggedIn
                  ? 'Continue in My Account'
                  : 'Sign In & Continue Copy'}
            </span>
            <ArrowRight size={14} />
          </button>
          <Link to="/" className="rg-btn rg-btn-secondary">
            <ArrowLeft size={14} /> Home
          </Link>
        </div>
      </div>

      {error && (
        <div className="rg-card" style={{ marginBottom: '16px', borderColor: '#e11d48', color: '#e11d48', fontSize: '13px' }}>
          {error}
        </div>
      )}

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

      {data.edges?.length > 0 && (
        <div style={{ marginBottom: '28px' }}>
          <h2 style={{ fontSize: '17px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <GitBranch size={16} /> Relationships ({data.edges.length})
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {data.edges.map((e) => (
              <div key={e.id} className="rg-card" style={{ padding: '8px 12px', fontSize: '12.5px' }}>
                <strong>{nodeTitleById[e.source_id] || e.source_id}</strong>{' '}
                <span style={{ opacity: 0.65 }}>—({e.label || 'relates_to'})→</span>{' '}
                <strong>{nodeTitleById[e.target_id] || e.target_id}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.agent_logs?.length > 0 && (
        <div style={{ marginBottom: '28px' }}>
          <h2 style={{ fontSize: '17px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <History size={16} /> Agent & Research History ({data.agent_logs.length})
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {data.agent_logs.map((log) => (
              <div key={log.id} className="rg-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                  <strong style={{ fontSize: '12.5px' }}>{log.agent_name || log.agent_id}: {log.action}</strong>
                  <span className="rg-node-badge">{log.approval_status}</span>
                </div>
                {log.reasoning && <div style={{ fontSize: '12.5px', opacity: 0.82, marginTop: '4px' }}>{log.reasoning}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

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
