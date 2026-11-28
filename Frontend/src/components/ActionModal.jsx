import { useState, useEffect, useRef } from 'react';
import { FileUp, Globe, Loader2, Mic, MicOff, X } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

const MODAL_CONFIG = {
  paper: {
    badge: 'PAPER',
    title: 'Add Paper',
    inputLabel: 'Paper Title',
    placeholder: 'e.g., Chawla et al. (2002) — SMOTE',
    submitLabel: 'Create Node',
  },
  question: {
    badge: 'QUESTION',
    title: 'Add Question',
    inputLabel: 'Research Question',
    placeholder: 'e.g., Does k=3 improve minority recall on tabular data?',
    submitLabel: 'Create Node',
  },
  note: {
    badge: 'NOTE',
    title: 'Add Note',
    inputLabel: 'Note Title',
    placeholder: 'e.g., Class imbalance baseline observation',
    submitLabel: 'Create Node',
  },
  group: {
    badge: 'GROUP',
    title: 'Add Topic Group',
    inputLabel: 'Topic Group Name',
    placeholder: 'e.g., Sampling Methods & Baselines',
    submitLabel: 'Create Group',
  },
  what_if: {
    badge: 'WHAT IF',
    title: 'Ask a What-If Hypothesis',
    inputLabel: 'Hypothesis',
    placeholder: 'What if we use Random Forest with k=3?',
    submitLabel: 'Run Hypothesis',
  },
  harness: {
    badge: 'HARNESS',
    title: 'AI Agent Harness',
    inputLabel: 'Goal or Command',
    placeholder: 'e.g., Search arXiv for SMOTE papers, create a note summarizing one, and connect it to my question',
    submitLabel: 'Run Harness',
  },
  sandbox: {
    badge: 'SANDBOX',
    title: 'General Sandbox Experiment',
    inputLabel: 'Experiment Goal (uses Research Memory)',
    placeholder: 'e.g., Reproduce the fetched paper/repo method on synthetic tabular data and log AUC & F1',
    submitLabel: 'Generate & Run in Sandbox',
  },
};

const WHAT_IF_SUGGESTIONS = [
  { label: 'Random Forest (k=3)', value: 'What if we use Random Forest with k=3?' },
  { label: 'Decision Tree (k=7)', value: 'What if we use Decision Tree with k=7?' },
  { label: 'Random Forest (k=5)', value: 'What if we use Random Forest with k=5?' },
];

const HARNESS_SUGGESTIONS = [
  {
    label: 'Search arXiv & summarize',
    value: 'Search arXiv for SMOTE class imbalance papers, add the best paper as a node with its URL and abstract, and connect it to my question.',
  },
  {
    label: 'Find GitHub code repo',
    value: 'Search GitHub for imbalanced-learn SMOTE implementation, add a code node with its repo URL and dependencies, and connect it.',
  },
  {
    label: 'Organize & connect notes',
    value: 'Review existing nodes in this workspace, add a summary note of key gaps, and connect related nodes.',
  },
];

