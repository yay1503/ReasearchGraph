import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MarkerType,
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
  ArrowLeft,
  Cpu,
  X,
  Check,
  CheckCircle2,
  Star,
  AlertCircle,
  Bot,
  ChevronDown,
  ExternalLink,
  FolderPlus,
  Hand,
  List,
  MessageSquare,
  Minus,
  MoreHorizontal,
  MousePointer2,
  Plus,
  Tag,
  ThumbsDown,
  ThumbsUp,
  History,
  Lightbulb,
  Pause,
  Play,
  Share2,
  Terminal,
  Code2,
  WifiOff,
} from 'lucide-react';
import '@xyflow/react/dist/style.css';
import ResearchNode from '../components/ResearchNode';
import ActionModal from '../components/ActionModal';
import EngineModal from '../components/EngineModal';
import SandboxIDE from '../components/SandboxIDE';
import { getNodeColor, getNodeTypeStyle } from '../nodeStyles';
import { PROVIDERS, getLLMConfig, getLLMHeaders } from '../utils/llmConfig';
import { getStoredAuth } from '../utils/auth';
import { useTheme } from '../utils/theme';

const API = import.meta.env.VITE_API_URL || '/api';

const nodeTypes = { research: ResearchNode };

const LAYOUT_GROUP_ORDER = [
  ['paper', 'question'],
  ['dataset', 'note'],
  ['experiment', 'error_fix'],
  ['result'],
];

