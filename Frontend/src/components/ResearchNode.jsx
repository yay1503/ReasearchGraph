import { Handle, Position } from '@xyflow/react';
import { X } from 'lucide-react';
import { getNodeTypeStyle } from '../nodeStyles';

export default function ResearchNode({ id, data, selected }) {
  const nodeType = data?.type || 'note';
  const typeStyle = getNodeTypeStyle(nodeType);
  const preview = typeof data?.content === 'string' ? data.content.trim() : '';

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
        <div className="rg-research-node-preview" title={preview}>
          {preview}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="rg-handle" />
    </div>
  );
}
