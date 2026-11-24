import { useState, useEffect, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const API = 'http://127.0.0.1:8000';

export default function App() {
  const [workspaceId, setWorkspaceId] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);

  // 1. Initialize a workspace and load its graph
  useEffect(() => {
    async function init() {
      const wsRes = await fetch(`${API}/workspaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'SMOTE Research Workspace' }),
      });
      const ws = await wsRes.json();
      setWorkspaceId(ws.id);

      const graphRes = await fetch(`${API}/workspaces/${ws.id}/graph`);
      const graph = await graphRes.json();

      setNodes(
        graph.nodes.map((n) => ({
          id: n.id,
          position: { x: n.pos_x, y: n.pos_y },
          data: { label: `[${n.type.toUpperCase()}] ${n.title}` },
        }))
      );
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
  }, []);

  const onNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );
  const onEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  // 2. Save node position to SQLite when dropped
  const onNodeDragStop = useCallback(async (_, node) => {
    await fetch(`${API}/nodes/${node.id}/position`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pos_x: node.position.x, pos_y: node.position.y }),
    });
  }, []);

  // 3. Save new edge to SQLite when two nodes are connected
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

  // 4. Add a new node to SQLite & Canvas
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

    setNodes((nds) => [
      ...nds,
      {
        id: saved.id,
        position: { x: saved.pos_x, y: saved.pos_y },
        data: { label: `[${saved.type.toUpperCase()}] ${saved.title}` },
      },
    ]);
  };

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 16px', background: '#0f172a', color: '#fff', display: 'flex', gap: '10px', alignItems: 'center' }}>
        <strong>ResearchGraph</strong>
        <button onClick={() => addNode('paper')}>+ Add Paper</button>
        <button onClick={() => addNode('question')}>+ Add Question</button>
        <button onClick={() => addNode('note')}>+ Add Note</button>
      </div>
      <div style={{ flex: 1 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={onNodeDragStop}
          onConnect={onConnect}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}