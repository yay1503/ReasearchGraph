import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { getNodeTypeStyle } from '../nodeStyles';

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
  what_if: {
    badge: 'WHAT IF',
    title: 'Ask a What-If Hypothesis',
    inputLabel: 'Hypothesis',
    placeholder: 'What if we use Random Forest with k=3?',
    submitLabel: 'Run Hypothesis',
  },
};

const WHAT_IF_SUGGESTIONS = [
  { label: 'Random Forest (k=3)', value: 'What if we use Random Forest with k=3?' },
  { label: 'Decision Tree (k=7)', value: 'What if we use Decision Tree with k=7?' },
  { label: 'Random Forest (k=5)', value: 'What if we use Random Forest with k=5?' },
];

export default function ActionModal({ mode, onClose, onSubmit, isSubmitting }) {
  const isWhatIf = mode === 'what_if';
  const config = MODAL_CONFIG[mode] || MODAL_CONFIG.note;
  const badgeStyle = getNodeTypeStyle(mode);

  const [primaryValue, setPrimaryValue] = useState(
    isWhatIf ? 'What if we use Random Forest with k=3?' : ''
  );
  const [content, setContent] = useState('');
  const inputRef = useRef(null);

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
  const canSubmit = trimmedPrimary.length > 0 && !isSubmitting;

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    if (isWhatIf) {
      onSubmit({ question: trimmedPrimary });
    } else {
      onSubmit({ title: trimmedPrimary, content: content.trim() });
    }
  };

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
          <span
            className="rg-node-badge"
            style={{
              backgroundColor: badgeStyle.badgeBg,
              borderColor: badgeStyle.badgeBorder,
              color: badgeStyle.badgeText,
            }}
          >
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
          <div className="rg-field">
            <label htmlFor="rg-modal-primary" className="rg-field-label">
              {config.inputLabel}
            </label>
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
          </div>

          {isWhatIf ? (
            <div className="rg-field">
              <span className="rg-field-label">Quick Suggestions</span>
              <div className="rg-chip-row">
                {WHAT_IF_SUGGESTIONS.map((item) => (
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
            </div>
          ) : (
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
