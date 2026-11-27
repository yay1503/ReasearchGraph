import { useRef, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, FlaskConical, Moon, Sun, AlertCircle, X } from 'lucide-react';
import HeroGraphPreview from '../components/HeroGraphPreview';
import { useTheme } from '../utils/theme';

const API = 'http://127.0.0.1:8000';

export default function LandingPage() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const pageRef = useRef(null);
  const [isOpeningDemo, setIsOpeningDemo] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    if (!errorMessage) return undefined;
    const timer = setTimeout(() => setErrorMessage(null), 4500);
    return () => clearTimeout(timer);
  }, [errorMessage]);

  const handleMouseMove = (e) => {
    const el = pageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--pointer-x', `${e.clientX - rect.left}px`);
    el.style.setProperty('--pointer-y', `${e.clientY - rect.top}px`);
  };

  const handleTryDemo = async () => {
    if (isOpeningDemo) return;
    setIsOpeningDemo(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API}/auth/demo`, { method: 'POST' });
      if (!res.ok) {
        throw new Error('Unable to start demo session.');
      }
      const data = await res.json();
      if (data?.token) {
        localStorage.setItem('rg_token', data.token);
      }
      if (data?.user) {
        localStorage.setItem('rg_user', JSON.stringify(data.user));
      }

      try {
        const wsRes = await fetch(`${API}/workspaces`, {
          headers: { Authorization: `Bearer ${data.token}` },
        });
        if (wsRes.ok) {
          const workspaces = await wsRes.json();
          if (Array.isArray(workspaces) && workspaces.length > 0) {
            localStorage.setItem('rg_workspace_id', workspaces[0].id);
          } else {
            localStorage.removeItem('rg_workspace_id');
          }
        }
      } catch {
        // WorkspaceCanvas will create or reuse a workspace if needed
      }

      navigate('/workspace');
    } catch {
      setErrorMessage('Could not connect to the backend demo endpoint.');
    } finally {
      setIsOpeningDemo(false);
    }
  };

  return (
    <div ref={pageRef} className="rg-landing" onMouseMove={handleMouseMove}>
      <div className="rg-landing-glow" aria-hidden="true" />

      {/* Top Navigation */}
      <header className="rg-landing-nav">
        <Link to="/" className="rg-brand rg-brand-link">
          ResearchGraph
        </Link>

        <div className="rg-landing-nav-actions">
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

          <button
            type="button"
            className="rg-btn rg-btn-ghost"
            onClick={() => navigate('/login')}
          >
            Sign In
          </button>

          <button
            type="button"
            className="rg-btn rg-btn-accent"
            onClick={() => navigate('/login')}
          >
            Get Started
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="rg-hero">
        <div className="rg-hero-copy">
          <div className="rg-eyebrow-pill rg-stagger-1">
            MULTI-AGENT RESEARCH CANVAS · LOCAL LLAMA &amp; API KEYS
          </div>

          <h1 className="rg-hero-title rg-stagger-2">
            Turn papers into living, self-healing experiments.
          </h1>

          <p className="rg-hero-subtitle rg-stagger-3">
            Read papers, run real Python reproductions, auto-patch tracebacks, and
            branch What-If hypotheses—powered by local Llama or your own LLM API
            keys.
          </p>

          <div className="rg-hero-ctas rg-stagger-4">
            <button
              type="button"
              className="rg-btn rg-btn-lg rg-btn-accent"
              onClick={() => navigate('/login')}
            >
              <span>Get Started</span>
              <ArrowRight size={16} strokeWidth={1.85} />
            </button>

            <button
              type="button"
              className="rg-btn rg-btn-lg rg-btn-secondary"
              onClick={handleTryDemo}
              disabled={isOpeningDemo}
            >
              <FlaskConical size={16} strokeWidth={1.75} />
              <span>{isOpeningDemo ? 'Opening Demo...' : 'Try Demo Workspace'}</span>
            </button>
          </div>
        </div>

        {/* Right Column: Animated Mini-Graph Preview */}
        <div className="rg-hero-preview-slot rg-stagger-3" aria-label="Interactive graph preview">
          <HeroGraphPreview />
        </div>
      </main>

      {errorMessage && (
        <div className="rg-toast-wrap" role="status" aria-live="polite">
          <div className="rg-toast">
            <AlertCircle size={16} strokeWidth={2} className="rg-toast-icon" aria-hidden="true" />
            <span className="rg-toast-msg">{errorMessage}</span>
            <button
              type="button"
              className="rg-inspector-close"
              onClick={() => setErrorMessage(null)}
              aria-label="Dismiss notification"
            >
              <X size={13} strokeWidth={2} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
