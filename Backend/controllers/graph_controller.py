import secrets
import uuid

from fastapi import HTTPException

from models.schemas import EdgeCreate, NodeCreate, NodePositionUpdate, NodeUpdate, WorkspaceCreate


def list_user_workspaces(current_user: dict, db) -> list[dict]:
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT
                w.id,
                w.name,
                w.description,
                w.user_id,
                w.created_at,
                (SELECT COUNT(*) FROM nodes n WHERE n.workspace_id = w.id) AS node_count
            FROM workspaces w
            WHERE w.user_id = %s
            ORDER BY w.created_at DESC
            """,
            (current_user["id"],),
        )
        return [dict(row) for row in cur.fetchall()]


def create_new_workspace(ws: WorkspaceCreate, current_user: dict | None, db) -> dict:
    ws_id = uuid.uuid4().hex
    user_id = current_user["id"] if current_user else None
    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO workspaces (id, name, description, user_id) VALUES (%s, %s, %s, %s)",
            (ws_id, ws.name, ws.description, user_id),
        )
    db.commit()
    return {"id": ws_id, **ws.model_dump(), "user_id": user_id}


def delete_user_workspace(workspace_id: str, current_user: dict, db) -> dict:
    with db.cursor() as cur:
        cur.execute(
            "SELECT id FROM workspaces WHERE id = %s AND user_id = %s",
            (workspace_id, current_user["id"]),
        )
        if cur.fetchone() is None:
            raise HTTPException(status_code=404, detail="Workspace not found")

        cur.execute("DELETE FROM research_memory WHERE workspace_id = %s", (workspace_id,))
        cur.execute("DELETE FROM edges WHERE workspace_id = %s", (workspace_id,))
        cur.execute("DELETE FROM agent_logs WHERE workspace_id = %s", (workspace_id,))
        cur.execute("DELETE FROM nodes WHERE workspace_id = %s", (workspace_id,))
        cur.execute(
            "DELETE FROM workspaces WHERE id = %s AND user_id = %s",
            (workspace_id, current_user["id"]),
        )
    db.commit()
    return {"deleted": workspace_id}


def get_workspace_graph(workspace_id: str, db) -> dict:
    with db.cursor() as cur:
        cur.execute("SELECT * FROM nodes WHERE workspace_id = %s", (workspace_id,))
        nodes = cur.fetchall()
        cur.execute("SELECT * FROM edges WHERE workspace_id = %s", (workspace_id,))
        edges = cur.fetchall()
    return {"nodes": [dict(n) for n in nodes], "edges": [dict(e) for e in edges]}


def create_graph_node(node: NodeCreate, db) -> dict:
    node_id = uuid.uuid4().hex
    with db.cursor() as cur:
        cur.execute(
            """
            INSERT INTO nodes (id, workspace_id, type, title, url, content, metadata_json, tags_json, group_id, pos_x, pos_y)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                node_id,
                node.workspace_id,
                node.type,
                node.title,
                node.url,
                node.content,
                node.metadata_json,
                node.tags_json,
                node.group_id,
                node.pos_x,
                node.pos_y,
            ),
        )
    db.commit()
    return {"id": node_id, **node.model_dump()}


def update_graph_node(node_id: str, body: NodeUpdate, db) -> dict:
    fields = body.model_fields_set
    if not fields:
        return {"status": "unchanged", "id": node_id}

    assignments = []
    values = []
    for col in ("title", "url", "content", "metadata_json", "tags_json", "group_id"):
        if col in fields:
            assignments.append(f"{col} = %s")
            values.append(getattr(body, col))

    values.append(node_id)
    with db.cursor() as cur:
        cur.execute(
            f"UPDATE nodes SET {', '.join(assignments)} WHERE id = %s RETURNING *",
            tuple(values),
        )
        updated = cur.fetchone()
        if updated is None:
            raise HTTPException(status_code=404, detail="Node not found")
    db.commit()
    return dict(updated)


def update_graph_node_position(node_id: str, pos: NodePositionUpdate, db) -> dict:
    with db.cursor() as cur:
        cur.execute(
            "UPDATE nodes SET pos_x = %s, pos_y = %s WHERE id = %s",
            (pos.pos_x, pos.pos_y, node_id),
        )
    db.commit()
    return {"status": "updated"}


def delete_graph_node(node_id: str, db) -> dict:
    with db.cursor() as cur:
        cur.execute("DELETE FROM nodes WHERE id = %s", (node_id,))
    db.commit()
    return {"status": "deleted", "id": node_id}


