import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  X,
} from 'lucide-react';
import { PROVIDER_LIST, PROVIDERS, getLLMConfig, saveLLMConfig } from '../utils/llmConfig';

const API = import.meta.env.VITE_API_URL || '/api';

export default function EngineModal({ onClose, onSaved }) {
  const initial = getLLMConfig();
  const [provider, setProvider] = useState(initial.provider);
  const [model, setModel] = useState(initial.model);
  const [apiKey, setApiKey] = useState(initial.apiKey);
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const activeProvider = PROVIDERS[provider] || PROVIDERS.ollama;

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && !isTesting) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, isTesting]);

  const handleSelectProvider = (nextId) => {
    const nextMeta = PROVIDERS[nextId] || PROVIDERS.ollama;
    setProvider(nextMeta.id);
    setModel(nextMeta.defaultModel);
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    if (isTesting) return;
    if (activeProvider.requiresKey && !apiKey.trim()) {
      setTestResult({
        ok: false,
        message: `Enter an API key for ${activeProvider.label} first.`,
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${API}/llm/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: activeProvider.id,
          model: model.trim() || activeProvider.defaultModel,
          api_key: activeProvider.requiresKey ? apiKey.trim() : '',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setTestResult({
          ok: false,
          message: data?.detail || 'Connection failed.',
        });
        return;
      }
      setTestResult({
        ok: true,
        message: 'Connected',
      });
    } catch {
      setTestResult({
        ok: false,
        message: 'Backend server unreachable.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (activeProvider.requiresKey && !apiKey.trim()) {
      setTestResult({
        ok: false,
        message: `Please enter an API key for ${activeProvider.label}.`,
      });
      return;
    }

    const saved = saveLLMConfig({
      provider: activeProvider.id,
      model: model.trim() || activeProvider.defaultModel,
      apiKey: activeProvider.requiresKey ? apiKey.trim() : '',
    });
    onSaved?.(saved);
    onClose();
  };

  return (
    <div
      className="rg-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isTesting) {
          onClose();
        }
      }}
      role="presentation"
    >
      <div
        className="rg-modal-card rg-engine-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rg-engine-modal-title"
      >
        <div className="rg-modal-header">
          <span className="rg-node-badge" data-node-type="experiment">
            LLM ENGINE
          </span>
          <button
            type="button"
            className="rg-inspector-close"
            onClick={onClose}
            disabled={isTesting}
            aria-label="Close engine modal"
          >
            <X size={15} strokeWidth={2} />
          </button>
        </div>

        <h2 id="rg-engine-modal-title" className="rg-modal-title">
          Configure AI Engine
        </h2>
        <p className="rg-engine-subtitle">
          Run 100% private with local Ollama or bring your own API key.
        </p>

        <form onSubmit={handleSave} className="rg-modal-form">
          <div className="rg-field">
            <span className="rg-field-label">Provider</span>
            <div className="rg-provider-grid" role="radiogroup" aria-label="LLM Provider">
              {PROVIDER_LIST.map((item) => {
                const isSelected = item.id === provider;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    className={`rg-provider-pill ${isSelected ? 'is-active' : ''}`}
                    onClick={() => handleSelectProvider(item.id)}
                    disabled={isTesting}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rg-field">
            <label htmlFor="rg-engine-model" className="rg-field-label">
              Model Name
            </label>
            <input
              id="rg-engine-model"
              type="text"
              className="rg-input rg-input-mono"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={activeProvider.defaultModel}
              disabled={isTesting}
            />
          </div>

          {activeProvider.requiresKey && (
            <div className="rg-field">
              <label htmlFor="rg-engine-key" className="rg-field-label">
                API Key
              </label>
              <div className="rg-password-wrap">
                <input
                  id="rg-engine-key"
                  type={showKey ? 'text' : 'password'}
                  className="rg-input rg-input-mono rg-password-input"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={`Paste your ${activeProvider.label} API key`}
                  autoComplete="off"
                  disabled={isTesting}
                />
                <button
                  type="button"
                  className="rg-password-toggle"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setShowKey((prev) => !prev)}
                  aria-label={showKey ? 'Hide API key' : 'Show API key'}
                  title={showKey ? 'Hide API key' : 'Show API key'}
                  disabled={isTesting}
                >
                  {showKey ? (
                    <EyeOff size={15} strokeWidth={1.75} />
                  ) : (
                    <Eye size={15} strokeWidth={1.75} />
                  )}
                </button>
              </div>
              <p className="rg-engine-note">
                <Lock size={12} strokeWidth={1.85} aria-hidden="true" />
                <span>Stored locally in your browser. Never saved to our database.</span>
              </p>
            </div>
          )}

          {testResult && (
            <div
              className={`rg-test-status ${testResult.ok ? 'is-ok' : 'is-err'}`}
              role="status"
            >
              {testResult.ok ? (
                <CheckCircle2 size={14} strokeWidth={2} aria-hidden="true" />
              ) : (
                <AlertCircle size={14} strokeWidth={2} aria-hidden="true" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}

          <div className="rg-engine-footer">
            <button
              type="button"
              className="rg-btn rg-btn-secondary"
              onClick={handleTestConnection}
              disabled={isTesting}
            >
              {isTesting ? (
                <>
                  <Loader2 size={14} strokeWidth={2} className="rg-spin" />
                  <span>Testing...</span>
                </>
              ) : (
                <span>Test Connection</span>
              )}
            </button>

            <div className="rg-engine-footer-right">
              <button
                type="button"
                className="rg-btn rg-btn-secondary"
                onClick={onClose}
                disabled={isTesting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rg-btn rg-btn-accent"
                disabled={isTesting}
              >
                Save Engine
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
