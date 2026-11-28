import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  BookOpen,
  Cpu,
  Loader2,
  LogOut,
  Moon,
  Plus,
  Search,
  Sun,
  Trash2,
  User,
  X,
} from 'lucide-react';
import EngineModal from '../components/EngineModal';
import { PROVIDERS, getLLMConfig } from '../utils/llmConfig';
import { useTheme } from '../utils/theme';

const API = import.meta.env.VITE_API_URL || '/api';

const CARD_ACCENTS = ['#D97706', '#2563EB', '#059669', '#7C3AED'];

function getStoredUser() {
  try {
    const raw = localStorage.getItem('rg_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function formatDate(value) {
  if (!value) return 'Just now';
  const normalized =
    typeof value === 'string' && !value.includes('T')
      ? `${value.replace(' ', 'T')}Z`
      : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const newNameInputRef = useRef(null);

  const [user] = useState(getStoredUser);
  const [workspaces, setWorkspaces] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');

  // Create modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Delete confirmation modal state
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Logout state
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // LLM Engine modal state
  const [llmConfig, setLlmConfig] = useState(getLLMConfig);
  const [isEngineModalOpen, setIsEngineModalOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('rg_token');
    if (!token) {
      navigate('/login', { replace: true });
      return;
    }

    let cancelled = false;
    async function loadWorkspaces() {
      setIsLoading(true);
      setError('');
      try {
        const res = await fetch(`${API}/workspaces`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          localStorage.removeItem('rg_token');
          localStorage.removeItem('rg_user');
          localStorage.removeItem('rg_workspace_id');
          if (!cancelled) navigate('/login', { replace: true });
          return;
        }
        if (!res.ok) {
          throw new Error('Failed to load workspaces.');
        }
        const data = await res.json();
        if (!cancelled) {
          setWorkspaces(Array.isArray(data) ? data : []);
        }
      } catch {
        if (!cancelled) {
          setError('Could not load your workspaces. Check that the backend server is running.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadWorkspaces();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    if (isCreateOpen) {
      const timer = setTimeout(() => newNameInputRef.current?.focus(), 20);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isCreateOpen]);

  useEffect(() => {
    if (!isCreateOpen && !deleteTarget) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isCreateOpen && !isCreating) setIsCreateOpen(false);
        if (deleteTarget && !isDeleting) setDeleteTarget(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isCreateOpen, isCreating, deleteTarget, isDeleting]);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    const token = localStorage.getItem('rg_token');
    try {
      if (token) {
        await fetch(`${API}/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
      // Clear local session regardless of network outcome
    } finally {
      localStorage.removeItem('rg_token');
      localStorage.removeItem('rg_user');
      localStorage.removeItem('rg_workspace_id');
      navigate('/login', { replace: true });
    }
  };

  const handleCreateWorkspace = async (e) => {
    e.preventDefault();
    const trimmed = newWorkspaceName.trim();
    if (!trimmed || isCreating) return;

    const token = localStorage.getItem('rg_token');
    if (!token) {
      navigate('/login', { replace: true });
      return;
    }

    setIsCreating(true);
    setError('');
    try {
      const res = await fetch(`${API}/workspaces`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.status === 401) {
        localStorage.removeItem('rg_token');
        localStorage.removeItem('rg_user');
        navigate('/login', { replace: true });
        return;
      }
      if (!res.ok) {
        throw new Error('Could not create workspace.');
      }
      const created = await res.json();
      setWorkspaces((prev) => [
        {
          ...created,
          node_count: 0,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      setNewWorkspaceName('');
      setIsCreateOpen(false);
    } catch {
      setError('Failed to create workspace. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || isDeleting) return;
    const token = localStorage.getItem('rg_token');
    if (!token) {
      navigate('/login', { replace: true });
      return;
    }

    setIsDeleting(true);
    setError('');
    try {
      const res = await fetch(`${API}/workspaces/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('rg_token');
        localStorage.removeItem('rg_user');
        navigate('/login', { replace: true });
        return;
      }
      if (!res.ok) {
        throw new Error('Could not delete workspace.');
      }

      setWorkspaces((prev) => prev.filter((w) => w.id !== deleteTarget.id));
      if (localStorage.getItem('rg_workspace_id') === deleteTarget.id) {
        localStorage.removeItem('rg_workspace_id');
      }
      setDeleteTarget(null);
    } catch {
      setError('Failed to delete workspace.');
    } finally {
      setIsDeleting(false);
    }
  };

  const openWorkspace = (wsId) => {
    localStorage.setItem('rg_workspace_id', wsId);
    navigate(`/workspace/${wsId}`);
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredWorkspaces = useMemo(() => {
    if (!normalizedQuery) return workspaces;
    return workspaces.filter((ws) =>
      (ws.name || '').toLowerCase().includes(normalizedQuery)
    );
  }, [workspaces, normalizedQuery]);

  const countLabel = `${filteredWorkspaces.length} ${
    filteredWorkspaces.length === 1 ? 'notebook' : 'notebooks'
  }`;

  return (
    <div className="rg-landing rg-dash-page">
      {/* Top Navigation Bar */}
      <header className="rg-dash-nav">
        <div className="rg-dash-nav-inner">
          <Link to="/" className="rg-brand rg-brand-link">
            ResearchGraph
          </Link>

          <div className="rg-dash-search-wrap">
            <Search size={14} strokeWidth={1.75} className="rg-search-icon" aria-hidden="true" />
            <input
              type="text"
              className="rg-search-input rg-dash-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notebooks..."
              aria-label="Search workspaces"
            />
            {searchQuery && (
              <button
                type="button"
                className="rg-search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                title="Clear search"
              >
                <X size={13} strokeWidth={2} />
              </button>
            )}
          </div>

          <div className="rg-dash-nav-actions">
            <button
              type="button"
              className="rg-btn rg-btn-secondary rg-engine-pill-btn"
              onClick={() => setIsEngineModalOpen(true)}
              title="Configure AI Engine"
            >
              <span className="rg-engine-pill-dot" aria-hidden="true" />
              <Cpu size={13} strokeWidth={1.85} aria-hidden="true" />
              <span>{PROVIDERS[llmConfig.provider]?.shortLabel || 'Local Llama'}</span>
            </button>

            <button
              type="button"
              className="rg-btn rg-btn-secondary rg-btn-icon"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? (
                <Sun size={15} strokeWidth={1.75} />
              ) : (
                <Moon size={15} strokeWidth={1.75} />
              )}
            </button>

            <div className="rg-user-badge" title={user?.email || ''}>
              <User size={13} strokeWidth={1.85} aria-hidden="true" />
              <span className="rg-user-name">{user?.name || user?.email || 'Researcher'}</span>
            </div>

            <button
              type="button"
              className="rg-btn rg-btn-secondary"
              onClick={handleLogout}
              disabled={isLoggingOut}
            >
              <LogOut size={14} strokeWidth={1.75} />
              <span>{isLoggingOut ? 'Logging out...' : 'Log Out'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Workspace Gallery */}
      <main className="rg-dash-main">
        <div className="rg-dash-header">
          <div className="rg-dash-title-row">
            <h1 className="rg-dash-title">Your Workspaces</h1>
            <span className="rg-section-count">{countLabel}</span>
          </div>

          <button
            type="button"
            className="rg-btn rg-btn-accent"
            onClick={() => {
              setNewWorkspaceName('');
              setIsCreateOpen(true);
            }}
          >
            <Plus size={15} strokeWidth={2} />
            <span>New Workspace</span>
          </button>
        </div>

        {error && (
          <div className="rg-auth-error rg-dash-error" role="alert">
            <AlertCircle size={15} strokeWidth={2} className="rg-auth-error-icon" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {isLoading ? (
          <div className="rg-ws-grid" aria-busy="true" aria-label="Loading workspaces">
            {[0, 1, 2].map((idx) => (
              <div key={idx} className="rg-ws-skeleton">
                <div className="rg-skel-line rg-skel-short" />
                <div className="rg-skel-line rg-skel-title" />
                <div className="rg-skel-footer">
                  <div className="rg-skel-pill" />
                  <div className="rg-skel-date" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rg-ws-grid">
            {/* First Card: Quick Add */}
            <button
              type="button"
              className="rg-ws-add-card"
              onClick={() => {
                setNewWorkspaceName('');
                setIsCreateOpen(true);
              }}
            >
              <span className="rg-ws-add-icon" aria-hidden="true">
                <Plus size={18} strokeWidth={1.85} />
              </span>
              <span className="rg-ws-add-label">New Workspace</span>
              <span className="rg-ws-add-hint">Start a clean research notebook</span>
            </button>

            {/* Empty State when 0 workspaces exist */}
            {workspaces.length === 0 && (
              <div className="rg-ws-empty-card">
                <BookOpen size={20} strokeWidth={1.75} className="rg-ws-empty-icon" aria-hidden="true" />
                <h2 className="rg-ws-empty-title">No workspaces yet</h2>
                <p className="rg-ws-empty-desc">
                  Create your first notebook to collect papers, run self-healing Python
                  reproductions, and branch What-If experiments.
                </p>
              </div>
            )}

            {/* Empty Search State */}
            {workspaces.length > 0 && filteredWorkspaces.length === 0 && (
              <div className="rg-ws-empty-card">
                <h2 className="rg-ws-empty-title">No matching notebooks</h2>
                <p className="rg-ws-empty-desc">
                  No workspaces matched &ldquo;{searchQuery}&rdquo;.
                </p>
                <button
                  type="button"
                  className="rg-btn rg-btn-secondary"
                  onClick={() => setSearchQuery('')}
                  style={{ marginTop: '12px' }}
                >
                  Clear Filter
                </button>
              </div>
            )}

            {/* Workspace Notebook Cards */}
            {filteredWorkspaces.map((ws, idx) => {
              const accentColor = CARD_ACCENTS[idx % CARD_ACCENTS.length];
              const nodeCount = Number(ws.node_count ?? 0);
              return (
                <div
                  key={ws.id}
                  role="button"
                  tabIndex={0}
                  className="rg-ws-card"
                  onClick={() => openWorkspace(ws.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openWorkspace(ws.id);
                    }
                  }}
                >
                  <div
                    className="rg-ws-card-accent"
                    style={{ backgroundColor: accentColor }}
                    aria-hidden="true"
                  />

                  <div className="rg-ws-card-body">
                    <div className="rg-ws-card-top">
                      <span className="rg-ws-card-kicker">NOTEBOOK</span>
                      <button
                        type="button"
                        className="rg-ws-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(ws);
                        }}
                        title={`Delete ${ws.name}`}
                        aria-label={`Delete ${ws.name}`}
                      >
                        <Trash2 size={14} strokeWidth={1.85} />
                      </button>
                    </div>

                    <h2 className="rg-ws-card-name">{ws.name}</h2>

                    <div className="rg-ws-card-meta">
                      <span className="rg-ws-count-pill">
                        {nodeCount} {nodeCount === 1 ? 'node' : 'nodes'}
                      </span>
                      <span className="rg-ws-date">{formatDate(ws.created_at)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Create Workspace Editorial Modal */}
      {isCreateOpen && (
        <div
          className="rg-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isCreating) {
              setIsCreateOpen(false);
            }
          }}
          role="presentation"
        >
          <div
            className="rg-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rg-create-ws-title"
          >
            <div className="rg-modal-header">
              <span className="rg-node-badge" data-node-type="paper">
                NEW NOTEBOOK
              </span>
              <button
                type="button"
                className="rg-inspector-close"
                onClick={() => !isCreating && setIsCreateOpen(false)}
                aria-label="Close modal"
              >
                <X size={15} strokeWidth={2} />
              </button>
            </div>

            <h2 id="rg-create-ws-title" className="rg-modal-title">
              Create Workspace
            </h2>

            <form onSubmit={handleCreateWorkspace} className="rg-modal-form">
              <div className="rg-field">
                <label htmlFor="rg-ws-name-input" className="rg-field-label">
                  Workspace Name
                </label>
                <input
                  id="rg-ws-name-input"
                  ref={newNameInputRef}
                  type="text"
                  className="rg-input"
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  placeholder="e.g., LoRA Fine-Tuning Ablations"
                  disabled={isCreating}
                  required
                />
              </div>

              <div className="rg-modal-footer">
                <button
                  type="button"
                  className="rg-btn rg-btn-secondary"
                  onClick={() => setIsCreateOpen(false)}
                  disabled={isCreating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rg-btn rg-btn-accent"
                  disabled={isCreating || !newWorkspaceName.trim()}
                >
                  {isCreating ? (
                    <>
                      <Loader2 size={14} strokeWidth={2} className="rg-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <span>Create Workspace</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Editorial Modal */}
      {deleteTarget && (
        <div
          className="rg-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeleting) {
              setDeleteTarget(null);
            }
          }}
          role="presentation"
        >
          <div
            className="rg-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rg-delete-ws-title"
          >
            <div className="rg-modal-header">
              <span className="rg-node-badge" data-node-type="error_fix">
                DELETE NOTEBOOK
              </span>
              <button
                type="button"
                className="rg-inspector-close"
                onClick={() => !isDeleting && setDeleteTarget(null)}
                aria-label="Close confirmation"
              >
                <X size={15} strokeWidth={2} />
              </button>
            </div>

            <h2 id="rg-delete-ws-title" className="rg-modal-title">
              Delete &ldquo;{deleteTarget.name}&rdquo;?
            </h2>

            <p className="rg-dash-delete-desc">
              This permanently removes the workspace along with its graph nodes, edges,
              and agent activity logs.
            </p>

            <div className="rg-modal-footer" style={{ marginTop: '18px' }}>
              <button
                type="button"
                className="rg-btn rg-btn-secondary"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rg-btn rg-btn-danger"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <Loader2 size={14} strokeWidth={2} className="rg-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Delete Workspace</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {isEngineModalOpen && (
        <EngineModal
          onClose={() => setIsEngineModalOpen(false)}
          onSaved={(saved) => setLlmConfig(saved)}
        />
      )}
    </div>
  );
}