function getOptionalAuthHeaders() {
  try {
    const token = localStorage.getItem('rg_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
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

function tryParseJsonArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function extractInspectorDetails(content, metadata) {
  const parsedContent = tryParseJsonObject(content);
  const parsedMetadata = tryParseJsonObject(metadata);

  if (parsedContent) {
    return { metrics: parsedContent, prose: '', comments: parsedMetadata?.comments || [] };
  }

  const displayMeta = parsedMetadata ? { ...parsedMetadata } : null;
  const comments = Array.isArray(displayMeta?.comments) ? displayMeta.comments : [];
  if (displayMeta && 'comments' in displayMeta) {
    delete displayMeta.comments;
  }

  return {
    metrics: displayMeta && Object.keys(displayMeta).length > 0 ? displayMeta : null,
    prose: typeof content === 'string' ? content.trim() : '',
    comments,
  };
}

export default function WorkspaceCanvas() {
  const { id: routeWorkspaceId } = useParams();
  const { theme, toggleTheme } = useTheme();

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
  const [viewMode, setViewMode] = useState('graph');
  const [topicFilter, setTopicFilter] = useState('');
  const [canvasTool, setCanvasTool] = useState('select');
  const [zoomPercent, setZoomPercent] = useState(100);
  const [newTagInput, setNewTagInput] = useState('');
  const [newCommentInput, setNewCommentInput] = useState('');
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentRole, setNewAgentRole] = useState('');
  const [selectedNode, setSelectedNode] = useState(null);
  const [modalMode, setModalMode] = useState(null);
  const [isModalSubmitting, setIsModalSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const [sidebarTab, setSidebarTab] = useState('activity');
  const [llmConfig, setLlmConfig] = useState(getLLMConfig);
  const [isEngineModalOpen, setIsEngineModalOpen] = useState(false);
  const [isSandboxOpen, setIsSandboxOpen] = useState(false);
  const [liveCursors, setLiveCursors] = useState({});
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [nextSuggestions, setNextSuggestions] = useState(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [timelineData, setTimelineData] = useState(null);
  const [timelineStep, setTimelineStep] = useState(0);
  const [isPlayingTimeline, setIsPlayingTimeline] = useState(false);
  const [redirectLogId, setRedirectLogId] = useState(null);
  const [redirectFeedback, setRedirectFeedback] = useState('');
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [shareMeta, setShareMeta] = useState(null);
  const [isRefreshingShare, setIsRefreshingShare] = useState(false);
  const [openTopMenu, setOpenTopMenu] = useState(null);

  useEffect(() => {
    if (!openTopMenu) return undefined;
    const handlePointerDown = (e) => {
      if (!e.target.closest('.rg-topbar-dropdown')) {
        setOpenTopMenu(null);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setOpenTopMenu(null);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openTopMenu]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  const queueOfflineMutation = useCallback((wsId, mutation) => {
    if (!wsId) return;
    const key = `rg_offline_queue_${wsId}`;
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    const next = [...existing, mutation];
    localStorage.setItem(key, JSON.stringify(next));
    setOfflineQueueCount(next.length);
  }, []);

  // Delete a node from PostgreSQL (or queue offline) and remove from canvas
  const deleteNode = useCallback(
    async (nodeId) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setSelectedNode((prev) => (prev?.id === nodeId ? null : prev));
      try {
        if (!navigator.onLine) throw new Error('offline');
        await fetch(`${API}/nodes/${nodeId}`, { method: 'DELETE' });
      } catch {
        if (workspaceId && !String(nodeId).startsWith('offline_')) {
          queueOfflineMutation(workspaceId, { op: 'delete_node', nodeId });
        }
      }
    },
    [workspaceId, queueOfflineMutation]
  );

  // Helper to format a DB node into a custom ResearchNode
  const formatNode = useCallback(
    (n) => {
      const metaObj = tryParseJsonObject(n.metadata_json) || {};
      const comments = Array.isArray(metaObj.comments) ? metaObj.comments : [];
      return {
        id: n.id,
        type: 'research',
        position: { x: n.pos_x, y: n.pos_y },
        data: {
          type: n.type,
          title: n.title,
          url: n.url || '',
          content: n.content,
          metadata: n.metadata_json,
          tags: tryParseJsonArray(n.tags_json),
          groupId: n.group_id || '',
          commentsCount: comments.length,
          onDelete: deleteNode,
        },
      };
    },
    [deleteNode]
  );

  // Helper to reload nodes and edges from DB (with offline cache fallback)
  const refreshGraph = useCallback(
    async (wsId) => {
      if (!wsId) return;
      try {
        const graphRes = await fetch(`${API}/workspaces/${wsId}/graph`);
        if (!graphRes.ok) throw new Error('Network error');
        const graph = await graphRes.json();
        localStorage.setItem(`rg_offline_cache_${wsId}`, JSON.stringify(graph));
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
      } catch {
        const cached = localStorage.getItem(`rg_offline_cache_${wsId}`);
        if (cached) {
          const graph = JSON.parse(cached);
          setNodes((graph.nodes || []).map(formatNode));
          setEdges(
            (graph.edges || []).map((e) => ({
              id: e.id,
              source: e.source_id,
              target: e.target_id,
              label: e.label,
              data: { isAiSuggested: Boolean(e.is_ai_suggested) },
            }))
          );
        }
      }
    },
    [formatNode]
  );

  // Offline-first listener & automatic mutation queue sync on reconnect
  useEffect(() => {
    if (workspaceId) {
      const existing = JSON.parse(localStorage.getItem(`rg_offline_queue_${workspaceId}`) || '[]');
      setOfflineQueueCount(existing.length);
    }

    const flushOfflineQueue = async (wsId) => {
      const key = `rg_offline_queue_${wsId}`;
      const queue = JSON.parse(localStorage.getItem(key) || '[]');
      if (queue.length === 0) return;
      for (const item of queue) {
        try {
          if (item.op === 'create_node') {
            await fetch(`${API}/nodes`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(item.payload),
            });
          } else if (item.op === 'patch_node') {
            await fetch(`${API}/nodes/${item.nodeId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(item.payload),
            });
          } else if (item.op === 'delete_node') {
            await fetch(`${API}/nodes/${item.nodeId}`, { method: 'DELETE' });
          }
        } catch {
          // Keep going for remaining items
        }
      }
      localStorage.removeItem(key);
      setOfflineQueueCount(0);
      setToast({ message: `Synced ${queue.length} offline edit(s) to server.`, type: 'success' });
    };

    const goOffline = () => setIsOffline(true);
    const goOnline = async () => {
      setIsOffline(false);
      if (workspaceId) {
        await flushOfflineQueue(workspaceId);
        await refreshGraph(workspaceId);
      }
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, [workspaceId, refreshGraph]);

  // 1. Load or create workspace + graph
  useEffect(() => {
    async function init() {
      let wsId = routeWorkspaceId || localStorage.getItem('rg_workspace_id');
      if (!wsId) {
        const wsRes = await fetch(`${API}/workspaces`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getOptionalAuthHeaders() },
          body: JSON.stringify({ name: 'SMOTE Research Workspace' }),
        });
        const ws = await wsRes.json();
        wsId = ws.id;
      }
      localStorage.setItem('rg_workspace_id', wsId);
      setWorkspaceId(wsId);
      await refreshGraph(wsId);
    }
    init();
  }, [routeWorkspaceId, refreshGraph]);

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

  // WebSocket live stream for real-time Stitch-style agent cursors & graph updates
  useEffect(() => {
    if (!workspaceId) return undefined;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/${workspaceId}`);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.event === 'cursor_move' && msg.agent_id) {
          setLiveCursors((prev) => ({
            ...prev,
            [msg.agent_id]: {
              agent_name: msg.agent_name || 'Agent',
              x: Number(msg.x || 180),
              y: Number(msg.y || 160),
              label: msg.label || 'Working...',
              ts: Date.now(),
            },
          }));
        } else if (msg.event === 'graph_updated') {
          refreshGraph(workspaceId);
          fetchAgentData();
        }
      } catch {
        // Ignore malformed WS frames
      }
    };
    const cleanup = setInterval(() => {
      const now = Date.now();
      setLiveCursors((prev) => {
        const next = {};
        let changed = false;
        Object.entries(prev).forEach(([k, v]) => {
          if (now - v.ts < 5500) {
            next[k] = v;
          } else {
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 1500);
    return () => {
      clearInterval(cleanup);
      ws.close();
    };
  }, [workspaceId, refreshGraph, fetchAgentData]);

  // Auto-advance Replayable Evolution Timeline
  useEffect(() => {
    if (!isPlayingTimeline || !timelineData) return undefined;
    const maxSteps = timelineData.nodes?.length || 0;
    if (timelineStep >= maxSteps) {
      setIsPlayingTimeline(false);
      return undefined;
    }
    const timer = setTimeout(() => setTimelineStep((s) => s + 1), 750);
    return () => clearTimeout(timer);
  }, [isPlayingTimeline, timelineStep, timelineData]);

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

  // Submit handler for ActionModal (Add Paper/Question/Note/Group, Ask "What If", or AI Harness)
  const handleModalSubmit = async ({ title, url, content, tags, question, goal, autoApprove }) => {
    if (!workspaceId || !modalMode || isModalSubmitting) return;
    setIsModalSubmitting(true);
    if (modalMode === 'what_if') {
      setIsRunningWhatIf(true);
    }

    try {
      if (modalMode === 'what_if') {
        const res = await fetch(`${API}/workspaces/${workspaceId}/agents/what-if`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getLLMHeaders() },
          body: JSON.stringify({ question }),
        });
        const data = await res.json();
        if (data?.error) {
          setToast({ message: data.error, type: 'error' });
          return;
        }
        await refreshGraph(workspaceId);
        await fetchAgentData();
      } else if (modalMode === 'harness') {
        const res = await fetch(`${API}/workspaces/${workspaceId}/agents/dispatch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getLLMHeaders() },
          body: JSON.stringify({ goal, auto_approve: Boolean(autoApprove) }),
        });
        const data = await res.json();
        if (data?.error) {
          setToast({ message: data.error, type: 'error' });
          return;
        }
        await refreshGraph(workspaceId);
        await fetchAgentData();
        setSidebarTab('activity');
        const chosenName = data.controller?.chosen_agent?.name || 'Harness Agent';
        setToast({
          message: autoApprove
            ? `${chosenName} executed ${data.executed?.length || 0} action(s) (${data.internet_calls || 0} web calls).`
            : `${chosenName} proposed ${data.proposed_count || 0} action(s) for review.`,
          type: 'success',
        });
      } else if (modalMode === 'sandbox') {
        const res = await fetch(`${API}/workspaces/${workspaceId}/agents/experiment/sandbox`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getLLMHeaders() },
          body: JSON.stringify({ goal }),
        });
        const data = await res.json();
        if (data?.error) {
          setToast({ message: data.error, type: 'error' });
          return;
        }
        await refreshGraph(workspaceId);
        await fetchAgentData();
        setToast({
          message: `Sandbox run finished (consulted ${data.memory_consulted || 0} memory records).`,
          type: 'success',
        });
      } else {
        const pos_x = Math.floor(Math.random() * 400) + 50;
        const pos_y = Math.floor(Math.random() * 300) + 50;
        const nodePayload = {
          workspace_id: workspaceId,
          type: modalMode,
          title,
          url: url || '',
          content: content || '',
          tags_json: JSON.stringify(Array.isArray(tags) ? tags : []),
          pos_x,
          pos_y,
        };

        try {
          if (!navigator.onLine) throw new Error('offline');
          const res = await fetch(`${API}/nodes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(nodePayload),
          });
          if (!res.ok) throw new Error('Failed');
          const saved = await res.json();
          setNodes((nds) => [...nds, formatNode(saved)]);
        } catch {
          const tempId = `offline_${Date.now()}`;
          setNodes((nds) => [...nds, formatNode({ id: tempId, ...nodePayload })]);
          queueOfflineMutation(workspaceId, { op: 'create_node', payload: nodePayload });
          setToast({ message: 'Saved node offline — will sync when online.', type: 'success' });
        }
      }
      setModalMode(null);
    } catch {
      setToast({ message: 'Request failed. Please ensure the backend server is running.', type: 'error' });
    } finally {
      setIsModalSubmitting(false);
      setIsRunningWhatIf(false);
    }
  };

  // Update node tags, group_id, or metadata comments via PATCH /nodes/{id} (with offline queue)
  const patchNode = async (nodeId, payload) => {
    try {
      if (!navigator.onLine) throw new Error('offline');
      const res = await fetch(`${API}/nodes/${nodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Update failed');
      const updated = await res.json();
      const formatted = formatNode(updated);
      setNodes((nds) => nds.map((n) => (n.id === nodeId ? formatted : n)));
      setSelectedNode((prev) => (prev?.id === nodeId ? formatted : prev));
    } catch {
      if (!navigator.onLine && workspaceId) {
        queueOfflineMutation(workspaceId, { op: 'patch_node', nodeId, payload });
        setNodes((nds) =>
          nds.map((n) => {
            if (n.id !== nodeId) return n;
            const nextMeta = payload.metadata_json ?? n.data.metadata;
            const metaObj = tryParseJsonObject(nextMeta) || {};
            return {
              ...n,
              data: {
                ...n.data,
                tags: payload.tags_json ? tryParseJsonArray(payload.tags_json) : n.data.tags,
                groupId: 'group_id' in payload ? payload.group_id || '' : n.data.groupId,
                metadata: nextMeta,
                commentsCount: Array.isArray(metaObj.comments) ? metaObj.comments.length : n.data.commentsCount,
              },
            };
          })
        );
        setToast({ message: 'Update queued offline.', type: 'success' });
      } else {
        setToast({ message: 'Failed to update node.', type: 'error' });
      }
    }
  };

  const handleAddTag = async (e) => {
    e.preventDefault();
    if (!selectedNode) return;
    const tag = newTagInput.trim().replace(/^#/, '');
    if (!tag) return;
    const existing = selectedNode.data?.tags || [];
    if (existing.includes(tag)) {
      setNewTagInput('');
      return;
    }
    setNewTagInput('');
    await patchNode(selectedNode.id, { tags_json: JSON.stringify([...existing, tag]) });
  };

  const handleRemoveTag = async (tagToRemove) => {
    if (!selectedNode) return;
    const nextTags = (selectedNode.data?.tags || []).filter((t) => t !== tagToRemove);
    await patchNode(selectedNode.id, { tags_json: JSON.stringify(nextTags) });
  };

  const handleGroupChange = async (nextGroupId) => {
    if (!selectedNode) return;
    await patchNode(selectedNode.id, { group_id: nextGroupId || null });
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!selectedNode) return;
    const text = newCommentInput.trim();
    if (!text) return;
    const existingMeta = tryParseJsonObject(selectedNode.data?.metadata) || {};
    const existingComments = Array.isArray(existingMeta.comments) ? existingMeta.comments : [];
    const nextMeta = {
      ...existingMeta,
      comments: [
        ...existingComments,
        {
          id: `${Date.now()}`,
          text,
          createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ],
    };
    setNewCommentInput('');
    await patchNode(selectedNode.id, { metadata_json: JSON.stringify(nextMeta) });
  };

  const handleSpawnAgent = async (e) => {
    e.preventDefault();
    if (!newAgentName.trim() || !newAgentRole.trim()) return;
    try {
      const res = await fetch(`${API}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newAgentName.trim(), role: newAgentRole.trim() }),
      });
      if (!res.ok) throw new Error('Spawn failed');
      setNewAgentName('');
      setNewAgentRole('');
      await fetchAgentData();
      setToast({ message: 'Specialist agent spawned.', type: 'success' });
    } catch {
      setToast({ message: 'Could not spawn specialist agent.', type: 'error' });
    }
  };

  const handleRateAgent = async (agentId, delta) => {
    try {
      const res = await fetch(`${API}/agents/${agentId}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta }),
      });
      const data = await res.json();
      await fetchAgentData();
      if (data.auto_retired) {
        setToast({
          message: `${data.name} dropped below 0.6 and was automatically retired.`,
          type: 'error',
        });
      }
    } catch {
      setToast({ message: 'Failed to rate agent.', type: 'error' });
    }
  };

  const handleToggleAgentActive = async (agent) => {
    const endpoint = agent.is_active ? 'retire' : 'reactivate';
    try {
      await fetch(`${API}/agents/${agent.id}/${endpoint}`, { method: 'PATCH' });
      await fetchAgentData();
    } catch {
      setToast({ message: 'Failed to update agent status.', type: 'error' });
    }
  };

  const handlePauseResumeAgent = async (agent) => {
    const endpoint = agent.status === 'paused' ? 'resume' : 'pause';
    try {
      await fetch(`${API}/agents/${agent.id}/${endpoint}`, { method: 'POST' });
      await fetchAgentData();
    } catch {
      setToast({ message: 'Failed to pause/resume agent.', type: 'error' });
    }
  };

  const handleShareWorkspace = async (refresh = false) => {
    if (!workspaceId) return;
    if (refresh) setIsRefreshingShare(true);
    try {
      const token = localStorage.getItem('rg_token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const shareRes = await fetch(`${API}/workspaces/${workspaceId}/share`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ role: 'snapshot', refresh: Boolean(refresh) }),
      });
      if (!shareRes.ok) throw new Error('Share failed');
      const data = await shareRes.json();
      const url = `${window.location.origin}/share/${data.share_token}`;
      setShareUrl(url);
      setShareMeta({
        nodeCount: data.snapshot_node_count ?? nodes.length,
        logCount: data.snapshot_log_count ?? logs.length,
        createdAt: data.created_at,
      });
      setIsShareOpen(true);
      await navigator.clipboard?.writeText(url).catch(() => {});
      if (refresh) {
        setToast({ message: 'Created a fresh snapshot link and copied it!', type: 'success' });
      }
    } catch {
      setToast({ message: 'Could not create share snapshot.', type: 'error' });
    } finally {
      if (refresh) setIsRefreshingShare(false);
    }
  };

  const handleSuggestNext = async () => {
    if (!workspaceId || isSuggesting) return;
    setIsSuggesting(true);
    try {
      const res = await fetch(`${API}/workspaces/${workspaceId}/agents/suggest-next`, {
        method: 'POST',
        headers: { ...getLLMHeaders() },
      });
      const data = await res.json();
      setNextSuggestions(data);
    } catch {
      setToast({ message: 'Failed to suggest next experiments.', type: 'error' });
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleOpenTimeline = async () => {
    if (!workspaceId) return;
    try {
      const res = await fetch(`${API}/workspaces/${workspaceId}/timeline`);
      const data = await res.json();
      setTimelineData(data);
      setTimelineStep(data.nodes?.length || 0);
      setIsPlayingTimeline(false);
    } catch {
      setToast({ message: 'Failed to load evolution timeline.', type: 'error' });
    }
  };

  const focusNodeOnCanvas = (node) => {
    setViewMode('graph');
    setSelectedNode(node);
    if (rfInstance) {
      rfInstance.setCenter(node.position.x + 110, node.position.y + 50, {
        zoom: 1.15,
        duration: 350,
      });
    }
  };

  // Approve, Reject, or Redirect a pending agent action
  const handleDecision = async (logId, decision, feedback = '') => {
    if (pendingLogId !== null) return;
    setPendingLogId(logId);
    try {
      await fetch(`${API}/logs/${logId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getLLMHeaders() },
        body: JSON.stringify({ decision, feedback }),
      });
      setRedirectLogId(null);
      setRedirectFeedback('');
      await refreshGraph(workspaceId);
      await fetchAgentData();
    } catch {
      setToast({ message: 'Failed to submit decision. Please try again.', type: 'error' });
    } finally {
      setPendingLogId(null);
    }
  };

  // Workflow 1: Trigger Reader & Clusterer Agents via configured LLM
  const runAnalyze = async () => {
    if (!workspaceId || isAnalyzing) return;
    setIsAnalyzing(true);
    try {
      const res = await fetch(`${API}/workspaces/${workspaceId}/agents/analyze`, {
        method: 'POST',
        headers: { ...getLLMHeaders() },
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
        headers: { ...getLLMHeaders() },
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
        headers: { 'Content-Type': 'application/json', ...getOptionalAuthHeaders() },
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

  const groupNodes = useMemo(
    () => nodes.filter((n) => n.data?.type === 'group'),
    [nodes]
  );

  const paperNodes = useMemo(
    () => nodes.filter((n) => n.data?.type === 'paper'),
    [nodes]
  );

  const handleLogSandboxResult = useCallback(
    async ({ file, entryFile, stdout, stderr, exitCode, exit_code, duration_ms }) => {
      if (!workspaceId) return;
      const scriptName = file || entryFile || 'main.py';
      const codeStatus = exitCode ?? exit_code ?? 0;
      const trimmedStdout = (stdout || '').trim().slice(0, 1200);
      const trimmedStderr = (stderr || '').trim().slice(0, 400);
      const durationNote =
        typeof duration_ms === 'number' ? ` · ${duration_ms}ms` : '';

      const contentParts = [
        `Script: ${scriptName} (exit code ${codeStatus}${durationNote})`,
        trimmedStdout ? `\nStdout:\n${trimmedStdout}` : '',
        !trimmedStdout && trimmedStderr ? `\nStderr:\n${trimmedStderr}` : '',
      ].filter(Boolean);

      const pos_x = Math.floor(Math.random() * 400) + 120;
      const pos_y = Math.floor(Math.random() * 280) + 80;

      const nodePayload = {
        workspace_id: workspaceId,
        type: 'result',
        title: `Sandbox Run: ${scriptName} (exit ${codeStatus})`,
        url: '',
        content: contentParts.join('\n'),
        tags_json: JSON.stringify(['sandbox', codeStatus === 0 ? 'passed' : 'failed']),
        metadata_json: JSON.stringify({
          source: 'sandbox_ide',
          script: scriptName,
          exit_code: codeStatus,
          ...(typeof duration_ms === 'number' ? { duration_ms } : {}),
        }),
        pos_x,
        pos_y,
      };

      try {
        const res = await fetch(`${API}/nodes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getOptionalAuthHeaders() },
          body: JSON.stringify(nodePayload),
        });
        if (!res.ok) throw new Error('Failed to create result node');
        await refreshGraph(workspaceId);
        setToast({
          message: `Logged "${scriptName}" execution result to the graph.`,
          type: 'success',
        });
      } catch {
        setToast({
          message: 'Failed to log sandbox result to the graph.',
          type: 'error',
        });
      }
    },
    [workspaceId, refreshGraph]
  );

  const groupTitleMap = useMemo(
    () => new Map(groupNodes.map((g) => [g.id, g.data?.title || 'Group'])),
    [groupNodes]
  );

  const allTags = useMemo(() => {
    const tagSet = new Set();
    nodes.forEach((n) => {
      (n.data?.tags || []).forEach((t) => tagSet.add(t));
    });
    return Array.from(tagSet);
  }, [nodes]);

  const nodeMatchesSearch = useCallback(
    (node) => {
      if (!normalizedQuery) return true;
      const title = (node.data?.title || '').toLowerCase();
      const type = (node.data?.type || '').toLowerCase();
      const content = (node.data?.content || '').toLowerCase();
      const tags = (node.data?.tags || []).join(' ').toLowerCase();
      return (
        title.includes(normalizedQuery) ||
        type.includes(normalizedQuery) ||
        content.includes(normalizedQuery) ||
        tags.includes(normalizedQuery)
      );
    },
    [normalizedQuery]
  );

  const searchMatches = useMemo(
    () => (normalizedQuery ? nodes.filter(nodeMatchesSearch) : []),
    [nodes, normalizedQuery, nodeMatchesSearch]
  );

  const nodeMatchesTopic = useCallback(
    (node) => {
      if (viewMode !== 'topic' || !topicFilter) return true;
      if (topicFilter.startsWith('group:')) {
        const gId = topicFilter.slice(6);
        return node.id === gId || node.data?.groupId === gId;
      }
      if (topicFilter.startsWith('tag:')) {
        const tag = topicFilter.slice(4);
        return (node.data?.tags || []).includes(tag);
      }
      return true;
    },
    [viewMode, topicFilter]
  );

  const timelineVisibleIds = useMemo(() => {
    if (!timelineData) return null;
    return new Set((timelineData.nodes || []).slice(0, timelineStep).map((n) => n.id));
  }, [timelineData, timelineStep]);

  const displayedNodes = useMemo(() => {
    return nodes.map((node) => {
      const groupTitle = node.data?.groupId ? groupTitleMap.get(node.data.groupId) || '' : '';
      const matches = nodeMatchesSearch(node) && nodeMatchesTopic(node);
      const hiddenByTimeline = timelineVisibleIds ? !timelineVisibleIds.has(node.id) : false;
      return {
        ...node,
        hidden: hiddenByTimeline,
        data: {
          ...node.data,
          groupTitle,
        },
        className: normalizedQuery && matches ? 'rg-node-match' : undefined,
        style: {
          ...node.style,
          opacity: matches ? 1 : 0.2,
          transition: 'opacity 150ms ease',
        },
      };
    });
  }, [nodes, groupTitleMap, normalizedQuery, nodeMatchesSearch, nodeMatchesTopic, timelineVisibleIds]);

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
      const strokeColor = isDark ? '#71717A' : '#6B7280';
      const hiddenByTimeline = timelineVisibleIds
        ? !timelineVisibleIds.has(edge.source) || !timelineVisibleIds.has(edge.target)
        : false;
      return {
        ...edge,
        hidden: hiddenByTimeline,
        type: 'default',
        animated: isAi,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: strokeColor,
        },
        style: {
          stroke: strokeColor,
          strokeWidth: 1.5,
          ...(isAi ? { strokeDasharray: '5 5' } : {}),
        },
        ...labelProps,
      };
    });
  }, [edges, theme, timelineVisibleIds]);

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
          <Link
            to={getStoredAuth().token ? '/dashboard' : '/'}
            className="rg-brand rg-brand-link"
            title={getStoredAuth().token ? 'Go to Your Workspaces' : 'ResearchGraph Home'}
          >
            ResearchGraph
          </Link>
          <Link
            to="/dashboard"
            className="rg-back-link"
            title="Back to Workspaces"
          >
            <ArrowLeft size={14} strokeWidth={1.6} />
            <span>Workspaces</span>
          </Link>
          <span className="rg-divider" aria-hidden="true" />

          <div className="rg-topbar-dropdown">
            <button
              type="button"
              className="rg-btn rg-btn-secondary"
              onClick={() => setOpenTopMenu((prev) => (prev === 'add' ? null : 'add'))}
              aria-expanded={openTopMenu === 'add'}
            >
              <Plus size={15} strokeWidth={1.6} />
              <span>Add</span>
              <ChevronDown size={13} strokeWidth={1.6} />
            </button>
            {openTopMenu === 'add' && (
              <div className="rg-topbar-menu is-left" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="rg-topbar-menu-item"
                  onClick={() => {
                    setOpenTopMenu(null);
                    setModalMode('paper');
                  }}
                >
                  <FileText size={15} strokeWidth={1.6} />
                  <span>Paper</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="rg-topbar-menu-item"
                  onClick={() => {
                    setOpenTopMenu(null);
                    setModalMode('question');
                  }}
                >
                  <HelpCircle size={15} strokeWidth={1.6} />
                  <span>Question</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="rg-topbar-menu-item"
                  onClick={() => {
                    setOpenTopMenu(null);
                    setModalMode('note');
                  }}
                >
                  <StickyNote size={15} strokeWidth={1.6} />
                  <span>Note</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="rg-topbar-menu-item"
                  onClick={() => {
                    setOpenTopMenu(null);
                    setModalMode('group');
                  }}
                >
                  <FolderPlus size={15} strokeWidth={1.6} />
                  <span>Group</span>
                </button>
              </div>
            )}
          </div>

          <div className="rg-search-wrap" style={{ position: 'relative' }}>
            <Search size={14} strokeWidth={1.6} className="rg-search-icon" aria-hidden="true" />
            <input
              type="text"
              className="rg-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search"
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
            {normalizedQuery && searchMatches.length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: 0,
                  width: '280px',
                  maxHeight: '240px',
                  overflowY: 'auto',
                  background: theme === 'dark' ? '#18181B' : '#FFFFFF',
                  border: '1px solid var(--border-subtle, #E5E0D8)',
                  borderRadius: '10px',
                  boxShadow: '0 10px 24px rgba(0,0,0,0.14)',
                  zIndex: 40,
                  padding: '4px',
                }}
              >
                {searchMatches.slice(0, 8).map((match) => (
                  <button
                    key={match.id}
                    type="button"
                    onClick={() => {
                      focusNodeOnCanvas(match);
                      setSearchQuery('');
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      border: 'none',
                      background: 'transparent',
                      color: 'inherit',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {match.data?.title}
                    </span>
                    <span className="rg-node-badge" data-node-type={match.data?.type}>
                      {match.data?.type}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rg-view-switch" role="group" aria-label="View Modes">
          {[
            { id: 'graph', label: 'Graph', Icon: GitBranch },
            { id: 'topic', label: 'Topic', Icon: Tag },
            { id: 'grid', label: 'Grid', Icon: List },
          ].map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className={`rg-view-switch-btn ${viewMode === id ? 'is-active' : ''}`}
              onClick={() => setViewMode(id)}
            >
              <Icon size={13} strokeWidth={1.6} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="rg-topbar-group">
          <button
            type="button"
            className="rg-btn rg-btn-accent"
            onClick={() => {
              setOpenTopMenu(null);
              setModalMode('harness');
            }}
          >
            <Bot size={15} strokeWidth={1.6} />
            <span>Agent Harness</span>
          </button>

          <div className="rg-topbar-dropdown">
            <button
              type="button"
              className="rg-btn rg-btn-secondary"
              onClick={() => setOpenTopMenu((prev) => (prev === 'run' ? null : 'run'))}
              aria-expanded={openTopMenu === 'run'}
            >
              <FlaskConical size={15} strokeWidth={1.6} />
              <span>Run</span>
              <ChevronDown size={13} strokeWidth={1.6} />
            </button>
            {openTopMenu === 'run' && (
              <div className="rg-topbar-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="rg-topbar-menu-item"
                  disabled={isAnalyzing}
                  onClick={() => {
                    setOpenTopMenu(null);
                    runAnalyze();
                  }}
                >
                  <Sparkles size={15} strokeWidth={1.6} />
                  <span>{isAnalyzing ? 'Analyzing...' : 'Analyze & Cluster'}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="rg-topbar-menu-item"
                  disabled={isRunningExperiment}
                  onClick={() => {
                    setOpenTopMenu(null);
                    requestExperiment();
                  }}
                >
                  <FlaskConical size={15} strokeWidth={1.6} />
                  <span>{isRunningExperiment ? 'Requesting...' : 'Run Reproduction'}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="rg-topbar-menu-item"
                  disabled={isRunningWhatIf}
                  onClick={() => {
                    setOpenTopMenu(null);
                    setModalMode('what_if');
                  }}
                >
                  <GitBranch size={15} strokeWidth={1.6} />
                  <span>{isRunningWhatIf ? 'Running...' : 'Ask "What If"'}</span>
                </button>
                <div className="rg-topbar-menu-sep" />
                <button
                  type="button"
                  role="menuitem"
                  className="rg-topbar-menu-item"
                  onClick={() => {
                    setOpenTopMenu(null);
                    setModalMode('sandbox');
                  }}
                >
                  <Terminal size={15} strokeWidth={1.6} />
                  <span>Sandbox Experiment</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="rg-topbar-menu-item"
                  disabled={isSuggesting}
                  onClick={() => {
                    setOpenTopMenu(null);
                    handleSuggestNext();
                  }}
                >
                  <Lightbulb size={15} strokeWidth={1.6} />
                  <span>{isSuggesting ? 'Thinking...' : 'Suggest Next Exp'}</span>
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            className="rg-btn rg-btn-secondary"
            disabled={!workspaceId}
            onClick={() => {
              setOpenTopMenu(null);
              setIsSandboxOpen(true);
            }}
            title="Open persistent Python Research Sandbox IDE"
          >
            <Code2 size={15} strokeWidth={1.6} />
            <span>Sandbox IDE</span>
          </button>

          <button
            type="button"
            className="rg-btn rg-btn-secondary"
            onClick={() => {
              setOpenTopMenu(null);
              handleShareWorkspace(false);
            }}
            title="Share a snapshot copy of this workspace"
          >
            <Share2 size={15} strokeWidth={1.6} />
            <span>Share</span>
          </button>

          <div className="rg-topbar-dropdown">
            <button
              type="button"
              className="rg-btn rg-btn-secondary rg-btn-icon"
              onClick={() => setOpenTopMenu((prev) => (prev === 'more' ? null : 'more'))}
              aria-expanded={openTopMenu === 'more'}
              aria-label="Workspace actions"
              title="Workspace actions"
            >
              <MoreHorizontal size={16} strokeWidth={1.6} />
            </button>
            {openTopMenu === 'more' && (
              <div className="rg-topbar-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="rg-topbar-menu-item"
                  onClick={() => {
                    setOpenTopMenu(null);
                    handleOpenTimeline();
                  }}
                >
                  <History size={15} strokeWidth={1.6} />
                  <span>Timeline</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="rg-topbar-menu-item"
                  disabled={nodes.length === 0 || isTidyingLayout}
                  onClick={() => {
                    setOpenTopMenu(null);
                    autoLayout();
                  }}
                >
                  <LayoutGrid size={15} strokeWidth={1.6} />
                  <span>Auto-Layout</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="rg-topbar-menu-item"
                  onClick={() => {
                    setOpenTopMenu(null);
                    exportWorkspace();
                  }}
                >
                  <Download size={15} strokeWidth={1.6} />
                  <span>Export Markdown</span>
                </button>
                <div className="rg-topbar-menu-sep" />
                <button
                  type="button"
                  role="menuitem"
                  className="rg-topbar-menu-item"
                  disabled={isResettingDemo}
                  onClick={() => {
                    setOpenTopMenu(null);
                    resetDemo();
                  }}
                >
                  <RotateCcw size={15} strokeWidth={1.6} />
                  <span>{isResettingDemo ? 'Resetting...' : 'Reset Demo'}</span>
                </button>
              </div>
            )}
          </div>

          {(isOffline || offlineQueueCount > 0) && (
            <span className="rg-log-pill rg-log-pill-pending" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <WifiOff size={11} /> {isOffline ? 'Offline' : 'Syncing'} ({offlineQueueCount})
            </span>
          )}

          <span className="rg-divider" aria-hidden="true" />
          <button
            type="button"
            className="rg-btn rg-btn-secondary rg-engine-pill-btn"
            onClick={() => setIsEngineModalOpen(true)}
            title="Configure AI Engine"
          >
            <span className="rg-engine-pill-dot" aria-hidden="true" />
            <Cpu size={14} strokeWidth={1.6} aria-hidden="true" />
            <span>{PROVIDERS[llmConfig.provider]?.shortLabel || 'Local Llama'}</span>
          </button>
          <button
            type="button"
            className="rg-btn rg-btn-secondary rg-btn-icon"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <Sun size={15} strokeWidth={1.6} />
            ) : (
              <Moon size={15} strokeWidth={1.6} />
            )}
          </button>
        </div>
      </header>

      {/* Main Content: Canvas + Agent Control Sidebar */}
      <div className="rg-main">
        {/* Interactive Canvas / Topic / Grid Views */}
        <div className="rg-canvas-wrap">
          {viewMode === 'topic' && (
            <div
              style={{
                position: 'absolute',
                top: '12px',
                left: '12px',
                right: '12px',
                zIndex: 15,
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px',
                padding: '8px 12px',
                borderRadius: '10px',
                background: theme === 'dark' ? 'rgba(24,24,27,0.92)' : 'rgba(255,255,255,0.94)',
                border: '1px solid var(--border-subtle, #E5E0D8)',
                backdropFilter: 'blur(6px)',
              }}
            >
              <span style={{ fontSize: '12px', fontWeight: 600, alignSelf: 'center', marginRight: '4px' }}>
                Focused Topic:
              </span>
              <button
                type="button"
                className={`rg-suggestion-chip ${topicFilter === '' ? 'is-active' : ''}`}
                onClick={() => setTopicFilter('')}
              >
                All Nodes ({nodes.length})
              </button>
              {groupNodes.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={`rg-suggestion-chip ${topicFilter === `group:${g.id}` ? 'is-active' : ''}`}
                  onClick={() => setTopicFilter(`group:${g.id}`)}
                >
                  Group: {g.data?.title}
                </button>
              ))}
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`rg-suggestion-chip ${topicFilter === `tag:${tag}` ? 'is-active' : ''}`}
                  onClick={() => setTopicFilter(`tag:${tag}`)}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}

          {viewMode === 'grid' ? (
            <div
              style={{
                height: '100%',
                overflowY: 'auto',
                padding: '20px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: '12px',
                alignContent: 'start',
              }}
            >
              {displayedNodes
                .filter((n) => nodeMatchesSearch(n) && nodeMatchesTopic(n))
                .map((node) => (
                  <div
                    key={node.id}
                    className="rg-card"
                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '8px' }}
                    onClick={() => setSelectedNode(node)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="rg-node-badge" data-node-type={node.data?.type}>
                        {node.data?.type}
                      </span>
                      <button
                        type="button"
                        className="rg-btn rg-btn-secondary"
                        style={{ padding: '2px 8px', fontSize: '11px' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          focusNodeOnCanvas(node);
                        }}
                      >
                        Jump to Graph
                      </button>
                    </div>
                    <strong style={{ fontSize: '13.5px' }}>{node.data?.title}</strong>
                    {node.data?.content && (
                      <p style={{ fontSize: '12px', opacity: 0.78, margin: 0, lineHeight: 1.4 }}>
                        {String(node.data.content).slice(0, 140)}
                      </p>
                    )}
                    {(node.data?.tags?.length > 0 || node.data?.groupTitle) && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {node.data?.groupTitle && (
                          <span className="rg-suggestion-chip">{node.data.groupTitle}</span>
                        )}
                        {(node.data?.tags || []).map((t) => (
                          <span key={t} className="rg-suggestion-chip">
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          ) : (
            <ReactFlow
              colorMode={theme}
              nodeTypes={nodeTypes}
              nodes={displayedNodes}
              edges={displayedEdges}
              onInit={(inst) => {
                setRfInstance(inst);
                setZoomPercent(Math.round((inst.getZoom?.() || 1) * 100));
              }}
              onMove={(_, viewport) => {
                if (viewport?.zoom) {
                  setZoomPercent(Math.round(viewport.zoom * 100));
                }
              }}
              panOnDrag={canvasTool === 'pan'}
              selectionOnDrag={canvasTool === 'select'}
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
                variant={BackgroundVariant.Lines}
                color={theme === 'dark' ? '#1E1E24' : '#EAECEF'}
                gap={28}
                lineWidth={1}
              />
              <MiniMap
                position="bottom-right"
                pannable
                zoomable
                nodeColor={(node) => getNodeColor(node.data?.type, theme)}
                maskColor={theme === 'dark' ? 'rgba(9, 9, 11, 0.72)' : 'rgba(247, 245, 240, 0.72)'}
              />
            </ReactFlow>
          )}

          {viewMode !== 'grid' && (
            <div className="rg-floating-toolbar">
              <div className="rg-floating-pill" role="group" aria-label="Canvas tool mode">
                <button
                  type="button"
                  className={`rg-tool-btn ${canvasTool === 'select' ? 'is-active' : ''}`}
                  onClick={() => setCanvasTool('select')}
                  title="Select / Box select"
                  aria-label="Pointer select tool"
                >
                  <MousePointer2 size={15} />
                </button>
                <button
                  type="button"
                  className={`rg-tool-btn ${canvasTool === 'pan' ? 'is-active' : ''}`}
                  onClick={() => setCanvasTool('pan')}
                  title="Hand / Pan canvas"
                  aria-label="Hand pan tool"
                >
                  <Hand size={15} />
                </button>
              </div>
              <div className="rg-floating-pill" role="group" aria-label="Zoom controls">
                <button
                  type="button"
                  className="rg-tool-btn"
                  onClick={() => rfInstance?.zoomOut?.()}
                  title="Zoom out"
                  aria-label="Zoom out"
                >
                  <Minus size={14} />
                </button>
                <button
                  type="button"
                  className="rg-zoom-label"
                  onClick={() => rfInstance?.zoomTo?.(1, { duration: 200 })}
                  title="Reset zoom to 100%"
                >
                  {zoomPercent}%
                </button>
                <button
                  type="button"
                  className="rg-tool-btn"
                  onClick={() => rfInstance?.zoomIn?.()}
                  title="Zoom in"
                  aria-label="Zoom in"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Live Stitch-Style AI Cursors Overlay */}
          {Object.entries(liveCursors).map(([agentId, cur]) => (
            <div
              key={agentId}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                transform: `translate(${Math.max(40, Math.min(720, cur.x))}px, ${Math.max(40, Math.min(480, cur.y))}px)`,
                transition: 'transform 380ms cubic-bezier(0.22, 1, 0.36, 1)',
                pointerEvents: 'none',
                zIndex: 25,
                display: 'flex',
                alignItems: 'flex-start',
                gap: '6px',
              }}
            >
              <MousePointer2 size={18} fill="#2196F3" color="#FFFFFF" />
              <div
                style={{
                  background: '#2196F3',
                  color: '#FFFFFF',
                  padding: '4px 10px',
                  borderRadius: '999px',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  boxShadow: '0 6px 16px rgba(33, 150, 243, 0.35)',
                  whiteSpace: 'nowrap',
                }}
              >
                {cur.agent_name} · {cur.label}
              </div>
            </div>
          ))}

          {/* Share Snapshot Copy Floating Card */}
          {isShareOpen && (
            <div
              className="rg-card"
              style={{
                position: 'absolute',
                right: '16px',
                top: '16px',
                width: '360px',
                zIndex: 26,
                boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <strong style={{ fontSize: '13.5px' }}>Share Research Copy</strong>
                <button type="button" className="rg-inspector-close" onClick={() => setIsShareOpen(false)}>
                  <X size={13} />
                </button>
              </div>
              <p style={{ fontSize: '12px', opacity: 0.78, margin: '0 0 10px', lineHeight: 1.45 }}>
                Anyone with this link can view a read-only snapshot of your graph and agent history, then click <strong>Continue</strong> to copy it into their own account. Your workspace stays private to you.
              </p>
              {shareMeta && (
                <div style={{ fontSize: '11.5px', opacity: 0.72, marginBottom: '8px' }}>
                  Snapshot: {shareMeta.nodeCount} nodes · {shareMeta.logCount} history items
                </div>
              )}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                <input
                  type="text"
                  readOnly
                  className="rg-input"
                  style={{ padding: '5px 8px', fontSize: '11.5px' }}
                  value={shareUrl}
                />
                <button
                  type="button"
                  className="rg-btn rg-btn-accent"
                  style={{ padding: '5px 10px', fontSize: '11.5px', whiteSpace: 'nowrap' }}
                  onClick={() => {
                    navigator.clipboard?.writeText(shareUrl);
                    setToast({ message: 'Share link copied!', type: 'success' });
                  }}
                >
                  Copy
                </button>
              </div>
              <button
                type="button"
                className="rg-btn rg-btn-secondary"
                style={{ width: '100%', justifyContent: 'center', fontSize: '12px' }}
                disabled={isRefreshingShare}
                onClick={() => handleShareWorkspace(true)}
              >
                {isRefreshingShare ? 'Creating Snapshot...' : 'Create New Snapshot Link'}
              </button>
            </div>
          )}

          {/* Suggest Next Best Experiment Floating Card */}
          {nextSuggestions && (
            <div
              className="rg-card"
              style={{
                position: 'absolute',
                right: '16px',
                top: '16px',
                width: '320px',
                zIndex: 24,
                boxShadow: '0 12px 32px rgba(0,0,0,0.16)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <strong style={{ fontSize: '13px' }}>
                  Next Best Experiments ({nextSuggestions.memory_count || 0} memory rows)
                </strong>
                <button type="button" className="rg-inspector-close" onClick={() => setNextSuggestions(null)}>
                  <X size={13} />
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(nextSuggestions.suggestions || []).map((s, idx) => (
                  <div key={idx} style={{ padding: '8px', borderRadius: '8px', background: 'rgba(127,127,127,0.08)' }}>
                    <div style={{ fontSize: '12.5px', fontWeight: 600 }}>{s.title}</div>
                    <div style={{ fontSize: '11.5px', opacity: 0.78, margin: '3px 0 6px' }}>{s.why}</div>
                    <button
                      type="button"
                      className="rg-btn rg-btn-accent"
                      style={{ padding: '3px 8px', fontSize: '11px' }}
                      onClick={() => {
                        setNextSuggestions(null);
                        setModalMode('sandbox');
                      }}
                    >
                      Run in Sandbox
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Replayable Evolution Timeline Scrubber */}
          {timelineData && (
            <div
              className="rg-card"
              style={{
                position: 'absolute',
                left: '50%',
                bottom: '18px',
                transform: 'translateX(-50%)',
                width: '440px',
                maxWidth: 'calc(100% - 220px)',
                zIndex: 24,
                boxShadow: '0 12px 32px rgba(0,0,0,0.16)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  type="button"
                  className="rg-btn rg-btn-accent"
                  style={{ padding: '5px 9px' }}
                  onClick={() => {
                    if (timelineStep >= (timelineData.nodes?.length || 0)) setTimelineStep(0);
                    setIsPlayingTimeline((p) => !p);
                  }}
                >
                  {isPlayingTimeline ? <Pause size={13} /> : <Play size={13} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={timelineData.nodes?.length || 0}
                  value={timelineStep}
                  onChange={(e) => {
                    setIsPlayingTimeline(false);
                    setTimelineStep(Number(e.target.value));
                  }}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: '12px', fontWeight: 600 }}>
                  {timelineStep}/{timelineData.nodes?.length || 0} nodes
                </span>
                <button type="button" className="rg-inspector-close" onClick={() => setTimelineData(null)}>
                  <X size={13} />
                </button>
              </div>
              {timelineStep > 0 && timelineData.nodes?.[timelineStep - 1] && (
                <div style={{ fontSize: '11.5px', opacity: 0.8, marginTop: '6px' }}>
                  Step {timelineStep}: [{timelineData.nodes[timelineStep - 1].type.toUpperCase()}]{' '}
                  {timelineData.nodes[timelineStep - 1].title}
                </div>
              )}
            </div>
          )}

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

              {selectedNode.data?.url && (
                <a
                  href={selectedNode.data.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    marginBottom: '8px',
                    color: 'var(--accent, #2563eb)',
                    wordBreak: 'break-all',
                  }}
                >
                  <ExternalLink size={12} />
                  <span>{selectedNode.data.url}</span>
                </a>
              )}

              <div className="rg-inspector-body">
                {inspectorDetails.prose && (
                  inspectorType === 'code' || inspectorType === 'experiment' ? (
                    <pre className="rg-inspector-code">{inspectorDetails.prose}</pre>
                  ) : (
                    <p className="rg-inspector-prose">{inspectorDetails.prose}</p>
                  )
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

                {/* Topic Group Selector */}
                {inspectorType !== 'group' && (
                  <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle, #E5E0D8)' }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '4px', opacity: 0.75 }}>
                      Topic Group
                    </label>
                    <select
                      className="rg-input"
                      style={{ padding: '5px 8px', fontSize: '12px' }}
                      value={selectedNode.data?.groupId || ''}
                      onChange={(e) => handleGroupChange(e.target.value)}
                    >
                      <option value="">Ungrouped</option>
                      {groupNodes.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.data?.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Tags Editor */}
                <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle, #E5E0D8)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '6px', opacity: 0.75 }}>
                    Tags
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
                    {(selectedNode.data?.tags || []).map((tag) => (
                      <span
                        key={tag}
                        className="rg-suggestion-chip"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        #{tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, color: 'inherit' }}
                          aria-label={`Remove tag ${tag}`}
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                  <form onSubmit={handleAddTag} style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="text"
                      className="rg-input"
                      style={{ padding: '4px 8px', fontSize: '12px' }}
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      placeholder="Add tag..."
                    />
                    <button type="submit" className="rg-btn rg-btn-secondary" style={{ padding: '4px 8px' }}>
                      <Plus size={12} />
                    </button>
                  </form>
                </div>

                {/* Comments / Highlights */}
                <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle, #E5E0D8)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 600, marginBottom: '6px', opacity: 0.75 }}>
                    <MessageSquare size={12} />
                    <span>Comments & Highlights ({inspectorDetails.comments?.length || 0})</span>
                  </div>
                  {inspectorDetails.comments?.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px', maxHeight: '120px', overflowY: 'auto' }}>
                      {inspectorDetails.comments.map((c) => (
                        <div
                          key={c.id}
                          style={{
                            fontSize: '12px',
                            padding: '6px 8px',
                            borderRadius: '6px',
                            background: 'rgba(127,127,127,0.1)',
                          }}
                        >
                          <div>{c.text}</div>
                          {c.createdAt && (
                            <div style={{ fontSize: '10px', opacity: 0.6, marginTop: '2px' }}>{c.createdAt}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <form onSubmit={handleAddComment} style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="text"
                      className="rg-input"
                      style={{ padding: '4px 8px', fontSize: '12px' }}
                      value={newCommentInput}
                      onChange={(e) => setNewCommentInput(e.target.value)}
                      placeholder="Add comment or highlight..."
                    />
                    <button type="submit" className="rg-btn rg-btn-secondary" style={{ padding: '4px 8px' }}>
                      <Plus size={12} />
                    </button>
                  </form>
                </div>
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
                          {log.payload_json && log.payload_json !== '{}' && (
                            <pre
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: '11px',
                                background: 'rgba(127,127,127,0.1)',
                                padding: '6px 8px',
                                borderRadius: '6px',
                                overflowX: 'auto',
                                marginTop: '6px',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                              }}
                            >
                              {log.payload_json}
                            </pre>
                          )}

                          {/* Approve / Reject / Redirect buttons when pending */}
                          {log.approval_status === 'pending' && (
                            <>
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
                                <button
                                  type="button"
                                  className="rg-btn rg-btn-secondary"
                                  style={{ padding: '4px 8px', fontSize: '11px' }}
                                  disabled={isDecisionBusy}
                                  onClick={() =>
                                    setRedirectLogId((prev) => (prev === log.id ? null : log.id))
                                  }
                                >
                                  Redirect
                                </button>
                              </div>
                              {redirectLogId === log.id && (
                                <form
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    if (!redirectFeedback.trim()) return;
                                    handleDecision(log.id, 'redirected', redirectFeedback);
                                  }}
                                  style={{ display: 'flex', gap: '6px', marginTop: '6px' }}
                                >
                                  <input
                                    type="text"
                                    className="rg-input"
                                    style={{ padding: '4px 8px', fontSize: '11.5px' }}
                                    value={redirectFeedback}
                                    onChange={(e) => setRedirectFeedback(e.target.value)}
                                    placeholder="Tell agent what to do instead..."
                                  />
                                  <button type="submit" className="rg-btn rg-btn-accent" style={{ padding: '4px 8px', fontSize: '11px' }}>
                                    Send
                                  </button>
                                </form>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            ) : (
              <section aria-label="Agent Team" role="tabpanel">
                <form
                  onSubmit={handleSpawnAgent}
                  className="rg-card"
                  style={{ marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}
                >
                  <div style={{ fontSize: '12px', fontWeight: 400 }}>Spawn Specialist Agent</div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="text"
                      className="rg-input"
                      style={{ padding: '4px 8px', fontSize: '12px' }}
                      value={newAgentName}
                      onChange={(e) => setNewAgentName(e.target.value)}
                      placeholder="Name (e.g. Citation Verifier)"
                    />
                    <input
                      type="text"
                      className="rg-input"
                      style={{ padding: '4px 8px', fontSize: '12px', maxWidth: '95px' }}
                      value={newAgentRole}
                      onChange={(e) => setNewAgentRole(e.target.value)}
                      placeholder="Role"
                    />
                    <button type="submit" className="rg-btn rg-btn-accent" style={{ padding: '4px 8px' }}>
                      <Plus size={13} />
                    </button>
                  </div>
                </form>
                <div className="rg-card-stack">
                  {agents.map((a) => (
                    <div key={a.id} className="rg-card" style={{ opacity: a.is_active ? 1 : 0.55 }}>
                      <div className="rg-agent-top">
                        <span className="rg-agent-name">
                          {a.name} {!a.is_active && '(Retired)'}
                        </span>
                        <span className="rg-rating-pill">
                          <Star size={11} strokeWidth={2} fill="currentColor" aria-hidden="true" />
                          <span>{Number(a.rating_score || 1).toFixed(1)}</span>
                        </span>
                      </div>
                      <div className="rg-agent-meta" style={{ marginBottom: '6px' }}>
                        <span>Role: {a.role} · {a.tasks_completed || 0} tasks</span>
                        <span className={getStatusClass(a.status)}>
                          {a.status}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          className="rg-btn rg-btn-secondary"
                          style={{ padding: '3px 7px', fontSize: '11px' }}
                          onClick={() => handleRateAgent(a.id, 0.2)}
                          title="Reward agent (+0.2)"
                        >
                          <ThumbsUp size={11} />
                        </button>
                        <button
                          type="button"
                          className="rg-btn rg-btn-secondary"
                          style={{ padding: '3px 7px', fontSize: '11px' }}
                          onClick={() => handleRateAgent(a.id, -0.2)}
                          title="Penalize agent (-0.2)"
                        >
                          <ThumbsDown size={11} />
                        </button>
                        <button
                          type="button"
                          className="rg-btn rg-btn-secondary"
                          style={{ padding: '3px 8px', fontSize: '11px', marginLeft: 'auto' }}
                          onClick={() => handlePauseResumeAgent(a)}
                        >
                          {a.status === 'paused' ? 'Resume' : 'Pause'}
                        </button>
                        <button
                          type="button"
                          className="rg-btn rg-btn-secondary"
                          style={{ padding: '3px 8px', fontSize: '11px' }}
                          onClick={() => handleToggleAgentActive(a)}
                        >
                          {a.is_active ? 'Retire' : 'Reactivate'}
                        </button>
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

      {/* LLM Engine Configuration Modal */}
      {isEngineModalOpen && (
        <EngineModal
          onClose={() => setIsEngineModalOpen(false)}
          onSaved={(saved) => setLlmConfig(saved)}
        />
      )}

      {/* Persistent Coding Sandbox IDE */}
      {isSandboxOpen && workspaceId && (
        <SandboxIDE
          workspaceId={workspaceId}
          paperNodes={paperNodes}
          onClose={() => setIsSandboxOpen(false)}
          onLogResult={handleLogSandboxResult}
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
