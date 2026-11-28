import { Handle, Position } from '@xyflow/react';
import { Folder, MessageSquare, X } from 'lucide-react';
import { getNodeTypeStyle } from '../nodeStyles';

const PILL_COLORS = ['#1D9BF0', '#9333EA', '#059669', '#D97706'];

function formatNodePreview(content, nodeType) {
  if (typeof content !== 'string') return null;
  const trimmed = content.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const lines = Object.entries(parsed)
          .slice(0, 4)
          .map(([k, v]) => `  ${k}: ${typeof v === 'object' ? JSON.stringify(v) : JSON.stringify(v)}`);
        return {
          text: `{\n${lines.join(',\n')}\n}`,
          isCode: true,
        };
      }
    } catch {
      // Fall through to prose preview
    }
  }

  return {
    text: trimmed,
    isCode: nodeType === 'code' || nodeType === 'experiment',
  };
}

export default function ResearchNode({ id, data, selected }) {
  const nodeType = data?.type || 'note';
  const isGroup = nodeType === 'group';
  const typeStyle = getNodeTypeStyle(nodeType);
  const preview = formatNodePreview(data?.content, nodeType);
  const tags = Array.isArray(data?.tags) ? data.tags : [];
  const commentsCount = Number(data?.commentsCount || 0);
  const groupTitle = data?.groupTitle || '';
  const dotColor = typeStyle?.accent || '#22C55E';

  return (
    <div
      className={`rg-research-node ${selected ? 'is-selected' : ''}`}
      data-node-type={nodeType}
      style={
        isGroup
          ? {
              border: '2px dashed #0EA5E9',
              background: 'rgba(14, 165, 233, 0.06)',
              minWidth: '290px',
            }
          : undefined
      }
    >
      <Handle type="target" position={Position.Top} className="rg-handle" />
      <Handle type="target" position={Position.Left} id="left" className="rg-handle" />

      <div className="rg-research-node-header">
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
          <span
            className="rg-node-status-dot"
            style={{ backgroundColor: dotColor }}
            aria-hidden="true"
          />
          <span className="rg-node-badge" data-node-type={nodeType}>
            {isGroup ? 'TOPIC GROUP' : nodeType}
          </span>
        </div>

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
          className={`rg-research-node-preview ${preview.isCode ? 'is-code-block' : ''}`}
          title={preview.text}
        >
          {preview.text}
        </div>
      )}

      {(tags.length > 0 || groupTitle || commentsCount > 0) && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '6px',
            marginTop: '10px',
          }}
        >
          {groupTitle && (
            <span
              className="rg-vibrant-pill"
              style={{ backgroundColor: '#0EA5E9', gap: '4px' }}
            >
              <Folder size={10} />
              {groupTitle}
            </span>
          )}
          {tags.slice(0, 3).map((tag, idx) => (
            <span
              key={tag}
              className="rg-vibrant-pill"
              style={{ backgroundColor: PILL_COLORS[idx % PILL_COLORS.length] }}
            >
              {tag}
            </span>
          ))}
          {commentsCount > 0 && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                fontSize: '11px',
                opacity: 0.7,
                marginLeft: 'auto',
              }}
            >
              <MessageSquare size={11} />
              {commentsCount}
            </span>
          )}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="rg-handle" />
      <Handle type="source" position={Position.Right} id="right" className="rg-handle" />
    </div>
  );
}
