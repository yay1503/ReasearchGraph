import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, GitBranch, Play } from 'lucide-react';

const SCENARIOS = [
  {
    id: 'reproduce',
    label: 'Paper → Experiment',
    status: 'Verified · 0.915 AUC',
    statusTone: 'forest',
    consoleTitle: 'Experiment Runner · smote_eval.py',
    consoleLines: [
      { kind: 'cmd', text: '$ python smote_eval.py --dataset pima --k 5' },
      { kind: 'info', text: 'Parsed Chawla et al. (2002) Section 4.2' },
      { kind: 'metric', text: '{ "baseline_auc": 0.916, "smote_auc": 0.915, "f1": 0.873 }' },
    ],
    activeNodeIds: ['paper', 'experiment', 'result'],
  },
  {
    id: 'heal',
    label: 'Self-Healing Fix',
    status: 'Patched · Retry Passed',
    statusTone: 'amber',
    consoleTitle: 'Debugger Agent · research_memory #14',
    consoleLines: [
      { kind: 'err', text: "InvalidParameterError: max_features='auto' removed" },
      { kind: 'fix', text: 'Patch: DecisionTreeClassifier(max_features=None)' },
      { kind: 'metric', text: 'Saved fix to memory · Re-run exit code 0' },
    ],
    activeNodeIds: ['paper', 'experiment', 'error_fix', 'result'],
  },
  {
    id: 'branch',
    label: 'What-If Branch',
    status: 'RF k=3 · +0.027 AUC',
    statusTone: 'forest',
    consoleTitle: 'What-If Evaluator · branch_rf_k3.py',
    consoleLines: [
      { kind: 'cmd', text: 'Prompt: "Compare Random Forest with k=3 neighbors"' },
      { kind: 'info', text: 'Branched from SMOTE Baseline (k=5)' },
      { kind: 'metric', text: '{ "rf_k3_auc": 0.942, "delta_vs_base": "+0.027" }' },
    ],
    activeNodeIds: ['paper', 'experiment', 'branch', 'result'],
  },
];

