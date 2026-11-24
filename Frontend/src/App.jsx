import { useState, useEffect, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  addEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const API = 'http://127.0.0.1:8000';

export default function App() {
  const [workspaceId, setWorkspaceId] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [agents, setAgents] = useState([]);
  const [logs, setLogs] = useState([]);

  // Delete a node from SQLite and remove it (+ its connected edges) from the canvas
  const deleteNode = useCallback(async (nodeId) => {
    await fetch(`${API}/nodes/${nodeId}`, { method: 'DELETE' });
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
  }, []);

  // Helper to format a DB node into a React Flow node with a delete (×) button
  const formatNode = useCallback(
    (n) => ({
      id: n.id,
      position: { x: n.pos_x, y: n.pos_y },
      data: {
        label: (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
            <span>[{n.type.toUpperCase()}] {n.title}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteNode(n.id);
              }}
              title="Delete node"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#ef4444',
                cursor: 'pointer',
                fontWeight: 'bold',
                padding: '0 4px',
              }}
            >
              ×
            </button>
          </div>
        ),
      },
    }),
    [deleteNode]
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

      const graphRes = await fetch(`${API}/workspaces/${wsId}/graph`);
      const graph = await graphRes.json();

      setNodes(graph.nodes.map(formatNode));
      setEdges(
        graph.edges.map((e) => ({
          id: e.id,
          source: e.source_id,
          target: e.target_id,
          label: e.label,
        }))
      );
    }
    init();
  }, [formatNode]);

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
      setEdges((eds) => addEdge({ ...params, id: saved.id, label: saved.label }, eds));
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

  // Approve or Reject a pending agent action
  const handleDecision = async (logId, decision) => {
    await fetch(`${API}/logs/${logId}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    });
    fetchAgentData();
  };

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#0b0f19', color: '#e2e8f0' }}>
      {/* Top Bar */}
      <div style={{ padding: '10px 16px', background: '#0f172a', borderBottom: '1px solid #1e293b', display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
        <strong style={{ marginRight: '12px' }}>ResearchGraph</strong>
        <button onClick={() => addNode('paper')}>+ Add Paper</button>
        <button onClick={() => addNode('question')}>+ Add Question</button>
        <button onClick={() => addNode('note')}>+ Add Note</button>
      </div>

      {/* Main Content: Canvas + Agent Control Sidebar */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        {/* Interactive Canvas */}
        <div style={{ flex: 1, minWidth: 0, height: '100%' }}>
          <ReactFlow
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
            <Background />
            <Controls />
          </ReactFlow>
        </div>

        {/* Right-Hand Agent Control Sidebar (320px) */}
        <div style={{ width: '320px', flexShrink: 0, background: '#0f172a', borderLeft: '1px solid #1e293b', display: 'flex', flexDirection: 'column', padding: '14px', overflowY: 'auto', gap: '16px' }}>
          {/* 1. Agent Roster */}
          <div>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', textTransform: 'uppercase', color: '#94a3b8' }}>
              Agent Team ({agents.length})
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {agents.map((a) => (
                <div key={a.id} style={{ padding: '10px', background: '#1e293b', borderRadius: '6px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                    <span>{a.name}</span>
                    <span style={{ color: '#fbbf24' }}>★ {a.rating_score.toFixed(1)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '12px', color: '#94a3b8' }}>
                    <span>Role: {a.role}</span>
                    <span style={{
                      color: a.status === 'working' ? '#38bdf8' : a.status === 'waiting_approval' ? '#f59e0b' : '#4ade80',
                    }}>
                      ● {a.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Live Activity Feed & Human-in-the-Loop Controls */}
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', textTransform: 'uppercase', color: '#94a3b8' }}>
              Live Activity Feed
            </h3>
            {logs.length === 0 ? (
              <p style={{ fontSize: '12px', color: '#64748b' }}>No agent activity yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {logs.map((log) => (
                  <div key={log.id} style={{ padding: '10px', background: '#1e293b', borderRadius: '6px', fontSize: '12px', borderLeft: log.approval_status === 'pending' ? '3px solid #f59e0b' : '3px solid #334155' }}>
                    <div style={{ fontWeight: 'bold', color: '#e2e8f0' }}>{log.agent_name}</div>
                    <div style={{ marginTop: '4px' }}>{log.action}</div>
                    {log.reasoning && (
                      <div style={{ marginTop: '4px', color: '#94a3b8', fontStyle: 'italic' }}>
                        Why: {log.reasoning}
                      </div>
                    )}

                    {/* Approve / Reject buttons when pending */}
                    {log.approval_status === 'pending' ? (
                      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                        <button
                          onClick={() => handleDecision(log.id, 'approved')}
                          style={{ flex: 1, background: '#16a34a', color: '#fff', border: 'none', padding: '5px', borderRadius: '4px', cursor: 'pointer' }}
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleDecision(log.id, 'rejected')}
                          style={{ flex: 1, background: '#dc2626', color: '#fff', border: 'none', padding: '5px', borderRadius: '4px', cursor: 'pointer' }}
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <div style={{ marginTop: '6px', fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>
                        Status: {log.approval_status}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}