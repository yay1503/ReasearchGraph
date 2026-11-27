import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Eye,
  EyeOff,
  Loader2,
  Moon,
  Sparkles,
  Sun,
} from 'lucide-react';
import { AgentMascots } from '../components/AgentMascots';
import { useTheme } from '../utils/theme';

const API = 'http://127.0.0.1:8000';

async function syncUserWorkspace(token) {
  try {
    const wsRes = await fetch(`${API}/workspaces`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (wsRes.ok) {
      const workspaces = await wsRes.json();
      if (Array.isArray(workspaces) && workspaces.length > 0) {
        localStorage.setItem('rg_workspace_id', workspaces[0].id);
        return;
      }
    }
  } catch {
    // WorkspaceCanvas falls back to creating a workspace if needed
  }
  localStorage.removeItem('rg_workspace_id');
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const pageRef = useRef(null);

  const [mood, setMood] = useState('idle');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const [error, setError] = useState('');

  const handleMouseMove = (e) => {
    const el = pageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--pointer-x', `${e.clientX - rect.left}px`);
    el.style.setProperty('--pointer-y', `${e.clientY - rect.top}px`);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (isSubmitting || isDemoLoading) return;
    setError('');
    setIsSubmitting(true);

    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.detail || 'Invalid email or password.');
        setMood('sad');
        return;
      }

      localStorage.setItem('rg_token', data.token);
      localStorage.setItem('rg_user', JSON.stringify(data.user));
      await syncUserWorkspace(data.token);
      navigate('/workspace');
    } catch {
      setError('Could not connect to the authentication server.');
      setMood('sad');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTryDemo = async () => {
    if (isDemoLoading || isSubmitting) return;
    setError('');
    setIsDemoLoading(true);

    try {
      const res = await fetch(`${API}/auth/demo`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.detail || 'Could not start demo workspace.');
        setMood('sad');
        return;
      }

      localStorage.setItem('rg_token', data.token);
      localStorage.setItem('rg_user', JSON.stringify(data.user));
      await syncUserWorkspace(data.token);
      navigate('/workspace');
    } catch {
      setError('Could not connect to the backend demo endpoint.');
      setMood('sad');
    } finally {
      setIsDemoLoading(false);
    }
  };

  const isBusy = isSubmitting || isDemoLoading;

  return (
    <div ref={pageRef} className="rg-landing rg-auth-page" onMouseMove={handleMouseMove}>
      <div className="rg-landing-glow" aria-hidden="true" />

      {/* Top Bar */}
      <header className="rg-landing-nav">
        <Link
          to="/"
          className="rg-btn rg-btn-ghost rg-brand-link"
          onMouseEnter={() => setMood('sad')}
          onMouseLeave={() => setMood('idle')}
        >
          <ArrowLeft size={15} strokeWidth={1.75} />
          <span>Back to Home</span>
        </Link>

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
      </header>

      {/* Centered Editorial Auth Card */}
      <main className="rg-auth-main">
        <div className="rg-auth-card">
          <div className="rg-auth-mascot-band">
            <AgentMascots mood={mood} />
          </div>

          <div className="rg-auth-body">
            <h1 className="rg-auth-title">Welcome back</h1>
            <p className="rg-auth-subtitle">
              Sign in to access your saved research graphs.
            </p>

            {error && (
              <div className="rg-auth-error" role="alert">
                <AlertCircle size={15} strokeWidth={2} className="rg-auth-error-icon" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="rg-auth-form">
              <div className="rg-field">
                <label htmlFor="rg-login-email" className="rg-field-label">
                  Email
                </label>
                <input
                  id="rg-login-email"
                  type="email"
                  className="rg-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="researcher@lab.edu"
                  autoComplete="email"
                  required
                  disabled={isBusy}
                />
              </div>

              <div className="rg-field">
                <label htmlFor="rg-login-password" className="rg-field-label">
                  Password
                </label>
                <div className="rg-password-wrap">
                  <input
                    id="rg-login-password"
                    type={showPassword ? 'text' : 'password'}
                    className="rg-input rg-password-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setMood('shy')}
                    onBlur={() => setMood('idle')}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                    disabled={isBusy}
                  />
                  <button
                    type="button"
                    className="rg-password-toggle"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    title={showPassword ? 'Hide password' : 'Show password'}
                    disabled={isBusy}
                  >
                    {showPassword ? (
                      <EyeOff size={15} strokeWidth={1.75} />
                    ) : (
                      <Eye size={15} strokeWidth={1.75} />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="rg-btn rg-btn-lg rg-btn-accent rg-btn-block"
                disabled={isBusy || !email.trim() || !password}
                onMouseEnter={() => setMood('happy')}
                onMouseLeave={() => setMood('idle')}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={15} strokeWidth={2} className="rg-spin" />
                    <span>Signing In...</span>
                  </>
                ) : (
                  <span>Sign In</span>
                )}
              </button>
            </form>

            <div className="rg-auth-divider" aria-hidden="true">
              <span>or</span>
            </div>

            <button
              type="button"
              className="rg-btn rg-btn-lg rg-btn-secondary rg-btn-block"
              onClick={handleTryDemo}
              disabled={isBusy}
              onMouseEnter={() => setMood('happy')}
              onMouseLeave={() => setMood('idle')}
            >
              {isDemoLoading ? (
                <>
                  <Loader2 size={15} strokeWidth={2} className="rg-spin" />
                  <span>Opening Demo...</span>
                </>
              ) : (
                <>
                  <Sparkles size={15} strokeWidth={1.75} />
                  <span>Try Demo Workspace</span>
                </>
              )}
            </button>

            <p className="rg-auth-footer">
              New to ResearchGraph?{' '}
              <Link
                to="/signup"
                className="rg-auth-link"
                onMouseEnter={() => setMood('happy')}
                onMouseLeave={() => setMood('idle')}
              >
                Create an account
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