export default function HeroGraphPreview() {
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused) return undefined;
    const timer = setInterval(() => {
      setScenarioIdx((prev) => (prev + 1) % SCENARIOS.length);
    }, 4200);
    return () => clearInterval(timer);
  }, [isPaused]);

  const active = SCENARIOS[scenarioIdx];
  const showFix = active.id === 'heal';
  const showBranch = active.id === 'branch';

  return (
    <div
      className="rg-app-preview"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Clean Application Chrome Header */}
      <div className="rg-app-preview-bar">
        <div className="rg-app-preview-title">
          <span className="rg-forest-dot" aria-hidden="true" />
          <span>SMOTE Reproduction Study</span>
        </div>

        <div className="rg-app-preview-tabs" role="tablist" aria-label="Workflow preview modes">
          {SCENARIOS.map((sc, idx) => (
            <button
              key={sc.id}
              type="button"
              role="tab"
              aria-selected={idx === scenarioIdx}
              className={`rg-app-preview-tab ${idx === scenarioIdx ? 'is-active' : ''}`}
              onClick={() => setScenarioIdx(idx)}
            >
              {sc.label}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Split Workspace: Graph Stage + Live Execution Inspector */}
      <div className="rg-app-preview-body">
        <div className="rg-preview-canvas">
          <svg
            className="rg-preview-lines"
            viewBox="0 0 1000 310"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <marker
                id="rg-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="currentColor" />
              </marker>
            </defs>

            {/* Paper -> Experiment */}
            <path
              d="M 280 74 L 280 124"
              className="rg-graph-wire is-active"
              vectorEffect="non-scaling-stroke"
              markerEnd="url(#rg-arrow)"
            />

            {/* Experiment -> Result */}
            <path
              d="M 280 184 L 280 232"
              className="rg-graph-wire is-active"
              vectorEffect="non-scaling-stroke"
              markerEnd="url(#rg-arrow)"
            />

            {/* Experiment -> Fix or Branch */}
            <path
              d="M 520 154 L 616 154"
              className={`rg-graph-wire ${showFix || showBranch ? 'is-highlight' : ''}`}
              vectorEffect="non-scaling-stroke"
              markerEnd="url(#rg-arrow)"
            />

            {/* Fix/Branch -> Result */}
            {(showFix || showBranch) && (
              <path
                d="M 790 184 C 790 250, 660 262, 526 262"
                className="rg-graph-wire is-forest"
                vectorEffect="non-scaling-stroke"
                markerEnd="url(#rg-arrow)"
              />
            )}
          </svg>

          {/* Readable Edge Labels */}
          <span className="rg-wire-tag" style={{ left: '28%', top: '99px' }}>
            extracts
          </span>
          <span className="rg-wire-tag" style={{ left: '28%', top: '208px' }}>
            produces
          </span>
          <span
            className="rg-wire-tag"
            style={{ left: '57%', top: '134px' }}
          >
            {showBranch ? 'branches' : 'auto-fix'}
          </span>

          {/* Node 1: Source Paper */}
          <div className="rg-mini-node is-paper" style={{ left: '4%', top: '16px', width: '48%' }}>
            <div className="rg-mini-node-meta">
              <span className="rg-mini-dot is-blue" />
              <span>Paper</span>
            </div>
            <div className="rg-mini-node-name">Chawla et al. (2002) · SMOTE</div>
          </div>

          {/* Node 2: Experiment */}
          <div className="rg-mini-node is-exp" style={{ left: '4%', top: '126px', width: '48%' }}>
            <div className="rg-mini-node-meta">
              <span className="rg-mini-dot is-amber" />
              <span>Experiment</span>
            </div>
            <div className="rg-mini-node-name">Weighted DT vs SMOTE (k=5)</div>
          </div>

          {/* Node 3: Context-dependent Fix or What-If Branch */}
          <div
            className={`rg-mini-node ${showBranch ? 'is-forest' : 'is-fix'} ${
              showFix || showBranch ? 'is-emphasized' : 'is-muted'
            }`}
            style={{ left: '62%', top: '126px', width: '34%' }}
          >
            <div className="rg-mini-node-meta">
              {showBranch ? (
                <GitBranch size={11} strokeWidth={2} className="rg-mini-icon-forest" />
              ) : (
                <AlertTriangle size={11} strokeWidth={2} className="rg-mini-icon-amber" />
              )}
              <span>{showBranch ? 'Branch' : 'Auto-Fix'}</span>
            </div>
            <div className="rg-mini-node-name">
              {showBranch ? 'Random Forest (k=3)' : "max_features=None"}
            </div>
          </div>

          {/* Node 4: Verified Result */}
          <div
            className="rg-mini-node is-result"
            style={{ left: '4%', top: '234px', width: '48%' }}
          >
            <div className="rg-mini-node-meta">
              <CheckCircle2 size={11} strokeWidth={2} className="rg-mini-icon-forest" />
              <span>Result</span>
            </div>
            <div className="rg-mini-node-name">
              {showBranch ? 'RF AUC 0.942 · +0.027' : 'SMOTE AUC 0.915 · F1 0.873'}
            </div>
          </div>
        </div>

        {/* Right Live Output Drawer inside Preview */}
        <div className="rg-preview-console">
          <div className="rg-preview-console-head">
            <span className="rg-preview-console-title">{active.consoleTitle}</span>
            <span className={`rg-preview-console-badge is-${active.statusTone}`}>
              {active.status}
            </span>
          </div>

          <div className="rg-preview-console-lines">
            {active.consoleLines.map((line, i) => (
              <div key={i} className={`rg-console-line is-${line.kind}`}>
                {line.text}
              </div>
            ))}
          </div>

          <div className="rg-preview-console-foot">
            <span className="rg-console-hint">
              <Play size={10} fill="currentColor" /> Isolated sandbox · Research memory linked
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