export default function ActionModal({ mode, onClose, onSubmit, isSubmitting }) {
  const isWhatIf = mode === 'what_if';
  const isHarness = mode === 'harness';
  const isSandbox = mode === 'sandbox';
  const config = MODAL_CONFIG[mode] || MODAL_CONFIG.note;

  const [primaryValue, setPrimaryValue] = useState(
    isWhatIf ? 'What if we use Random Forest with k=3?' : ''
  );
  const [urlValue, setUrlValue] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [content, setContent] = useState('');
  const [autoApprove, setAutoApprove] = useState(false);
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const inputRef = useRef(null);
  const pdfInputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    if (isWhatIf) {
      inputRef.current?.select();
    }
  }, [isWhatIf]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isSubmitting]);

  const trimmedPrimary = primaryValue.trim();
  const canSubmit = trimmedPrimary.length > 0 && !isSubmitting && !isFetchingUrl && !isUploadingPdf;

  const handlePdfUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFetchError('');
    setIsUploadingPdf(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API}/tools/upload-pdf`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFetchError(data?.detail || 'Could not parse PDF.');
        return;
      }
      if (data.title && !primaryValue.trim()) setPrimaryValue(data.title);
      if (data.content) setContent(data.content);
    } catch {
      setFetchError('Failed to upload PDF to backend.');
    } finally {
      setIsUploadingPdf(false);
      e.target.value = '';
    }
  };

  const toggleVoiceInput = () => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      setFetchError('Voice recognition is not supported in this browser.');
      return;
    }
    if (isListening) return;
    const rec = new SpeechRec();
    rec.lang = 'en-US';
    rec.interimResults = false;
    setIsListening(true);
    rec.onresult = (ev) => {
      const transcript = ev.results?.[0]?.[0]?.transcript || '';
      if (transcript) {
        setPrimaryValue((prev) => (prev ? `${prev} ${transcript}` : transcript));
      }
    };
    rec.onerror = () => setIsListening(false);
    rec.onend = () => setIsListening(false);
    rec.start();
  };

  const handleFetchUrl = async () => {
    const trimmedUrl = urlValue.trim();
    if (!trimmedUrl || isFetchingUrl) return;
    setFetchError('');
    setIsFetchingUrl(true);
    try {
      const res = await fetch(`${API}/tools/fetch-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmedUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFetchError(data?.detail || 'Could not fetch URL.');
        return;
      }
      if (data.url) setUrlValue(data.url);
      if (data.title && !primaryValue.trim()) setPrimaryValue(data.title);
      if (data.content) setContent(data.content);
    } catch {
      setFetchError('Failed to reach backend URL fetcher.');
    } finally {
      setIsFetchingUrl(false);
    }
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    if (isWhatIf) {
      onSubmit({ question: trimmedPrimary });
    } else if (isHarness) {
      onSubmit({ goal: trimmedPrimary, autoApprove });
    } else if (isSandbox) {
      onSubmit({ goal: trimmedPrimary });
    } else {
      const parsedTags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      onSubmit({
        title: trimmedPrimary,
        url: urlValue.trim(),
        content: content.trim(),
        tags: parsedTags,
      });
    }
  };

  const suggestions = isWhatIf
    ? WHAT_IF_SUGGESTIONS
    : isHarness
      ? HARNESS_SUGGESTIONS
      : null;

  return (
    <div
      className="rg-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
      role="presentation"
    >
      <div
        className="rg-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rg-modal-title"
      >
        <div className="rg-modal-header">
          <span className="rg-node-badge" data-node-type={mode}>
            {config.badge}
          </span>
          <button
            type="button"
            className="rg-inspector-close"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close modal"
            title="Close"
          >
            <X size={15} strokeWidth={2} />
          </button>
        </div>

        <h2 id="rg-modal-title" className="rg-modal-title">
          {config.title}
        </h2>

        <form onSubmit={handleFormSubmit} className="rg-modal-form">
          {!isWhatIf && !isHarness && !isSandbox && (
            <div className="rg-field">
              <label htmlFor="rg-modal-url" className="rg-field-label">
                Link / URL or Local PDF{' '}
                <span className="rg-field-optional">(optional)</span>
              </label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  id="rg-modal-url"
                  type="text"
                  className="rg-input"
                  value={urlValue}
                  onChange={(e) => setUrlValue(e.target.value)}
                  placeholder="https://arxiv.org/abs/1106.1813 or github.com/..."
                  disabled={isSubmitting || isFetchingUrl || isUploadingPdf}
                />
                <button
                  type="button"
                  className="rg-btn rg-btn-secondary"
                  onClick={handleFetchUrl}
                  disabled={!urlValue.trim() || isFetchingUrl || isSubmitting}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {isFetchingUrl ? (
                    <Loader2 size={14} className="rg-spin" />
                  ) : (
                    <Globe size={14} />
                  )}
                  <span>{isFetchingUrl ? 'Fetching...' : 'Fetch'}</span>
                </button>
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept=".pdf"
                  style={{ display: 'none' }}
                  onChange={handlePdfUpload}
                />
                <button
                  type="button"
                  className="rg-btn rg-btn-secondary"
                  onClick={() => pdfInputRef.current?.click()}
                  disabled={isUploadingPdf || isSubmitting}
                  style={{ whiteSpace: 'nowrap' }}
                  title="Upload local PDF"
                >
                  {isUploadingPdf ? <Loader2 size={14} className="rg-spin" /> : <FileUp size={14} />}
                  <span>{isUploadingPdf ? 'Reading...' : 'PDF'}</span>
                </button>
              </div>
              {fetchError && (
                <span style={{ fontSize: '12px', color: 'var(--accent-danger, #dc2626)' }}>
                  {fetchError}
                </span>
              )}
            </div>
          )}

          <div className="rg-field">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label htmlFor="rg-modal-primary" className="rg-field-label">
                {config.inputLabel}
              </label>
              {(isHarness || isSandbox) && (
                <button
                  type="button"
                  className="rg-btn rg-btn-secondary"
                  style={{ padding: '2px 8px', fontSize: '11px' }}
                  onClick={toggleVoiceInput}
                  title="Voice command"
                >
                  {isListening ? <MicOff size={12} /> : <Mic size={12} />}
                  <span>{isListening ? 'Listening...' : 'Voice'}</span>
                </button>
              )}
            </div>
            {isHarness || isSandbox ? (
              <textarea
                id="rg-modal-primary"
                ref={inputRef}
                className="rg-textarea"
                rows={3}
                value={primaryValue}
                onChange={(e) => setPrimaryValue(e.target.value)}
                placeholder={config.placeholder}
                disabled={isSubmitting}
              />
            ) : (
              <input
                id="rg-modal-primary"
                ref={inputRef}
                type="text"
                className="rg-input"
                value={primaryValue}
                onChange={(e) => setPrimaryValue(e.target.value)}
                placeholder={config.placeholder}
                disabled={isSubmitting}
              />
            )}
          </div>

          {suggestions || isSandbox ? (
            <div className="rg-field">
              <span className="rg-field-label">Quick Suggestions</span>
              <div className="rg-chip-row">
                {(suggestions || []).map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className={`rg-suggestion-chip ${
                      primaryValue === item.value ? 'is-active' : ''
                    }`}
                    onClick={() => {
                      setPrimaryValue(item.value);
                      inputRef.current?.focus();
                    }}
                    disabled={isSubmitting}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {isHarness && (
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginTop: '10px',
                    fontSize: '12.5px',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={autoApprove}
                    onChange={(e) => setAutoApprove(e.target.checked)}
                    disabled={isSubmitting}
                  />
                  <span>Auto-apply actions (otherwise queue for Accept / Reject)</span>
                </label>
              )}
            </div>
          ) : (
            <>
              <div className="rg-field">
                <label htmlFor="rg-modal-tags" className="rg-field-label">
                  Tags <span className="rg-field-optional">(comma-separated, optional)</span>
                </label>
                <input
                  id="rg-modal-tags"
                  type="text"
                  className="rg-input"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="e.g., smote, tabular, baseline"
                  disabled={isSubmitting}
                />
              </div>
              <div className="rg-field">
                <label htmlFor="rg-modal-content" className="rg-field-label">
                  Content / Abstract <span className="rg-field-optional">(optional)</span>
                </label>
                <textarea
                  id="rg-modal-content"
                  className="rg-textarea"
                  rows={4}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Summary, key findings, or lab observation..."
                  disabled={isSubmitting}
                />
              </div>
            </>
          )}

          <div className="rg-modal-footer">
            <button
              type="button"
              className="rg-btn rg-btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rg-btn rg-btn-accent"
              disabled={!canSubmit}
            >
              {isSubmitting ? 'Working...' : config.submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
