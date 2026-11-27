import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import AuthSplitLayout from '../components/AuthSplitLayout';
import { syncUserWorkspace } from '../utils/auth';

const API = 'http://127.0.0.1:8000';

export default function SignupPage() {
  const navigate = useNavigate();

  const [mood, setMood] = useState('idle');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSignup = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName || !trimmedEmail) {
      setError('Please enter your full name and email.');
      setMood('sad');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      setMood('sad');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      setMood('sad');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const res = await fetch(`${API}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail,
          password,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.detail || 'Could not create account.');
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

  return (
    <AuthSplitLayout
      mood={mood}
      setMood={setMood}
      tagline="Start your living research notebook."
      title="Create an account"
      subtitle="Save workspaces, track experiments, and sync across sessions."
      error={error}
    >
      <form onSubmit={handleSignup} className="rg-auth-form">
        <div className="rg-field">
          <label htmlFor="rg-signup-name" className="rg-field-label">
            Full Name
          </label>
          <input
            id="rg-signup-name"
            type="text"
            className="rg-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Dr. Ada Lovelace"
            autoComplete="name"
            required
            disabled={isSubmitting}
          />
        </div>

        <div className="rg-field">
          <label htmlFor="rg-signup-email" className="rg-field-label">
            Email
          </label>
          <input
            id="rg-signup-email"
            type="email"
            className="rg-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="researcher@lab.edu"
            autoComplete="email"
            required
            disabled={isSubmitting}
          />
        </div>

        <div className="rg-field">
          <label htmlFor="rg-signup-password" className="rg-field-label">
            Password
          </label>
          <div className="rg-password-wrap">
            <input
              id="rg-signup-password"
              type={showPassword ? 'text' : 'password'}
              className="rg-input rg-password-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setMood('shy')}
              onBlur={() => setMood('idle')}
              placeholder="At least 6 characters"
              autoComplete="new-password"
              minLength={6}
              required
              disabled={isSubmitting}
            />
            <button
              type="button"
              className="rg-password-toggle"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              title={showPassword ? 'Hide password' : 'Show password'}
              disabled={isSubmitting}
            >
              {showPassword ? (
                <EyeOff size={15} strokeWidth={1.75} />
              ) : (
                <Eye size={15} strokeWidth={1.75} />
              )}
            </button>
          </div>
        </div>

        <div className="rg-field">
          <label htmlFor="rg-signup-confirm" className="rg-field-label">
            Confirm Password
          </label>
          <input
            id="rg-signup-confirm"
            type={showPassword ? 'text' : 'password'}
            className="rg-input"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onFocus={() => setMood('shy')}
            onBlur={() => setMood('idle')}
            placeholder="Re-enter your password"
            autoComplete="new-password"
            minLength={6}
            required
            disabled={isSubmitting}
          />
        </div>

        <button
          type="submit"
          className="rg-btn rg-btn-lg rg-btn-accent rg-btn-block"
          disabled={isSubmitting}
          onMouseEnter={() => setMood('happy')}
          onMouseLeave={() => setMood('idle')}
        >
          {isSubmitting ? (
            <>
              <Loader2 size={15} strokeWidth={2} className="rg-spin" />
              <span>Creating Account...</span>
            </>
          ) : (
            <span>Create Account</span>
          )}
        </button>
      </form>

      <p className="rg-auth-footer">
        Already have an account?{' '}
        <Link
          to="/login"
          className="rg-auth-link"
          onMouseEnter={() => setMood('happy')}
          onMouseLeave={() => setMood('idle')}
        >
          Sign in
        </Link>
      </p>
    </AuthSplitLayout>
  );
}
