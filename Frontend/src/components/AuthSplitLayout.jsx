import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Moon, Sun } from 'lucide-react';
import { AgentMascots } from './AgentMascots';
import { useTheme } from '../utils/theme';

export default function AuthSplitLayout({
  mood,
  setMood,
  tagline,
  title,
  subtitle,
  error,
  children,
}) {
  const { theme, toggleTheme } = useTheme();
  const stageRef = useRef(null);

  const handleStageMouseMove = (e) => {
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--pointer-x', `${e.clientX - rect.left}px`);
    el.style.setProperty('--pointer-y', `${e.clientY - rect.top}px`);
  };

  return (
    <div className="rg-auth-split">
      {/* Circular-Wipe Dark Mode Toggle pinned top-right */}
      <button
        type="button"
        className="rg-btn rg-btn-secondary rg-btn-icon rg-auth-theme-btn"
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

      {/* Left Panel: The Mascot Stage */}
      <section
        ref={stageRef}
        className="rg-auth-stage"
        onMouseMove={handleStageMouseMove}
        aria-label="ResearchGraph Agents Showcase"
      >
        <div className="rg-auth-stage-glow" aria-hidden="true" />

        <div className="rg-auth-stage-top">
          <Link to="/" className="rg-brand rg-brand-link">
            ResearchGraph
          </Link>
          <Link
            to="/"
            className="rg-back-link"
            onMouseEnter={() => setMood('sad')}
            onMouseLeave={() => setMood('idle')}
          >
            <ArrowLeft size={14} strokeWidth={1.75} />
            <span>Back to Home</span>
          </Link>
        </div>

        <div className="rg-auth-stage-center">
          <AgentMascots mood={mood} />
          <p className="rg-auth-tagline">{tagline}</p>
          <p className="rg-auth-subcaption">READER · EXPERIMENT · DEBUGGER</p>
        </div>
      </section>

      {/* Right Panel: Form Surface */}
      <main className="rg-auth-form-panel">
        <div className="rg-auth-form-container">
          <h1 className="rg-auth-title">{title}</h1>
          <p className="rg-auth-subtitle">{subtitle}</p>

          {error && (
            <div className="rg-auth-error" role="alert">
              <AlertCircle
                size={15}
                strokeWidth={2}
                className="rg-auth-error-icon"
                aria-hidden="true"
              />
              <span>{error}</span>
            </div>
          )}

          {children}
        </div>
      </main>
    </div>
  );
}
