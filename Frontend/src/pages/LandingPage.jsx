import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  CopyPlus,
  GitBranch,
  Moon,
  Play,
  Sun,
  Terminal,
  AlertCircle,
  X,
} from 'lucide-react';
import HeroGraphPreview from '../components/HeroGraphPreview';
import { verifyAndSyncSession } from '../utils/auth';
import { useTheme } from '../utils/theme';

const API = import.meta.env.VITE_API_URL || '/api';

function BrandMark() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="rg-brand-mark"
    >
      <path
        d="M6.5 7L17.5 6.5M6.5 7L10 17.5M17.5 6.5L10 17.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="6.5" cy="7" r="2.75" fill="var(--bg-surface)" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="17.5" cy="6.5" r="2.75" fill="var(--accent-forest)" stroke="var(--accent-forest)" strokeWidth="1" />
      <circle cx="10" cy="17.5" r="2.75" fill="var(--bg-surface)" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [isOpeningDemo, setIsOpeningDemo] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [sessionUser, setSessionUser] = useState(null);
  const [healStep, setHealStep] = useState('patched');

  useEffect(() => {
    let cancelled = false;
    verifyAndSyncSession().then((auth) => {
      if (!cancelled && auth?.user) {
        setSessionUser(auth.user);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!errorMessage) return undefined;
    const timer = setTimeout(() => setErrorMessage(null), 4500);
    return () => clearTimeout(timer);
  }, [errorMessage]);

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
        // WorkspaceCanvas creates or loads a workspace as needed
      }

      navigate('/dashboard');
    } catch {
      setErrorMessage('Could not connect to the backend demo endpoint.');
    } finally {
      setIsOpeningDemo(false);
    }
  };

  return (
    <div className="rg-landing">
      {/* Structured Editorial Navigation */}
      <header className="rg-landing-nav-wrap">
        <nav className="rg-landing-nav" aria-label="Primary navigation">
          <Link to={sessionUser ? '/dashboard' : '/'} className="rg-brand rg-brand-link">
            <BrandMark />
            <span>ResearchGraph</span>
          </Link>

          <div className="rg-landing-nav-links">
            <a href="#problem" className="rg-nav-link">
              Why ResearchGraph
            </a>
            <a href="#product" className="rg-nav-link">
              Product
            </a>
            <a href="#workflow" className="rg-nav-link">
              Workflow
            </a>
            <a
              href="https://github.com/hartej46/ReasearchGraph"
              target="_blank"
              rel="noreferrer"
              className="rg-nav-link"
            >
              GitHub
            </a>
          </div>

          <div className="rg-landing-nav-actions">
            <button
              type="button"
              className="rg-nav-theme-btn"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun size={15} strokeWidth={1.75} /> : <Moon size={15} strokeWidth={1.75} />}
            </button>

            {sessionUser ? (
              <>
                <span className="rg-nav-user">{sessionUser.name || sessionUser.email}</span>
                <button
                  type="button"
                  className="rg-btn rg-btn-forest"
                  onClick={() => navigate('/dashboard')}
                >
                  <span>Open Workspaces</span>
                  <ArrowRight size={14} strokeWidth={1.85} />
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="rg-nav-link rg-nav-signin">
                  Sign in
                </Link>
                <button
                  type="button"
                  className="rg-btn rg-btn-forest"
                  onClick={() => navigate('/login')}
                >
                  Get Started
                </button>
              </>
            )}
          </div>
        </nav>
      </header>

      <main>
        {/* Hero Section: Authoritative Outcome + Live Application Demonstration */}
        <section className="rg-hero">
          <div className="rg-hero-copy">
            <p className="rg-hero-kicker">Computational Research Workspace</p>

            <h1 className="rg-hero-title">From PDF to verified experiment.</h1>

            <p className="rg-hero-subtitle">
              ResearchGraph turns scattered papers, notes, and repositories into one
              traceable graph—where agents extract hypotheses, run isolated Python
              code, repair failing tracebacks, and log every result.
            </p>

            <div className="rg-hero-ctas">
              <button
                type="button"
                className="rg-btn rg-btn-lg rg-btn-forest"
                onClick={() => navigate(sessionUser ? '/dashboard' : '/login')}
              >
                <span>{sessionUser ? 'Open Workspaces' : 'Start Free Workspace'}</span>
                <ArrowRight size={16} strokeWidth={1.85} />
              </button>

              <button
                type="button"
                className="rg-btn rg-btn-lg rg-btn-secondary"
                onClick={handleTryDemo}
                disabled={isOpeningDemo}
              >
                <Play size={14} strokeWidth={1.9} />
                <span>{isOpeningDemo ? 'Opening Demo...' : 'Launch Live Demo'}</span>
              </button>
            </div>

            <p className="rg-hero-footnote">
              Run privately with local Ollama models, or connect OpenAI, Gemini, or Anthropic keys.
            </p>
          </div>

          <div className="rg-hero-preview-slot" aria-label="Interactive ResearchGraph workspace preview">
            <HeroGraphPreview />
          </div>
        </section>

        {/* Narrative Band: Why Static Folders Fail Researchers */}
        <section id="problem" className="rg-problem-band">
          <div className="rg-container rg-problem-grid">
            <div className="rg-problem-statement">
              <p className="rg-section-eyebrow">The Research Gap</p>
              <h2 className="rg-section-heading">
                Papers sit in PDF viewers. Code breaks in terminal tabs. Nothing stays connected.
              </h2>
            </div>

            <div className="rg-problem-points">
              <p className="rg-problem-lead">
                Reproducing a paper or testing one baseline change usually leaves citations in
                one folder, broken scripts in another, and metrics buried in scrollback.
              </p>
              <div className="rg-problem-ledger">
                <div className="rg-ledger-item">
                  <span className="rg-ledger-num">01</span>
                  <div>
                    <div className="rg-ledger-title">Explicit research lineage</div>
                    <div className="rg-ledger-desc">
                      Every dataset, script, error fix, and metric stays linked to the source paper.
                    </div>
                  </div>
                </div>
                <div className="rg-ledger-item">
                  <span className="rg-ledger-num">02</span>
                  <div>
                    <div className="rg-ledger-title">Human approval at execution</div>
                    <div className="rg-ledger-desc">
                      Review or redirect proposed experiments before any code runs on your machine.
                    </div>
                  </div>
                </div>
                <div className="rg-ledger-item">
                  <span className="rg-ledger-num">03</span>
                  <div>
                    <div className="rg-ledger-title">Persistent failure memory</div>
                    <div className="rg-ledger-desc">
                      Past tracebacks and fixes are stored and consulted before future runs.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Product Demonstrations: Distinct Visual Walkthroughs */}
        <section id="product" className="rg-demos-section">
          <div className="rg-container">
            <div className="rg-demos-intro">
              <p className="rg-section-eyebrow">How It Works</p>
              <h2 className="rg-section-heading">Built around the real loop of scientific code.</h2>
            </div>

            {/* Demo 1: Self-Healing Reproduction */}
            <div className="rg-demo-row">
              <div className="rg-demo-copy">
                <span className="rg-demo-step">01 · Self-Healing Sandbox</span>
                <h3 className="rg-demo-title">Catch failing tracebacks, patch code, and record the fix</h3>
                <p className="rg-demo-desc">
                  When a reproduction hits a deprecated library argument or runtime error, the
                  Debugger Agent inspects stderr, generates a minimal patch, re-runs inside an
                  isolated sandbox, and saves the lesson to research memory.
                </p>
                <div className="rg-demo-toggle" role="group" aria-label="Toggle traceback or patched run">
                  <button
                    type="button"
                    className={`rg-toggle-chip ${healStep === 'error' ? 'is-active' : ''}`}
                    onClick={() => setHealStep('error')}
                  >
                    Initial Failure
                  </button>
                  <button
                    type="button"
                    className={`rg-toggle-chip ${healStep === 'patched' ? 'is-active' : ''}`}
                    onClick={() => setHealStep('patched')}
                  >
                    Debugger Patch
                  </button>
                </div>
              </div>

              <div className="rg-demo-visual rg-code-stage">
                <div className="rg-code-stage-bar">
                  <Terminal size={13} strokeWidth={1.8} />
                  <span>reproduce_smote.py</span>
                  <span className={`rg-code-state ${healStep === 'patched' ? 'is-ok' : 'is-err'}`}>
                    {healStep === 'patched' ? 'exit 0 · 0.915 AUC' : 'exit 1 · InvalidParameterError'}
                  </span>
                </div>
                {healStep === 'error' ? (
                  <pre className="rg-code-stage-pre">{`clf = DecisionTreeClassifier(
    class_weight="balanced",
-   max_features="auto",
    random_state=42
)

Traceback (most recent call last):
  InvalidParameterError: The 'max_features' parameter
  got 'auto' which was removed in scikit-learn >= 1.3.`}</pre>
                ) : (
                  <pre className="rg-code-stage-pre">{`# Patched by Debugger Agent (saved to research_memory)
clf = DecisionTreeClassifier(
    class_weight="balanced",
+   max_features=None,
    random_state=42
)

✓ Sandbox run complete
{"baseline_auc": 0.916, "smote_auc": 0.915, "smote_f1": 0.873}`}</pre>
                )}
              </div>
            </div>

            {/* Demo 2: What-If Branching */}
            <div id="workflow" className="rg-demo-row is-reversed">
              <div className="rg-demo-visual rg-branch-stage">
                <div className="rg-branch-root">
                  <span className="rg-branch-tag">Baseline Hypothesis</span>
                  <strong>SMOTE · Decision Tree (k=5)</strong>
                </div>
                <div className="rg-branch-split" aria-hidden="true">
                  <span />
                  <span />
                </div>
                <div className="rg-branch-children">
                  <div className="rg-branch-card">
                    <div className="rg-branch-head">
                      <GitBranch size={13} />
                      <span>Branch A · Decision Tree</span>
                    </div>
                    <div className="rg-branch-metric">0.915 AUC</div>
                    <div className="rg-bar-track">
                      <div className="rg-bar-fill" style={{ width: '82%' }} />
                    </div>
                  </div>
                  <div className="rg-branch-card is-winner">
                    <div className="rg-branch-head">
                      <GitBranch size={13} />
                      <span>Branch B · Random Forest (k=3)</span>
                    </div>
                    <div className="rg-branch-metric is-forest">0.942 AUC</div>
                    <div className="rg-bar-track">
                      <div className="rg-bar-fill is-forest" style={{ width: '94%' }} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="rg-demo-copy">
                <span className="rg-demo-step">02 · What-If Branching</span>
                <h3 className="rg-demo-title">Ask a question in plain English and compare branches</h3>
                <p className="rg-demo-desc">
                  Fork any experiment node with a new model or hyperparameter sweep. Both runs
                  execute cleanly on CPU or inside a cloned repository environment, placing
                  comparable metrics side-by-side on the canvas.
                </p>
              </div>
            </div>

            {/* Demo 3: Snapshot Sharing & Private Continuation */}
            <div className="rg-demo-row">
              <div className="rg-demo-copy">
                <span className="rg-demo-step">03 · Snapshot Sharing</span>
                <h3 className="rg-demo-title">Share a frozen research snapshot anyone can continue</h3>
                <p className="rg-demo-desc">
                  Send a read-only link containing your graph, connections, and agent history.
                  Peers can inspect your findings and click Continue to fork a private copy into
                  their own account without altering your workspace.
                </p>
              </div>

              <div className="rg-demo-visual rg-share-stage">
                <div className="rg-share-card">
                  <div className="rg-share-card-top">
                    <span className="rg-share-label">Shared Research Snapshot</span>
                    <span className="rg-share-meta">6 nodes · 4 connections · Frozen copy</span>
                  </div>
                  <div className="rg-share-title">SMOTE vs Balanced Baselines</div>
                  <div className="rg-share-checklist">
                    <div><Check size={13} /> Graph nodes &amp; relationships preserved</div>
                    <div><Check size={13} /> Full agent &amp; debugger history included</div>
                    <div><Check size={13} /> Original workspace remains private</div>
                  </div>
                  <div className="rg-share-action-bar">
                    <span className="rg-share-url">researchgraph.app/share/s8x9Kp...</span>
                    <span className="rg-share-cta-pill">
                      <CopyPlus size={12} /> Continue in My Account
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Closing Conversion Band */}
        <section className="rg-cta-band">
          <div className="rg-container rg-cta-inner">
            <h2 className="rg-cta-heading">Give your next paper a living workspace.</h2>
            <p className="rg-cta-sub">
              Import an arXiv link, upload a PDF, or open the interactive SMOTE demo in seconds.
            </p>
            <div className="rg-cta-buttons">
              <button
                type="button"
                className="rg-btn rg-btn-lg rg-btn-forest"
                onClick={() => navigate(sessionUser ? '/dashboard' : '/signup')}
              >
                <span>{sessionUser ? 'Go to Dashboard' : 'Create Account'}</span>
                <ArrowRight size={16} strokeWidth={1.85} />
              </button>
              <button
                type="button"
                className="rg-btn rg-btn-lg rg-btn-secondary"
                onClick={handleTryDemo}
                disabled={isOpeningDemo}
              >
                <span>{isOpeningDemo ? 'Opening Demo...' : 'Try Demo Workspace'}</span>
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Grounded Product Footer */}
      <footer className="rg-footer">
        <div className="rg-footer-inner">
          <div className="rg-footer-brand-col">
            <Link to={sessionUser ? '/dashboard' : '/'} className="rg-brand rg-brand-link rg-footer-brand">
              <BrandMark />
              <span>ResearchGraph</span>
            </Link>
            <p className="rg-footer-tagline">
              Traceable scientific workspaces for independent researchers.
            </p>
          </div>

          <div className="rg-footer-links">
            <a href="#problem" className="rg-footer-link">Why ResearchGraph</a>
            <a href="#product" className="rg-footer-link">Product</a>
            <a href="#workflow" className="rg-footer-link">Branching</a>
            <a
              href="https://github.com/hartej46/ReasearchGraph"
              target="_blank"
              rel="noreferrer"
              className="rg-footer-link"
            >
              GitHub
            </a>
            <Link to={sessionUser ? '/dashboard' : '/login'} className="rg-footer-link rg-footer-cta">
              <span>{sessionUser ? 'Open Workspaces' : 'Sign In'}</span>
              <ArrowRight size={13} strokeWidth={1.75} />
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