def create_graph_edge(edge: EdgeCreate, db) -> dict:
    edge_id = uuid.uuid4().hex
    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO edges (id, workspace_id, source_id, target_id, label) VALUES (%s, %s, %s, %s, %s)",
            (edge_id, edge.workspace_id, edge.source_id, edge.target_id, edge.label),
        )
    db.commit()
    return {"id": edge_id, **edge.model_dump()}


def delete_graph_edge(edge_id: str, db) -> dict:
    with db.cursor() as cur:
        cur.execute("DELETE FROM edges WHERE id = %s", (edge_id,))
    db.commit()
    return {"status": "deleted", "id": edge_id}


def export_workspace_markdown(workspace_id: str, db) -> str:
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
        if n.get("url"):
            lines.append(f"  - Link: {n['url']}")
        if n["content"]:
            lines.append(f"  - {n['content']}")

    lines.append("\n## Relationships")
    for e in edges:
        src = node_map.get(e["source_id"], e["source_id"])
        tgt = node_map.get(e["target_id"], e["target_id"])
        lines.append(f"- {src} `--({e['label']})-->` {tgt}")

    return "\n".join(lines)


def create_workspace_share(workspace_id: str, db) -> dict:
    with db.cursor() as cur:
        cur.execute("SELECT id, name FROM workspaces WHERE id = %s", (workspace_id,))
        ws = cur.fetchone()
        if ws is None:
            raise HTTPException(status_code=404, detail="Workspace not found")
        cur.execute(
            "SELECT share_token FROM workspace_shares WHERE workspace_id = %s ORDER BY created_at DESC LIMIT 1",
            (workspace_id,),
        )
        existing = cur.fetchone()
        if existing:
            token = existing["share_token"]
        else:
            token = secrets.token_urlsafe(16)
            cur.execute(
                "INSERT INTO workspace_shares (share_token, workspace_id) VALUES (%s, %s)",
                (token, workspace_id),
            )
    db.commit()
    return {"share_token": token, "workspace_id": workspace_id, "workspace_name": ws["name"]}


def get_shared_workspace(share_token: str, db) -> dict:
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT w.id, w.name, w.description, w.created_at
            FROM workspace_shares ws
            JOIN workspaces w ON ws.workspace_id = w.id
            WHERE ws.share_token = %s
            """,
            (share_token,),
        )
        ws = cur.fetchone()
        if ws is None:
            raise HTTPException(status_code=404, detail="Share link not found or expired")
        ws_id = ws["id"]
        cur.execute("SELECT * FROM nodes WHERE workspace_id = %s ORDER BY created_at ASC", (ws_id,))
        nodes = [dict(r) for r in cur.fetchall()]
        cur.execute("SELECT * FROM edges WHERE workspace_id = %s ORDER BY created_at ASC", (ws_id,))
        edges = [dict(r) for r in cur.fetchall()]
        cur.execute(
            "SELECT * FROM research_memory WHERE workspace_id = %s ORDER BY created_at DESC",
            (ws_id,),
        )
        memory = [dict(r) for r in cur.fetchall()]
    return {"workspace": dict(ws), "nodes": nodes, "edges": edges, "memory": memory}


def get_workspace_timeline(workspace_id: str, db) -> dict:
    with db.cursor() as cur:
        cur.execute(
            "SELECT id, type, title, pos_x, pos_y, created_at FROM nodes WHERE workspace_id = %s ORDER BY created_at ASC",
            (workspace_id,),
        )
        nodes = [dict(r) for r in cur.fetchall()]
        cur.execute(
            "SELECT id, source_id, target_id, label, created_at FROM edges WHERE workspace_id = %s ORDER BY created_at ASC",
            (workspace_id,),
        )
        edges = [dict(r) for r in cur.fetchall()]
        cur.execute(
            """
            SELECT l.id, l.action, l.reasoning, l.approval_status, l.created_at, a.name AS agent_name
            FROM agent_logs l
            JOIN agents a ON l.agent_id = a.id
            WHERE l.workspace_id = %s
            ORDER BY l.created_at ASC, l.id ASC
            """,
            (workspace_id,),
        )
        logs = [dict(r) for r in cur.fetchall()]
    events = []
    for n in nodes:
        events.append({"kind": "node", "id": n["id"], "title": f"[{n['type'].upper()}] {n['title']}", "ts": str(n["created_at"])})
    for l in logs:
        events.append({"kind": "log", "id": str(l["id"]), "title": f"{l['agent_name']}: {l['action']}", "ts": str(l["created_at"])})
    events.sort(key=lambda e: e["ts"])
    return {"nodes": nodes, "edges": edges, "events": events}
