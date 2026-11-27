import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Sparkles } from 'lucide-react';
import AuthSplitLayout from '../components/AuthSplitLayout';
import { syncUserWorkspace } from '../utils/auth';

const API = 'http://127.0.0.1:8000';

export default function LoginPage() {
  const navigate = useNavigate();

  const [mood, setMood] = useState('idle');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    if (isSubmitting || isDemoLoading) return;
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      setMood('sad');
      return;
    }

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
      navigate('/dashboard');
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
      navigate('/dashboard');
    } catch {
      setError('Could not connect to the backend demo endpoint.');
      setMood('sad');
    } finally {
      setIsDemoLoading(false);
    }
  };

  const isBusy = isSubmitting || isDemoLoading;

  return (
    <AuthSplitLayout
      mood={mood}
      setMood={setMood}
      tagline="Your local multi-agent lab notebook."
      title="Welcome back"
      subtitle="Sign in to access your saved research graphs."
      error={error}
    >
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
          disabled={isBusy}
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
    </AuthSplitLayout>
  );
}
