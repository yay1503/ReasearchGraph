import json
import uuid
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import aiosqlite
from db import get_db
from agents import run_reader_and_clusterer, request_experiment_approval, execute_experiment_with_debugger
from fastapi.responses import PlainTextResponse
from agents import (
    run_reader_and_clusterer,
    request_experiment_approval,
    execute_experiment_with_debugger,
    run_what_if_experiment,
)

app = FastAPI(title="ResearchGraph API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class WorkspaceCreate(BaseModel):
    name: str
    description: str = ""

class NodeCreate(BaseModel):
    workspace_id: str
    type: str
    title: str
    content: str = ""
    pos_x: float = 0.0
    pos_y: float = 0.0

@app.get("/agents")
async def list_agents(db: aiosqlite.Connection = Depends(get_db)):
    cursor = await db.execute("SELECT * FROM agents")
    return [dict(row) for row in await cursor.fetchall()]

@app.post("/workspaces")
async def create_workspace(ws: WorkspaceCreate, db: aiosqlite.Connection = Depends(get_db)):
    ws_id = uuid.uuid4().hex
    await db.execute(
        "INSERT INTO workspaces (id, name, description) VALUES (?, ?, ?)",
        (ws_id, ws.name, ws.description),
    )
    await db.commit()
    return {"id": ws_id, **ws.model_dump()}

@app.get("/workspaces/{workspace_id}/graph")
async def get_graph(workspace_id: str, db: aiosqlite.Connection = Depends(get_db)):
    nodes = await (await db.execute("SELECT * FROM nodes WHERE workspace_id = ?", (workspace_id,))).fetchall()
    edges = await (await db.execute("SELECT * FROM edges WHERE workspace_id = ?", (workspace_id,))).fetchall()
    return {"nodes": [dict(n) for n in nodes], "edges": [dict(e) for e in edges]}

@app.post("/nodes")
async def create_node(node: NodeCreate, db: aiosqlite.Connection = Depends(get_db)):
    node_id = uuid.uuid4().hex
    await db.execute(
        "INSERT INTO nodes (id, workspace_id, type, title, content, pos_x, pos_y) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (node_id, node.workspace_id, node.type, node.title, node.content, node.pos_x, node.pos_y),
    )
    await db.commit()
    return {"id": node_id, **node.model_dump()}

class NodePositionUpdate(BaseModel):
    pos_x: float
    pos_y: float

class EdgeCreate(BaseModel):
    workspace_id: str
    source_id: str
    target_id: str
    label: str = ""

@app.patch("/nodes/{node_id}/position")
async def update_node_position(node_id: str, pos: NodePositionUpdate, db: aiosqlite.Connection = Depends(get_db)):
    await db.execute("UPDATE nodes SET pos_x = ?, pos_y = ? WHERE id = ?", (pos.pos_x, pos.pos_y, node_id))
    await db.commit()
    return {"status": "updated"}

@app.post("/edges")
async def create_edge(edge: EdgeCreate, db: aiosqlite.Connection = Depends(get_db)):
    edge_id = uuid.uuid4().hex
    await db.execute(
        "INSERT INTO edges (id, workspace_id, source_id, target_id, label) VALUES (?, ?, ?, ?, ?)",
        (edge_id, edge.workspace_id, edge.source_id, edge.target_id, edge.label),
    )
    await db.commit()
    return {"id": edge_id, **edge.model_dump()}

class LogDecision(BaseModel):
    decision: str  # "approved" or "rejected"

@app.delete("/nodes/{node_id}")
async def delete_node(node_id: str, db: aiosqlite.Connection = Depends(get_db)):
    # ON DELETE CASCADE in schema.sql automatically removes connected edges
    await db.execute("DELETE FROM nodes WHERE id = ?", (node_id,))
    await db.commit()
    return {"status": "deleted", "id": node_id}

@app.delete("/edges/{edge_id}")
async def delete_edge(edge_id: str, db: aiosqlite.Connection = Depends(get_db)):
    await db.execute("DELETE FROM edges WHERE id = ?", (edge_id,))
    await db.commit()
    return {"status": "deleted", "id": edge_id}

@app.get("/workspaces/{workspace_id}/logs")
async def get_logs(workspace_id: str, db: aiosqlite.Connection = Depends(get_db)):
    cursor = await db.execute(
        """
        SELECT l.*, a.name AS agent_name
        FROM agent_logs l
        JOIN agents a ON l.agent_id = a.id
        WHERE l.workspace_id = ?
        ORDER BY l.created_at DESC
        LIMIT 50
        """,
        (workspace_id,),
    )
    return [dict(row) for row in await cursor.fetchall()]

@app.post("/workspaces/{workspace_id}/agents/analyze")
async def analyze_workspace(workspace_id: str, db: aiosqlite.Connection = Depends(get_db)):
    return await run_reader_and_clusterer(workspace_id, db)

@app.post("/workspaces/{workspace_id}/agents/experiment/request")
async def request_experiment(workspace_id: str, db: aiosqlite.Connection = Depends(get_db)):
    return await request_experiment_approval(workspace_id, db)

@app.post("/logs/{log_id}/decision")
async def decide_log(log_id: int, body: LogDecision, db: aiosqlite.Connection = Depends(get_db)):
    cursor = await db.execute("SELECT workspace_id, agent_id FROM agent_logs WHERE id = ?", (log_id,))
    log_row = await cursor.fetchone()
    if log_row is None:
        raise HTTPException(status_code=404, detail="Agent log not found")

    await db.execute("UPDATE agent_logs SET approval_status = ? WHERE id = ?", (body.decision, log_id))
    await db.execute("UPDATE agents SET status = 'idle' WHERE id = ?", (log_row["agent_id"],))
    await db.commit()

    if body.decision == "approved" and log_row["agent_id"] == "agent_coder":
        await execute_experiment_with_debugger(log_row["workspace_id"], db)

    return {"status": body.decision, "log_id": log_id}

class WhatIfRequest(BaseModel):
    question: str

@app.post("/workspaces/{workspace_id}/agents/what-if")
async def what_if_experiment(workspace_id: str, body: WhatIfRequest, db: aiosqlite.Connection = Depends(get_db)):
    return await run_what_if_experiment(workspace_id, body.question, db)

@app.get("/workspaces/{workspace_id}/export", response_class=PlainTextResponse)
async def export_workspace(workspace_id: str, db: aiosqlite.Connection = Depends(get_db)):
    ws = await (await db.execute("SELECT * FROM workspaces WHERE id = ?", (workspace_id,))).fetchone()
    nodes = await (await db.execute("SELECT * FROM nodes WHERE workspace_id = ?", (workspace_id,))).fetchall()
    edges = await (await db.execute("SELECT * FROM edges WHERE workspace_id = ?", (workspace_id,))).fetchall()

    node_map = {n["id"]: n["title"] for n in nodes}
    lines = [f"# ResearchGraph Report: {ws['name'] if ws else workspace_id}\n"]

    lines.append("## Nodes & Findings")
    for n in nodes:
        lines.append(f"- **[{n['type'].upper()}] {n['title']}**")
        if n["content"]:
            lines.append(f"  - {n['content']}")

    lines.append("\n## Relationships")
    for e in edges:
        src = node_map.get(e["source_id"], e["source_id"])
        tgt = node_map.get(e["target_id"], e["target_id"])
        lines.append(f"- {src} `--({e['label']})-->` {tgt}")

    return "\n".join(lines)