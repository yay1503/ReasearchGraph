import { useState, useEffect, useCallback, useMemo } from 'react';
import { flushSync } from 'react-dom';
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
  LayoutGrid,
  RotateCcw,
  Search,
  Moon,
  Sun,
  X,
  Check,
  CheckCircle2,
  Star,
  AlertCircle,
} from 'lucide-react';
import '@xyflow/react/dist/style.css';
import ResearchNode from './components/ResearchNode';
import ActionModal from './components/ActionModal';
import { getNodeColor, getNodeTypeStyle } from './nodeStyles';

const API = 'http://127.0.0.1:8000';

const nodeTypes = { research: ResearchNode };

const LAYOUT_GROUP_ORDER = [
  ['paper', 'question'],
  ['dataset', 'note'],
  ['experiment', 'error_fix'],
  ['result'],
];

function getInitialTheme() {
  try {
    return localStorage.getItem('rg_theme') === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function tryParseJsonObject(value) {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return Object.keys(value).length > 0 ? value : null;
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length > 0) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

function extractInspectorDetails(content, metadata) {
  const parsedContent = tryParseJsonObject(content);
  const parsedMetadata = tryParseJsonObject(metadata);

  if (parsedContent) {
    return { metrics: parsedContent, prose: '' };
  }

  return {
    metrics: parsedMetadata,
    prose: typeof content === 'string' ? content.trim() : '',
  };
}

export default function App() {
  const [workspaceId, setWorkspaceId] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [agents, setAgents] = useState([]);
  const [logs, setLogs] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRunningExperiment, setIsRunningExperiment] = useState(false);
  const [isRunningWhatIf, setIsRunningWhatIf] = useState(false);
  const [pendingLogId, setPendingLogId] = useState(null);
  const [isTidyingLayout, setIsTidyingLayout] = useState(false);
  const [isResettingDemo, setIsResettingDemo] = useState(false);
  const [rfInstance, setRfInstance] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState(null);
  const [modalMode, setModalMode] = useState(null);
  const [isModalSubmitting, setIsModalSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const [theme, setTheme] = useState(getInitialTheme);
  const [sidebarTab, setSidebarTab] = useState('activity');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('rg_theme', theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    const applyTheme = () => {
      document.documentElement.setAttribute('data-theme', nextTheme);
      try {
        localStorage.setItem('rg_theme', nextTheme);
      } catch {
        // ignore storage errors
      }
      flushSync(() => {
        setTheme(nextTheme);
      });
    };

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || prefersReducedMotion) {
      applyTheme();
      return;
    }

    const transition = document.startViewTransition(applyTheme);
    transition.ready.then(() => {
      const endRadius = Math.hypot(window.innerWidth, window.innerHeight);
      document.documentElement.animate(
        {
          clipPath: [
            'circle(0px at 0px 0px)',
            `circle(${endRadius}px at 0px 0px)`,
          ],
        },
        {
          duration: 750,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          pseudoElement: '::view-transition-new(root)',
        }
      );
    });
  };

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Delete a node from SQLite and remove it (+ its connected edges) from the canvas
  const deleteNode = useCallback(async (nodeId) => {
    await fetch(`${API}/nodes/${nodeId}`, { method: 'DELETE' });
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedNode((prev) => (prev?.id === nodeId ? null : prev));
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
      const formattedNodes = graph.nodes.map(formatNode);
      setNodes(formattedNodes);
      setSelectedNode((prev) =>
        prev ? formattedNodes.find((n) => n.id === prev.id) || null : null
      );
      setEdges(
        graph.edges.map((e) => ({
          id: e.id,
          source: e.source_id,
          target: e.target_id,
          label: e.label,
          data: { isAiSuggested: Boolean(e.is_ai_suggested) },
        }))
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
    setSelectedNode((prev) =>
      prev && deleted.some((node) => node.id === prev.id) ? null : prev
    );
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
            data: { isAiSuggested: false },
          },
          eds
        )
      );
    },
    [workspaceId]
  );

  // Submit handler for ActionModal (Add Paper/Question/Note or Ask "What If")
  const handleModalSubmit = async ({ title, content, question }) => {
    if (!workspaceId || !modalMode || isModalSubmitting) return;
    setIsModalSubmitting(true);
    if (modalMode === 'what_if') {
      setIsRunningWhatIf(true);
    }

    try {
      if (modalMode === 'what_if') {
        const res = await fetch(`${API}/workspaces/${workspaceId}/agents/what-if`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question }),
        });
        const data = await res.json();
        if (data?.error) {
          setToast({ message: data.error, type: 'error' });
          return;
        }
        await refreshGraph(workspaceId);
        await fetchAgentData();
      } else {
        const pos_x = Math.floor(Math.random() * 400) + 50;
        const pos_y = Math.floor(Math.random() * 300) + 50;

        const res = await fetch(`${API}/nodes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspace_id: workspaceId,
            type: modalMode,
            title,
            content: content || '',
            pos_x,
            pos_y,
          }),
        });
        const saved = await res.json();
        setNodes((nds) => [...nds, formatNode(saved)]);
      }
      setModalMode(null);
    } catch {
      setToast({ message: 'Request failed. Please ensure the backend server is running.', type: 'error' });
    } finally {
      setIsModalSubmitting(false);
      setIsRunningWhatIf(false);
    }
  };

  // Approve or Reject a pending agent action (and refresh graph if experiment ran)
  const handleDecision = async (logId, decision) => {
    if (pendingLogId !== null) return;
    setPendingLogId(logId);
    try {
      await fetch(`${API}/logs/${logId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      await refreshGraph(workspaceId);
      await fetchAgentData();
    } catch {
      setToast({ message: 'Failed to submit decision. Please try again.', type: 'error' });
    } finally {
      setPendingLogId(null);
    }
  };

  // Workflow 1: Trigger Reader & Clusterer Agents via local Llama
  const runAnalyze = async () => {
    if (!workspaceId || isAnalyzing) return;
    setIsAnalyzing(true);
    try {
      const res = await fetch(`${API}/workspaces/${workspaceId}/agents/analyze`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.error) {
        setToast({ message: data.error, type: 'error' });
        return;
      }
      await refreshGraph(workspaceId);
      await fetchAgentData();
    } catch {
      setToast({ message: 'Analyze request failed. Please check the backend connection.', type: 'error' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Workflow 2: Request approval to run SMOTE reproduction experiment
  const requestExperiment = async () => {
    if (!workspaceId || isRunningExperiment) return;
    setIsRunningExperiment(true);
    try {
      await fetch(`${API}/workspaces/${workspaceId}/agents/experiment/request`, {
        method: 'POST',
      });
      await fetchAgentData();
    } catch {
      setToast({ message: 'Failed to request reproduction experiment.', type: 'error' });
    } finally {
      setIsRunningExperiment(false);
    }
  };

  // Tidy / Auto-Layout existing nodes into clean non-overlapping rows by workflow stage
  const autoLayout = async () => {
    if (nodes.length === 0 || isTidyingLayout) return;
    setIsTidyingLayout(true);
    try {
      const buckets = [...LAYOUT_GROUP_ORDER.map(() => []), []];
      nodes.forEach((node) => {
        const t = node.data?.type || 'note';
        const groupIdx = LAYOUT_GROUP_ORDER.findIndex((types) => types.includes(t));
        buckets[groupIdx === -1 ? buckets.length - 1 : groupIdx].push(node);
      });

      const updates = [];
      let currentY = 80;
      const startX = 120;
      const colStep = 300;
      const rowStep = 180;
      const maxCols = 4;

      buckets.forEach((group) => {
        if (group.length === 0) return;
        group.forEach((node, idx) => {
          const col = idx % maxCols;
          const row = Math.floor(idx / maxCols);
          updates.push({
            id: node.id,
            pos_x: startX + col * colStep,
            pos_y: currentY + row * rowStep,
          });
        });
        const rowsUsed = Math.ceil(group.length / maxCols);
        currentY += rowsUsed * rowStep;
      });

      const posMap = new Map(updates.map((u) => [u.id, { x: u.pos_x, y: u.pos_y }]));
      setNodes((nds) =>
        nds.map((node) => {
          const nextPos = posMap.get(node.id);
          return nextPos ? { ...node, position: nextPos } : node;
        })
      );

      await Promise.all(
        updates.map((u) =>
          fetch(`${API}/nodes/${u.id}/position`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pos_x: u.pos_x, pos_y: u.pos_y }),
          })
        )
      );

      rfInstance?.fitView({ padding: 0.2, duration: 250 });
    } catch {
      setToast({ message: 'Failed to save auto-layout positions.', type: 'error' });
    } finally {
      setIsTidyingLayout(false);
    }
  };

  // 1-Click "New Demo" reset
  const resetDemo = async () => {
    if (isResettingDemo) return;
    setIsResettingDemo(true);
    try {
      const wsRes = await fetch(`${API}/workspaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'SMOTE Research Workspace' }),
      });
      const ws = await wsRes.json();
      const newWsId = ws.id;
      localStorage.setItem('rg_workspace_id', newWsId);

      await Promise.all([
        fetch(`${API}/nodes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspace_id: newWsId,
            type: 'paper',
            title: 'SMOTE: Synthetic Minority Over-sampling Technique',
            content: '',
            pos_x: 120,
            pos_y: 120,
          }),
        }),
        fetch(`${API}/nodes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspace_id: newWsId,
            type: 'question',
            title: 'Does SMOTE beat class-weighted Decision Trees on Pima Diabetes?',
            content: '',
            pos_x: 460,
            pos_y: 120,
          }),
        }),
      ]);

      setSelectedNode(null);
      setSearchQuery('');
      setSidebarTab('activity');
      setWorkspaceId(newWsId);

      const [agentsRes, logsRes] = await Promise.all([
        fetch(`${API}/agents`),
        fetch(`${API}/workspaces/${newWsId}/logs`),
      ]);
      setAgents(await agentsRes.json());
      setLogs(await logsRes.json());
      await refreshGraph(newWsId);

      rfInstance?.fitView({ padding: 0.25, duration: 250 });
      setToast({ message: 'Fresh SMOTE demo workspace ready', type: 'success' });
    } catch {
      setToast({ message: 'Failed to reset demo workspace.', type: 'error' });
    } finally {
      setIsResettingDemo(false);
    }
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

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const displayedNodes = useMemo(() => {
    if (!normalizedQuery) return nodes;
    return nodes.map((node) => {
      const title = (node.data?.title || '').toLowerCase();
      const type = (node.data?.type || '').toLowerCase();
      const content = (node.data?.content || '').toLowerCase();
      const matches =
        title.includes(normalizedQuery) ||
        type.includes(normalizedQuery) ||
        content.includes(normalizedQuery);
      return {
        ...node,
        className: matches ? 'rg-node-match' : undefined,
        style: {
          ...node.style,
          opacity: matches ? 1 : 0.25,
          transition: 'opacity 150ms ease',
        },
      };
    });
  }, [nodes, normalizedQuery]);

  const displayedEdges = useMemo(() => {
    const isDark = theme === 'dark';
    const labelProps = {
      labelBgStyle: {
        fill: isDark ? '#121215' : '#FFFFFF',
        stroke: isDark ? '#27272A' : '#E5E0D8',
        strokeWidth: 1,
      },
      labelBgPadding: [6, 4],
      labelBgBorderRadius: 999,
      labelStyle: {
        fontFamily: 'JetBrains Mono',
        fontSize: 11,
        fill: isDark ? '#D4D4D8' : '#44403C',
      },
    };
    return edges.map((edge) => {
      const isAi = Boolean(edge.data?.isAiSuggested);
      return {
        ...edge,
        animated: isAi,
        style: {
          stroke: isAi
            ? isDark
              ? '#71717A'
              : '#78716C'
            : isDark
              ? '#52525B'
              : '#A8A29E',
          strokeWidth: 1.5,
          ...(isAi ? { strokeDasharray: '5 5' } : {}),
        },
        ...labelProps,
      };
    });
  }, [edges, theme]);

  const hasPendingApproval = useMemo(
    () => logs.some((log) => log.approval_status === 'pending'),
    [logs]
  );

  const inspectorType = selectedNode?.data?.type || 'note';
  const inspectorStyle = selectedNode ? getNodeTypeStyle(inspectorType) : null;
  const inspectorDetails = selectedNode
    ? extractInspectorDetails(selectedNode.data?.content, selectedNode.data?.metadata)
    : null;

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
            onClick={() => setModalMode('paper')}
          >
            <FileText size={15} strokeWidth={1.75} />
            <span>+ Paper</span>
          </button>
          <button
            type="button"
            className="rg-btn rg-btn-secondary"
            onClick={() => setModalMode('question')}
          >
            <HelpCircle size={15} strokeWidth={1.75} />
            <span>+ Question</span>
          </button>
          <button
            type="button"
            className="rg-btn rg-btn-secondary"
            onClick={() => setModalMode('note')}
          >
            <StickyNote size={15} strokeWidth={1.75} />
            <span>+ Note</span>
          </button>
          <span className="rg-divider" aria-hidden="true" />
          <div className="rg-search-wrap">
            <Search size={14} strokeWidth={1.75} className="rg-search-icon" aria-hidden="true" />
            <input
              type="text"
              className="rg-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search nodes..."
              aria-label="Search nodes"
            />
            {searchQuery && (
              <button
                type="button"
                className="rg-search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                title="Clear search"
              >
                <X size={13} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>

        <div className="rg-topbar-group">
          <button
            type="button"
            className="rg-btn rg-btn-accent"
            onClick={runAnalyze}
            disabled={isAnalyzing}
          >
            <Sparkles size={15} strokeWidth={1.75} />
            <span>{isAnalyzing ? 'Analyzing...' : 'Analyze & Cluster'}</span>
          </button>
          <button
            type="button"
            className="rg-btn rg-btn-accent"
            onClick={requestExperiment}
            disabled={isRunningExperiment}
          >
            <FlaskConical size={15} strokeWidth={1.75} />
            <span>{isRunningExperiment ? 'Requesting...' : 'Run Reproduction'}</span>
          </button>
          <button
            type="button"
            className="rg-btn rg-btn-accent"
            onClick={() => setModalMode('what_if')}
            disabled={isRunningWhatIf}
          >
            <GitBranch size={15} strokeWidth={1.75} />
            <span>{isRunningWhatIf ? 'Running...' : 'Ask "What If"'}</span>
          </button>
          <span className="rg-divider" aria-hidden="true" />
          <button
            type="button"
            className="rg-btn rg-btn-secondary"
            onClick={autoLayout}
            disabled={nodes.length === 0 || isTidyingLayout}
            title="Arrange nodes in clean non-overlapping rows"
          >
            <LayoutGrid size={15} strokeWidth={1.75} />
            <span>Auto-Layout</span>
          </button>
          <button
            type="button"
            className="rg-btn rg-btn-secondary"
            onClick={resetDemo}
            disabled={isResettingDemo}
            title="Create a fresh SMOTE demo workspace"
          >
            <RotateCcw size={15} strokeWidth={1.75} />
            <span>{isResettingDemo ? 'Resetting...' : 'Reset Demo'}</span>
          </button>
          <button
            type="button"
            className="rg-btn rg-btn-secondary"
            onClick={exportWorkspace}
          >
            <Download size={15} strokeWidth={1.75} />
            <span>Export MD</span>
          </button>
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

      {/* Main Content: Canvas + Agent Control Sidebar */}
      <div className="rg-main">
        {/* Interactive Canvas */}
        <div className="rg-canvas-wrap">
          <ReactFlow
            colorMode={theme}
            nodeTypes={nodeTypes}
            nodes={displayedNodes}
            edges={displayedEdges}
            onInit={setRfInstance}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodesDelete={onNodesDelete}
            onEdgesDelete={onEdgesDelete}
            onNodeDragStop={onNodeDragStop}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedNode(node)}
            onPaneClick={() => setSelectedNode(null)}
            fitView
          >
            <Background
              color={theme === 'dark' ? '#27272A' : '#D6D3CD'}
              gap={20}
              size={1}
            />
            <Controls />
            <MiniMap
              position="bottom-right"
              pannable
              zoomable
              nodeColor={(node) => getNodeColor(node.data?.type, theme)}
              maskColor={theme === 'dark' ? 'rgba(9, 9, 11, 0.72)' : 'rgba(247, 245, 240, 0.72)'}
            />
          </ReactFlow>

          {/* Click-to-Inspect Detail Card */}
          {selectedNode && inspectorStyle && inspectorDetails && (
            <div
              className="rg-inspector-card"
              role="region"
              aria-label="Node Inspector"
              style={{
                borderLeft: `3px solid ${
                  inspectorType === 'note' ? 'var(--node-note-accent)' : inspectorStyle.accent
                }`,
              }}
            >
              <div className="rg-inspector-header">
                <span className="rg-node-badge" data-node-type={inspectorType}>
                  {inspectorType}
                </span>
                <button
                  type="button"
                  className="rg-inspector-close"
                  onClick={() => setSelectedNode(null)}
                  aria-label="Close detail card"
                  title="Close"
                >
                  <X size={14} strokeWidth={2} />
                </button>
              </div>

              <h3 className="rg-inspector-title">{selectedNode.data?.title}</h3>

              <div className="rg-inspector-body">
                {inspectorDetails.prose && (
                  <p className="rg-inspector-prose">{inspectorDetails.prose}</p>
                )}

                {inspectorDetails.metrics && (
                  <div
                    className="rg-metric-grid"
                    style={inspectorDetails.prose ? { marginTop: '10px' } : undefined}
                  >
                    {Object.entries(inspectorDetails.metrics).map(([key, val]) => (
                      <div key={key} className="rg-metric-pill">
                        <span className="rg-metric-key">{key}</span>
                        <span className="rg-metric-val">
                          {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {!inspectorDetails.prose && !inspectorDetails.metrics && (
                  <p className="rg-inspector-empty">No content or metrics recorded.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right-Hand Agent Control Sidebar (320px) */}
        <aside className="rg-sidebar">
          <div className="rg-sidebar-tabs-header">
            <div className="rg-segmented-tabs" role="tablist" aria-label="Sidebar Views">
              <button
                type="button"
                role="tab"
                aria-selected={sidebarTab === 'activity'}
                className={`rg-tab-btn ${sidebarTab === 'activity' ? 'is-active' : ''}`}
                onClick={() => setSidebarTab('activity')}
              >
                {hasPendingApproval && (
                  <span className="rg-pending-dot" title="Pending approval" />
                )}
                <span>Activity</span>
                <span className="rg-tab-count">({logs.length})</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sidebarTab === 'agents'}
                className={`rg-tab-btn ${sidebarTab === 'agents' ? 'is-active' : ''}`}
                onClick={() => setSidebarTab('agents')}
              >
                <span>Agents</span>
                <span className="rg-tab-count">({agents.length})</span>
              </button>
            </div>
          </div>

          <div className="rg-sidebar-scroll">
            {sidebarTab === 'activity' ? (
              <section aria-label="Live Activity Feed" role="tabpanel">
                {logs.length === 0 ? (
                  <div className="rg-empty-state">No agent activity yet.</div>
                ) : (
                  <div className="rg-card-stack">
                    {logs.map((log) => {
                      const isDecisionBusy = pendingLogId !== null;
                      const isThisLogPending = pendingLogId === log.id;
                      return (
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
                                disabled={isDecisionBusy}
                                onClick={() => handleDecision(log.id, 'approved')}
                              >
                                <Check size={14} strokeWidth={2} />
                                <span>{isThisLogPending ? 'Running...' : 'Approve'}</span>
                              </button>
                              <button
                                type="button"
                                className="rg-decision-btn rg-decision-reject"
                                disabled={isDecisionBusy}
                                onClick={() => handleDecision(log.id, 'rejected')}
                              >
                                <X size={14} strokeWidth={2} />
                                <span>Reject</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            ) : (
              <section aria-label="Agent Team" role="tabpanel">
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
            )}
          </div>
        </aside>
      </div>

      {/* Custom Editorial Modal */}
      {modalMode && (
        <ActionModal
          key={modalMode}
          mode={modalMode}
          onClose={() => {
            if (!isModalSubmitting) setModalMode(null);
          }}
          onSubmit={handleModalSubmit}
          isSubmitting={isModalSubmitting}
        />
      )}

      {/* Subtle Bottom-Center Toast */}
      {toast && (
        <div className="rg-toast-wrap" role="status" aria-live="polite">
          <div className={`rg-toast ${toast.type === 'success' ? 'is-success' : ''}`}>
            {toast.type === 'success' ? (
              <CheckCircle2 size={16} strokeWidth={2} className="rg-toast-icon" aria-hidden="true" />
            ) : (
              <AlertCircle size={16} strokeWidth={2} className="rg-toast-icon" aria-hidden="true" />
            )}
            <span className="rg-toast-msg">{toast.message}</span>
            <button
              type="button"
              className="rg-inspector-close"
              onClick={() => setToast(null)}
              aria-label="Dismiss notification"
            >
              <X size={13} strokeWidth={2} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
