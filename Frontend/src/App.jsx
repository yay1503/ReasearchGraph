import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { ArrowLeft, Moon, Sun } from 'lucide-react';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import WorkspaceCanvas from './pages/WorkspaceCanvas';
import { useTheme } from './utils/theme';

function RoutePlaceholder({ title, description }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="rg-landing">
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
        </div>
      </header>

      <main className="rg-placeholder-main">
        <div className="rg-placeholder-card">
          <h1 className="rg-placeholder-title">{title}</h1>
          <p className="rg-placeholder-desc">{description}</p>
          <div className="rg-placeholder-actions">
            <Link to="/" className="rg-btn rg-btn-secondary rg-brand-link">
              <ArrowLeft size={15} strokeWidth={1.75} />
              <span>Back to Home</span>
            </Link>
            <Link to="/workspace" className="rg-btn rg-btn-accent rg-brand-link">
              Open Workspace
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/workspace" element={<WorkspaceCanvas />} />
        <Route path="/workspace/:id" element={<WorkspaceCanvas />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/signup"
          element={
            <RoutePlaceholder
              title="Create Account"
              description="Registration screen coming next. You can sign in or try the demo workspace right now."
            />
          }
        />
        <Route
          path="/dashboard"
          element={
            <RoutePlaceholder
              title="Research Workspaces"
              description="Workspace dashboard coming next. Open the active workspace to inspect your graph and agents."
            />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
