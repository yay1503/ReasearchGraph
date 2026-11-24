import json
import uuid
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import aiosqlite
from db import get_db

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