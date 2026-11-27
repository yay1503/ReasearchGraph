import { useRef, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Cpu,
  FlaskConical,
  GitBranch,
  Moon,
  Sparkles,
  Sun,
  AlertCircle,
  X,
} from 'lucide-react';
import HeroGraphPreview from '../components/HeroGraphPreview';
import { useTheme } from '../utils/theme';

const API = 'http://127.0.0.1:8000';

const WORKFLOW_CARDS = [
  {
    icon: Sparkles,
    title: 'Analyze & Cluster',
    description:
      'Reader and Clusterer agents extract papers, questions, and datasets into a structured knowledge graph automatically.',
  },
  {
    icon: FlaskConical,
    title: 'Self-Healing Reproduction',
    description:
      'Experiment and Debugger agents run real scikit-learn scripts, catch tracebacks, and patch broken code live.',
  },
  {
    icon: GitBranch,
    title: 'What-If Branching',
    description:
      'Test new models or hyperparameters in plain English and compare AUC/F1 metrics side-by-side.',
  },
];

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
      <main>
        <section className="rg-hero">
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

          <div className="rg-hero-preview-slot rg-stagger-3" aria-label="Interactive graph preview">
            <HeroGraphPreview />
          </div>
        </section>

        {/* 3-Card "How It Works" Strip */}
        <section className="rg-how-section" aria-label="How It Works">
          <div className="rg-how-grid">
            {WORKFLOW_CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <article key={card.title} className="rg-how-card">
                  <div className="rg-how-icon-wrap" aria-hidden="true">
                    <Icon size={17} strokeWidth={1.75} />
                  </div>
                  <h2 className="rg-how-title">{card.title}</h2>
                  <p className="rg-how-desc">{card.description}</p>
                </article>
              );
            })}
          </div>

          <div className="rg-intel-bar">
            <Cpu size={15} strokeWidth={1.75} className="rg-intel-icon" aria-hidden="true" />
            <span>
              <strong className="rg-intel-lead">FLEXIBLE INTELLIGENCE</strong> — Run
              100% private with local Ollama / Llama, or plug in your own OpenAI,
              Anthropic, or Gemini API keys (coming soon).
            </span>
          </div>
        </section>
      </main>

      {/* Compact Editorial Footer */}
      <footer className="rg-footer">
        <div className="rg-footer-inner">
          <Link to="/" className="rg-brand rg-brand-link rg-footer-brand">
            ResearchGraph
          </Link>

          <span className="rg-footer-stack">
            FastAPI · React Flow · Local &amp; Cloud LLMs · Neon
          </span>

          <div className="rg-footer-links">
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="rg-footer-icon-link"
              aria-label="GitHub repository"
              title="GitHub"
            >
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                <path d="M9 18c-4.51 2-5-2-7-2" />
              </svg>
            </a>

            <Link to="/workspace" className="rg-footer-link">
              <span>Open Workspace</span>
              <ArrowRight size={14} strokeWidth={1.75} />
            </Link>
          </div>
        </div>
      </footer>

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
