import { useState, useEffect, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
} from '@xyflow/react';
import {
  FileText,
  HelpCircle,
  StickyNote,
  Sparkles,
  FlaskConical,
  GitBranch,
  Download,
  X,
  Check,
  Star,
} from 'lucide-react';
import '@xyflow/react/dist/style.css';
import ResearchNode from './components/ResearchNode';
import { getNodeColor } from './nodeStyles';

const API = 'http://127.0.0.1:8000';

const nodeTypes = { research: ResearchNode };

const EDGE_LABEL_PROPS = {
  labelBgStyle: { fill: '#FFFFFF', stroke: '#E5E0D8', strokeWidth: 1 },
  labelBgPadding: [6, 4],
  labelBgBorderRadius: 999,
  labelStyle: { fontFamily: 'JetBrains Mono', fontSize: 11, fill: '#44403C' },
};

export default function App() {
  const [workspaceId, setWorkspaceId] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [agents, setAgents] = useState([]);
  const [logs, setLogs] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Delete a node from SQLite and remove it (+ its connected edges) from the canvas
  const deleteNode = useCallback(async (nodeId) => {
    await fetch(`${API}/nodes/${nodeId}`, { method: 'DELETE' });
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
  }, []);

  // Helper to format a DB node into a custom ResearchNode
  const formatNode = useCallback(
    (n) => ({
      id: n.id,
      type: 'research',
      position: { x: n.pos_x, y: n.pos_y },
      data: {
        type: n.type,
        title: n.title,
        content: n.content,
        metadata: n.metadata_json,
        onDelete: deleteNode,
      },
    }),
    [deleteNode]
  );

  // Helper to reload nodes and edges from SQLite
  const refreshGraph = useCallback(
    async (wsId) => {
      if (!wsId) return;
      const graphRes = await fetch(`${API}/workspaces/${wsId}/graph`);
      const graph = await graphRes.json();
      setNodes(graph.nodes.map(formatNode));
      setEdges(
        graph.edges.map((e) => {
          const isAi = Boolean(e.is_ai_suggested);
          return {
            id: e.id,
            source: e.source_id,
            target: e.target_id,
            label: e.label,
            animated: isAi,
            style: {
              stroke: isAi ? '#78716C' : '#A8A29E',
              strokeWidth: 1.5,
              ...(isAi ? { strokeDasharray: '5 5' } : {}),
            },
            ...EDGE_LABEL_PROPS,
          };
        })
      );
    },
    [formatNode]
  );

  // 1. Load or create workspace + graph
  useEffect(() => {
    async function init() {
      let wsId = localStorage.getItem('rg_workspace_id');
      if (!wsId) {
        const wsRes = await fetch(`${API}/workspaces`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'SMOTE Research Workspace' }),
        });
        const ws = await wsRes.json();
        wsId = ws.id;
        localStorage.setItem('rg_workspace_id', wsId);
      }
      setWorkspaceId(wsId);
      await refreshGraph(wsId);
    }
    init();
  }, [refreshGraph]);

  // 2. Poll Agents & Live Activity Feed every 3 seconds
  const fetchAgentData = useCallback(async () => {
    if (!workspaceId) return;
    const [agentsRes, logsRes] = await Promise.all([
      fetch(`${API}/agents`),
      fetch(`${API}/workspaces/${workspaceId}/logs`),
    ]);
    setAgents(await agentsRes.json());
    setLogs(await logsRes.json());
  }, [workspaceId]);

  useEffect(() => {
    fetchAgentData();
    const interval = setInterval(fetchAgentData, 3000);
    return () => clearInterval(interval);
  }, [fetchAgentData]);

  // React Flow v13 state handlers
  const onNodesChange = useCallback(
    (changes) => setNodes((nds) => changes.applyTo(nds)),
    []
  );
  const onEdgesChange = useCallback(
    (changes) => setEdges((eds) => changes.applyTo(eds)),
    []
  );

  // Keyboard Backspace/Delete support for nodes and edges
  const onNodesDelete = useCallback(async (deleted) => {
    for (const node of deleted) {
      await fetch(`${API}/nodes/${node.id}`, { method: 'DELETE' });
    }
  }, []);

  const onEdgesDelete = useCallback(async (deleted) => {
    for (const edge of deleted) {
      await fetch(`${API}/edges/${edge.id}`, { method: 'DELETE' });
    }
  }, []);

  // Save node position when dropped
  const onNodeDragStop = useCallback(async (_, node) => {
    await fetch(`${API}/nodes/${node.id}/position`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pos_x: node.position.x, pos_y: node.position.y }),
    });
  }, []);

  // Save new edge when connected
  const onConnect = useCallback(
    async (params) => {
      if (!workspaceId) return;
      const res = await fetch(`${API}/edges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: workspaceId,
          source_id: params.source,
          target_id: params.target,
          label: 'relates_to',
        }),
      });
      const saved = await res.json();
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            id: saved.id,
            label: saved.label,
            style: { stroke: '#A8A29E', strokeWidth: 1.5 },
            ...EDGE_LABEL_PROPS,
          },
          eds
        )
      );
    },
    [workspaceId]
  );

  // Add a new node
  const addNode = async (type) => {
    if (!workspaceId) return;
    const title = prompt(`Enter ${type} title:`);
    if (!title) return;

    const pos_x = Math.floor(Math.random() * 400) + 50;
    const pos_y = Math.floor(Math.random() * 300) + 50;

    const res = await fetch(`${API}/nodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: workspaceId, type, title, pos_x, pos_y }),
    });
    const saved = await res.json();
    setNodes((nds) => [...nds, formatNode(saved)]);
  };

  // Approve or Reject a pending agent action (and refresh graph if experiment ran)
  const handleDecision = async (logId, decision) => {
    await fetch(`${API}/logs/${logId}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    });
    await refreshGraph(workspaceId);
    fetchAgentData();
  };

  // Workflow 1: Trigger Reader & Clusterer Agents via local Llama
  const runAnalyze = async () => {
    if (!workspaceId) return;
    setIsAnalyzing(true);
    try {
      const res = await fetch(`${API}/workspaces/${workspaceId}/agents/analyze`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
        return;
      }
      await refreshGraph(workspaceId);
      fetchAgentData();
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Workflow 2: Request approval to run SMOTE reproduction experiment
  const requestExperiment = async () => {
    if (!workspaceId) return;
    await fetch(`${API}/workspaces/${workspaceId}/agents/experiment/request`, {
      method: 'POST',
    });
    fetchAgentData();
  };

  // Workflow 3A: Ask "What If" and re-run
  const runWhatIf = async () => {
    if (!workspaceId) return;
    const question = prompt(
      'Ask a "What If" question:',
      'What if we use Random Forest with k=3?'
    );
    if (!question) return;

    await fetch(`${API}/workspaces/${workspaceId}/agents/what-if`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    await refreshGraph(workspaceId);
    fetchAgentData();
  };

  // Workflow 3B: Export workspace as Markdown report
  const exportWorkspace = async () => {
    if (!workspaceId) return;
    const res = await fetch(`${API}/workspaces/${workspaceId}/export`);
    const markdown = await res.text();
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'researchgraph-report.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusClass = (status) => {
    if (status === 'working') return 'rg-status-pill rg-status-working';
    if (status === 'waiting_approval') return 'rg-status-pill rg-status-waiting';
    return 'rg-status-pill rg-status-idle';
  };

  const getLogPillClass = (approvalStatus) => {
    if (approvalStatus === 'pending') return 'rg-log-pill rg-log-pill-pending';
    if (approvalStatus === 'approved') return 'rg-log-pill rg-log-pill-approved';
    if (approvalStatus === 'rejected') return 'rg-log-pill rg-log-pill-rejected';
    return 'rg-log-pill rg-log-pill-default';
  };

  return (
    <div className="rg-shell">
      {/* Top Bar */}
      <header className="rg-topbar">
        <div className="rg-topbar-group">
          <span className="rg-brand">ResearchGraph</span>
          <span className="rg-divider" aria-hidden="true" />
          <button
            type="button"
            className="rg-btn rg-btn-secondary"
            onClick={() => addNode('paper')}
          >
            <FileText size={16} strokeWidth={1.75} />
            <span>+ Paper</span>
          </button>
          <button
            type="button"
            className="rg-btn rg-btn-secondary"
            onClick={() => addNode('question')}
          >
            <HelpCircle size={16} strokeWidth={1.75} />
            <span>+ Question</span>
          </button>
          <button
            type="button"
            className="rg-btn rg-btn-secondary"
            onClick={() => addNode('note')}
          >
            <StickyNote size={16} strokeWidth={1.75} />
            <span>+ Note</span>
          </button>
        </div>

        <div className="rg-topbar-group">
          <button
            type="button"
            className="rg-btn rg-btn-accent"
            onClick={runAnalyze}
            disabled={isAnalyzing}
          >
            <Sparkles size={16} strokeWidth={1.75} />
            <span>{isAnalyzing ? 'Analyzing...' : 'Analyze & Cluster'}</span>
          </button>
          <button
            type="button"
            className="rg-btn rg-btn-accent"
            onClick={requestExperiment}
          >
            <FlaskConical size={16} strokeWidth={1.75} />
            <span>Run Reproduction</span>
          </button>
          <button
            type="button"
            className="rg-btn rg-btn-accent"
            onClick={runWhatIf}
          >
            <GitBranch size={16} strokeWidth={1.75} />
            <span>Ask &ldquo;What If&rdquo;</span>
          </button>
          <span className="rg-divider" aria-hidden="true" />
          <button
            type="button"
            className="rg-btn rg-btn-secondary"
            onClick={exportWorkspace}
          >
            <Download size={16} strokeWidth={1.75} />
            <span>Export MD</span>
          </button>
        </div>
      </header>

      {/* Main Content: Canvas + Agent Control Sidebar */}
      <div className="rg-main">
        {/* Interactive Canvas */}
        <div className="rg-canvas-wrap">
          <ReactFlow
            colorMode="light"
            nodeTypes={nodeTypes}
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodesDelete={onNodesDelete}
            onEdgesDelete={onEdgesDelete}
            onNodeDragStop={onNodeDragStop}
            onConnect={onConnect}
            fitView
          >
            <Background color="#D6D3CD" gap={20} size={1} />
            <Controls />
            <MiniMap
              position="bottom-right"
              pannable
              zoomable
              nodeColor={(node) => getNodeColor(node.data?.type)}
              maskColor="rgba(247, 245, 240, 0.72)"
            />
          </ReactFlow>
        </div>

        {/* Right-Hand Agent Control Sidebar (320px) */}
        <aside className="rg-sidebar">
          {/* 1. Agent Roster */}
          <section aria-label="Agent Team">
            <div className="rg-section-header">
              <h2 className="rg-section-title">Agent Team</h2>
              <span className="rg-section-count">{agents.length}</span>
            </div>
            <div className="rg-card-stack">
              {agents.map((a) => (
                <div key={a.id} className="rg-card">
                  <div className="rg-agent-top">
                    <span className="rg-agent-name">{a.name}</span>
                    <span className="rg-rating-pill">
                      <Star size={11} strokeWidth={2} fill="currentColor" aria-hidden="true" />
                      <span>{a.rating_score.toFixed(1)}</span>
                    </span>
                  </div>
                  <div className="rg-agent-meta">
                    <span>Role: {a.role}</span>
                    <span className={getStatusClass(a.status)}>
                      {a.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 2. Live Activity Feed & Human-in-the-Loop Controls */}
          <section aria-label="Live Activity Feed" style={{ flex: 1 }}>
            <div className="rg-section-header">
              <h2 className="rg-section-title">Live Activity Feed</h2>
              <span className="rg-section-count">{logs.length}</span>
            </div>
            {logs.length === 0 ? (
              <div className="rg-empty-state">No agent activity yet.</div>
            ) : (
              <div className="rg-card-stack">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className={`rg-card ${log.approval_status === 'pending' ? 'rg-card-pending' : ''}`}
                  >
                    <div className="rg-log-header">
                      <span className="rg-log-agent">{log.agent_name}</span>
                      <span className={getLogPillClass(log.approval_status)}>
                        {log.approval_status}
                      </span>
                    </div>
                    <div className="rg-log-action">{log.action}</div>
                    {log.reasoning && (
                      <div className="rg-log-reasoning">
                        Why: {log.reasoning}
                      </div>
                    )}

                    {/* Approve / Reject buttons when pending */}
                    {log.approval_status === 'pending' && (
                      <div className="rg-decision-row">
                        <button
                          type="button"
                          className="rg-decision-btn rg-decision-approve"
                          onClick={() => handleDecision(log.id, 'approved')}
                        >
                          <Check size={14} strokeWidth={2} />
                          <span>Approve</span>
                        </button>
                        <button
                          type="button"
                          className="rg-decision-btn rg-decision-reject"
                          onClick={() => handleDecision(log.id, 'rejected')}
                        >
                          <X size={14} strokeWidth={2} />
                          <span>Reject</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
