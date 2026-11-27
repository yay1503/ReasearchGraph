from contextlib import asynccontextmanager
import uuid

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from agents import (
    execute_experiment_with_debugger,
    request_experiment_approval,
    run_reader_and_clusterer,
    run_what_if_experiment,
)
from auth import router as auth_router
from db import get_db, init_db


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(title="ResearchGraph API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)


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
async def list_agents(db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("SELECT * FROM agents")
        return [dict(row) for row in cur.fetchall()]


@app.post("/workspaces")
async def create_workspace(ws: WorkspaceCreate, db=Depends(get_db)):
    ws_id = uuid.uuid4().hex
    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO workspaces (id, name, description) VALUES (%s, %s, %s)",
            (ws_id, ws.name, ws.description),
        )
    db.commit()
    return {"id": ws_id, **ws.model_dump()}


@app.get("/workspaces/{workspace_id}/graph")
async def get_graph(workspace_id: str, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("SELECT * FROM nodes WHERE workspace_id = %s", (workspace_id,))
        nodes = cur.fetchall()
        cur.execute("SELECT * FROM edges WHERE workspace_id = %s", (workspace_id,))
        edges = cur.fetchall()
    return {"nodes": [dict(n) for n in nodes], "edges": [dict(e) for e in edges]}


@app.post("/nodes")
async def create_node(node: NodeCreate, db=Depends(get_db)):
    node_id = uuid.uuid4().hex
    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO nodes (id, workspace_id, type, title, content, pos_x, pos_y) VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (node_id, node.workspace_id, node.type, node.title, node.content, node.pos_x, node.pos_y),
        )
    db.commit()
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
async def update_node_position(node_id: str, pos: NodePositionUpdate, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute(
            "UPDATE nodes SET pos_x = %s, pos_y = %s WHERE id = %s",
            (pos.pos_x, pos.pos_y, node_id),
        )
    db.commit()
    return {"status": "updated"}


@app.post("/edges")
async def create_edge(edge: EdgeCreate, db=Depends(get_db)):
    edge_id = uuid.uuid4().hex
    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO edges (id, workspace_id, source_id, target_id, label) VALUES (%s, %s, %s, %s, %s)",
            (edge_id, edge.workspace_id, edge.source_id, edge.target_id, edge.label),
        )
    db.commit()
    return {"id": edge_id, **edge.model_dump()}


class LogDecision(BaseModel):
    decision: str  # "approved" or "rejected"


@app.delete("/nodes/{node_id}")
async def delete_node(node_id: str, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("DELETE FROM nodes WHERE id = %s", (node_id,))
    db.commit()
    return {"status": "deleted", "id": node_id}


@app.delete("/edges/{edge_id}")
async def delete_edge(edge_id: str, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("DELETE FROM edges WHERE id = %s", (edge_id,))
    db.commit()
    return {"status": "deleted", "id": edge_id}


@app.get("/workspaces/{workspace_id}/logs")
async def get_logs(workspace_id: str, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT l.*, a.name AS agent_name
            FROM agent_logs l
            JOIN agents a ON l.agent_id = a.id
            WHERE l.workspace_id = %s
            ORDER BY l.created_at DESC, l.id DESC
            LIMIT 50
            """,
            (workspace_id,),
        )
        return [dict(row) for row in cur.fetchall()]


@app.post("/workspaces/{workspace_id}/agents/analyze")
async def analyze_workspace(workspace_id: str, db=Depends(get_db)):
    return await run_reader_and_clusterer(workspace_id, db)


@app.post("/workspaces/{workspace_id}/agents/experiment/request")
async def request_experiment(workspace_id: str, db=Depends(get_db)):
    return await request_experiment_approval(workspace_id, db)


@app.post("/logs/{log_id}/decision")
async def decide_log(log_id: int, body: LogDecision, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute(
            "SELECT workspace_id, agent_id, approval_status FROM agent_logs WHERE id = %s",
            (log_id,),
        )
        log_row = cur.fetchone()
        if log_row is None:
            raise HTTPException(status_code=404, detail="Agent log not found")

        if log_row["approval_status"] != "pending":
            return {
                "status": log_row["approval_status"],
                "log_id": log_id,
                "already_processed": True,
            }

        cur.execute(
            "UPDATE agent_logs SET approval_status = %s WHERE id = %s AND approval_status = 'pending'",
            (body.decision, log_id),
        )
        if cur.rowcount == 0:
            db.rollback()
            return {"status": "already_processed", "log_id": log_id, "already_processed": True}

        cur.execute("UPDATE agents SET status = 'idle' WHERE id = %s", (log_row["agent_id"],))
    db.commit()

    if body.decision == "approved" and log_row["agent_id"] == "agent_coder":
        await execute_experiment_with_debugger(log_row["workspace_id"], db)

    return {"status": body.decision, "log_id": log_id}


class WhatIfRequest(BaseModel):
    question: str


@app.post("/workspaces/{workspace_id}/agents/what-if")
async def what_if_experiment(workspace_id: str, body: WhatIfRequest, db=Depends(get_db)):
    return await run_what_if_experiment(workspace_id, body.question, db)


@app.get("/workspaces/{workspace_id}/export", response_class=PlainTextResponse)
async def export_workspace(workspace_id: str, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("SELECT * FROM workspaces WHERE id = %s", (workspace_id,))
        ws = cur.fetchone()
        cur.execute("SELECT * FROM nodes WHERE workspace_id = %s", (workspace_id,))
        nodes = cur.fetchall()
        cur.execute("SELECT * FROM edges WHERE workspace_id = %s", (workspace_id,))
        edges = cur.fetchall()

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
