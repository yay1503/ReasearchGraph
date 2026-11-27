import { Handle, Position } from '@xyflow/react';
import { X } from 'lucide-react';
import { getNodeTypeStyle } from '../nodeStyles';

function formatNodePreview(content) {
  if (typeof content !== 'string') return null;
  const trimmed = content.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        if ('smote_auc' in parsed && 'baseline_auc' in parsed) {
          return {
            text: `SMOTE ${parsed.smote_auc} · Base ${parsed.baseline_auc}`,
            isMetric: true,
          };
        }
        if ('smote_auc' in parsed && 'smote_f1' in parsed) {
          return {
            text: `AUC ${parsed.smote_auc} · F1 ${parsed.smote_f1}`,
            isMetric: true,
          };
        }
        const entries = Object.entries(parsed).slice(0, 2);
        if (entries.length > 0) {
          return {
            text: entries
              .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
              .join(' · '),
            isMetric: true,
          };
        }
        return null;
      }
    } catch {
      // Fall through to prose preview
    }
  }

  return { text: trimmed, isMetric: false };
}

export default function ResearchNode({ id, data, selected }) {
  const nodeType = data?.type || 'note';
  const typeStyle = getNodeTypeStyle(nodeType);
  const preview = formatNodePreview(data?.content);

  return (
    <div
      className={`rg-research-node ${selected ? 'is-selected' : ''}`}
      data-node-type={nodeType}
      style={{
        borderLeft: `3px solid ${
          nodeType === 'note' || !typeStyle ? 'var(--node-note-accent)' : typeStyle.accent
        }`,
      }}
    >
      <Handle type="target" position={Position.Top} className="rg-handle" />

      <div className="rg-research-node-header">
        <span className="rg-node-badge" data-node-type={nodeType}>
          {nodeType}
        </span>

        <button
          type="button"
          className="rg-node-delete nodrag nopan"
          onClick={(e) => {
            e.stopPropagation();
            data?.onDelete?.(id);
          }}
          title="Delete node"
          aria-label={`Delete ${data?.title || 'node'}`}
        >
          <X size={13} strokeWidth={2} />
        </button>
      </div>

      <div className="rg-research-node-title">{data?.title}</div>

      {preview && (
        <div
          className={`rg-research-node-preview ${preview.isMetric ? 'is-metric' : ''}`}
          title={preview.text}
        >
          {preview.text}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="rg-handle" />
    </div>
  );
}
