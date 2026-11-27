import { useEffect, useState } from 'react';
import { getNodeTypeStyle } from '../nodeStyles';

const ENGINE_PROVIDERS = [
  'Local Llama',
  'OpenAI',
  'Gemini',
  'Anthropic · BYOK',
];

const PREVIEW_NODES = [
  {
    id: 'paper',
    type: 'paper',
    title: 'SMOTE: Synthetic Minority Over-sampling',
    preview: null,
    posClass: 'rg-pnode-paper',
    animClass: 'rg-panim-node-1',
  },
  {
    id: 'experiment',
    type: 'experiment',
    title: 'SMOTE vs Weighted DT (k=5)',
    preview: null,
    posClass: 'rg-pnode-experiment',
    animClass: 'rg-panim-node-2',
  },
  {
    id: 'error_fix',
    type: 'error_fix',
    title: "Fix: max_features='auto'",
    preview: null,
    posClass: 'rg-pnode-error-fix',
    animClass: 'rg-panim-node-3',
  },
  {
    id: 'result',
    type: 'result',
    title: 'AUC: SMOTE 0.915 vs Base 0.916',
    preview: 'SMOTE 0.915 · Base 0.916',
    posClass: 'rg-pnode-result',
    animClass: 'rg-panim-node-4',
  },
];

export default function HeroGraphPreview() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % ENGINE_PROVIDERS.length);
    }, 2600);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="rg-preview-frame">
      {/* Model-Agnostic Engine Header Bar */}
      <div className="rg-preview-header">
        <div className="rg-engine-status">
          <span className="rg-engine-dot" aria-hidden="true" />
          <span>ACTIVE ENGINE</span>
        </div>

        <div className="rg-engine-pills" role="group" aria-label="Supported LLM engines">
          {ENGINE_PROVIDERS.map((provider, idx) => (
            <button
              key={provider}
              type="button"
              className={`rg-engine-pill ${idx === activeIndex ? 'is-active' : ''}`}
              onClick={() => setActiveIndex(idx)}
            >
              {provider}
            </button>
          ))}
        </div>
      </div>

      {/* Self-Drawing Mini-Graph Stage */}
      <div className="rg-preview-stage">
        <svg
          className="rg-preview-svg"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <mask id="rg-edge-mask-1" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
              <path
                d="M 26 24 L 26 37"
                className="rg-preview-edge-mask rg-panim-edge-1"
                pathLength="100"
                vectorEffect="non-scaling-stroke"
              />
            </mask>
            <mask id="rg-edge-mask-2" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
              <path
                d="M 48 45 C 65 45, 76 45, 76 50"
                className="rg-preview-edge-mask rg-panim-edge-2"
                pathLength="100"
                vectorEffect="non-scaling-stroke"
              />
            </mask>
            <mask id="rg-edge-mask-3" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
              <path
                d="M 26 58 L 26 73"
                className="rg-preview-edge-mask rg-panim-edge-3"
                pathLength="100"
                vectorEffect="non-scaling-stroke"
              />
            </mask>
          </defs>

          {/* PAPER -> EXPERIMENT */}
          <path
            d="M 26 24 L 26 37"
            className="rg-preview-edge"
            vectorEffect="non-scaling-stroke"
            mask="url(#rg-edge-mask-1)"
          />
          {/* EXPERIMENT -> ERROR_FIX */}
          <path
            d="M 48 45 C 65 45, 76 45, 76 50"
            className="rg-preview-edge"
            vectorEffect="non-scaling-stroke"
            mask="url(#rg-edge-mask-2)"
          />
          {/* EXPERIMENT -> RESULT */}
          <path
            d="M 26 58 L 26 73"
            className="rg-preview-edge"
            vectorEffect="non-scaling-stroke"
            mask="url(#rg-edge-mask-3)"
          />
        </svg>

        {/* Edge Pill Labels */}
        <span className="rg-preview-edge-pill rg-ppill-1 rg-panim-pill-1">
          derived_from
        </span>
        <span className="rg-preview-edge-pill rg-ppill-2 rg-panim-pill-2">
          fixed_by
        </span>
        <span className="rg-preview-edge-pill rg-ppill-3 rg-panim-pill-3">
          produced
        </span>

        {/* 4 Research Nodes */}
        {PREVIEW_NODES.map((node) => {
          const style = getNodeTypeStyle(node.type);
          return (
            <div
              key={node.id}
              className={`rg-preview-node ${node.posClass} ${node.animClass}`}
              style={{ borderLeft: `3px solid ${style.accent}` }}
            >
              <div className="rg-preview-node-head">
                <span className="rg-node-badge" data-node-type={node.type}>
                  {node.type}
                </span>
              </div>
              <div className="rg-preview-node-title">{node.title}</div>
              {node.preview && (
                <div className="rg-research-node-preview is-metric">
                  {node.preview}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
