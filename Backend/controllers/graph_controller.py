import json
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


def _build_workspace_snapshot(workspace_id: str, db) -> dict:
    with db.cursor() as cur:
        cur.execute(
            "SELECT id, name, description, created_at FROM workspaces WHERE id = %s",
            (workspace_id,),
        )
        ws = cur.fetchone()
        if ws is None:
            raise HTTPException(status_code=404, detail="Workspace not found")
        cur.execute(
            "SELECT * FROM nodes WHERE workspace_id = %s ORDER BY created_at ASC",
            (workspace_id,),
        )
        nodes = [dict(r) for r in cur.fetchall()]
        cur.execute(
            "SELECT * FROM edges WHERE workspace_id = %s ORDER BY created_at ASC",
            (workspace_id,),
        )
        edges = [dict(r) for r in cur.fetchall()]
        cur.execute(
            """
            SELECT l.*, a.name AS agent_name
            FROM agent_logs l
            LEFT JOIN agents a ON l.agent_id = a.id
            WHERE l.workspace_id = %s
            ORDER BY l.created_at ASC, l.id ASC
            """,
            (workspace_id,),
        )
        agent_logs = [dict(r) for r in cur.fetchall()]
        cur.execute(
            "SELECT * FROM research_memory WHERE workspace_id = %s ORDER BY created_at DESC",
            (workspace_id,),
        )
        memory = [dict(r) for r in cur.fetchall()]

    return {
        "workspace": dict(ws),
        "nodes": nodes,
        "edges": edges,
        "agent_logs": agent_logs,
        "memory": memory,
    }


def create_workspace_share(
    workspace_id: str,
    role: str,
    db,
    refresh: bool = False,
    current_user: dict | None = None,
) -> dict:
    clean_role = role if role in ("snapshot", "viewer", "editor") else "snapshot"
    with db.cursor() as cur:
        cur.execute("SELECT id, name FROM workspaces WHERE id = %s", (workspace_id,))
        ws = cur.fetchone()
        if ws is None:
            raise HTTPException(status_code=404, detail="Workspace not found")

        if not refresh:
            cur.execute(
                """
                SELECT share_token, role, snapshot_json, shared_by_name, created_at
                FROM workspace_shares
                WHERE workspace_id = %s AND role = %s AND snapshot_json IS NOT NULL
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (workspace_id, clean_role),
            )
            existing = cur.fetchone()
            if existing:
                snap = json.loads(existing["snapshot_json"])
                return {
                    "share_token": existing["share_token"],
                    "role": existing["role"],
                    "workspace_id": workspace_id,
                    "workspace_name": ws["name"],
                    "shared_by_name": existing.get("shared_by_name") or "",
                    "snapshot_node_count": len(snap.get("nodes") or []),
                    "snapshot_log_count": len(snap.get("agent_logs") or []),
                    "created_at": str(existing["created_at"]),
                }

    snapshot = _build_workspace_snapshot(workspace_id, db)
    token = secrets.token_urlsafe(16)
    shared_by_name = (current_user or {}).get("name") or ""
    with db.cursor() as cur:
        cur.execute(
            """
            INSERT INTO workspace_shares (share_token, workspace_id, role, snapshot_json, shared_by_name)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING created_at
            """,
            (token, workspace_id, clean_role, json.dumps(snapshot, default=str), shared_by_name),
        )
        row = cur.fetchone()
    db.commit()
    return {
        "share_token": token,
        "role": clean_role,
        "workspace_id": workspace_id,
        "workspace_name": ws["name"],
        "shared_by_name": shared_by_name,
        "snapshot_node_count": len(snapshot["nodes"]),
        "snapshot_log_count": len(snapshot["agent_logs"]),
        "created_at": str(row["created_at"]),
    }


def get_shared_workspace(share_token: str, db) -> dict:
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT ws.share_token, ws.workspace_id, ws.role, ws.snapshot_json, ws.shared_by_name, ws.created_at AS shared_at,
                   w.id AS live_id, w.name AS live_name, w.description AS live_description, w.created_at AS live_created_at
            FROM workspace_shares ws
            LEFT JOIN workspaces w ON ws.workspace_id = w.id
            WHERE ws.share_token = %s
            """,
            (share_token,),
        )
        row = cur.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Share link not found or expired")

    snapshot_raw = row.get("snapshot_json")
    if snapshot_raw:
        snap = json.loads(snapshot_raw)
        return {
            "workspace": snap.get("workspace") or {"id": row["workspace_id"], "name": row.get("live_name") or "Shared Research"},
            "role": "snapshot",
            "shared_by_name": row.get("shared_by_name") or "",
            "shared_at": str(row.get("shared_at") or ""),
            "nodes": snap.get("nodes") or [],
            "edges": snap.get("edges") or [],
            "agent_logs": snap.get("agent_logs") or [],
            "memory": snap.get("memory") or [],
        }

    if not row.get("live_id"):
        raise HTTPException(status_code=404, detail="Shared workspace no longer exists")

    snap = _build_workspace_snapshot(row["live_id"], db)
    return {
        "workspace": snap["workspace"],
        "role": "snapshot",
        "shared_by_name": row.get("shared_by_name") or "",
        "shared_at": str(row.get("shared_at") or ""),
        "nodes": snap["nodes"],
        "edges": snap["edges"],
        "agent_logs": snap["agent_logs"],
        "memory": snap["memory"],
    }


def continue_shared_workspace(share_token: str, current_user: dict, db) -> dict:
    """Clone a shared workspace snapshot into a new independent workspace owned by current_user."""
    shared = get_shared_workspace(share_token, db)
    src_ws = shared.get("workspace") or {}
    base_name = (src_ws.get("name") or "Shared Research").strip()
    new_name = base_name if base_name.endswith("(Copy)") else f"{base_name} (Copy)"
    new_desc = src_ws.get("description") or ""
    new_ws_id = uuid.uuid4().hex

    src_nodes = shared.get("nodes") or []
    src_edges = shared.get("edges") or []
    src_logs = shared.get("agent_logs") or []
    src_memory = shared.get("memory") or []

    node_id_map = {n["id"]: uuid.uuid4().hex for n in src_nodes if n.get("id")}

    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO workspaces (id, name, description, user_id) VALUES (%s, %s, %s, %s)",
            (new_ws_id, new_name, new_desc, current_user["id"]),
        )

        # Insert nodes without group_id first so self-referential group_id updates never fail order checks
        for n in src_nodes:
            old_id = n.get("id")
            if old_id not in node_id_map:
                continue
            cur.execute(
                """
                INSERT INTO nodes (id, workspace_id, type, title, url, content, metadata_json, tags_json, group_id, pos_x, pos_y)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NULL, %s, %s)
                """,
                (
                    node_id_map[old_id],
                    new_ws_id,
                    n.get("type") or "note",
                    n.get("title") or "Untitled",
                    n.get("url") or "",
                    n.get("content") or "",
                    n.get("metadata_json") or "{}",
                    n.get("tags_json") or "[]",
                    float(n.get("pos_x") or 0.0),
                    float(n.get("pos_y") or 0.0),
                ),
            )

        for n in src_nodes:
            old_id = n.get("id")
            old_group = n.get("group_id")
            if old_id in node_id_map and old_group and old_group in node_id_map:
                cur.execute(
                    "UPDATE nodes SET group_id = %s WHERE id = %s",
                    (node_id_map[old_group], node_id_map[old_id]),
                )

        for e in src_edges:
            new_src = node_id_map.get(e.get("source_id"))
            new_tgt = node_id_map.get(e.get("target_id"))
            if not new_src or not new_tgt:
                continue
            cur.execute(
                """
                INSERT INTO edges (id, workspace_id, source_id, target_id, label, is_ai_suggested, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    uuid.uuid4().hex,
                    new_ws_id,
                    new_src,
                    new_tgt,
                    e.get("label") or "",
                    bool(e.get("is_ai_suggested", False)),
                    e.get("status") or "accepted",
                ),
            )

        cur.execute("SELECT id FROM agents")
        valid_agent_ids = {r["id"] for r in cur.fetchall()}

        for log in src_logs:
            agent_id = log.get("agent_id")
            if agent_id not in valid_agent_ids:
                agent_id = "agent_planner" if "agent_planner" in valid_agent_ids else next(iter(valid_agent_ids), None)
            if not agent_id:
                continue
            mapped_node_id = node_id_map.get(log.get("node_id"))
            cur.execute(
                """
                INSERT INTO agent_logs (workspace_id, agent_id, node_id, action, reasoning, payload_json, approval_status)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    new_ws_id,
                    agent_id,
                    mapped_node_id,
                    log.get("action") or "",
                    log.get("reasoning") or "",
                    log.get("payload_json") or "{}",
                    log.get("approval_status") or "auto",
                ),
            )

        for mem in src_memory:
            mapped_exp_id = node_id_map.get(mem.get("experiment_node_id"))
            if not mapped_exp_id:
                continue
            agent_id = mem.get("agent_id")
            if agent_id and agent_id not in valid_agent_ids:
                agent_id = None
            cur.execute(
                """
                INSERT INTO research_memory (workspace_id, experiment_node_id, agent_id, outcome, error_signature, resolution)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    new_ws_id,
                    mapped_exp_id,
                    agent_id,
                    mem.get("outcome") or "success",
                    mem.get("error_signature") or "",
                    mem.get("resolution") or "",
                ),
            )

        if "agent_planner" in valid_agent_ids:
            cur.execute(
                """
                INSERT INTO agent_logs (workspace_id, agent_id, action, reasoning, approval_status)
                VALUES (%s, 'agent_planner', %s, %s, 'auto')
                """,
                (
                    new_ws_id,
                    f"[CONTINUED COPY] Cloned '{base_name}'",
                    f"Created an independent copy in {current_user['name']}'s account from shared snapshot.",
                ),
            )

    db.commit()
    return {
        "workspace_id": new_ws_id,
        "name": new_name,
        "nodes_copied": len(node_id_map),
        "edges_copied": len(src_edges),
        "logs_copied": len(src_logs),
    }


def join_shared_workspace(share_token: str, current_user: dict, db) -> dict:
    with db.cursor() as cur:
        cur.execute(
            "SELECT workspace_id, role FROM workspace_shares WHERE share_token = %s",
            (share_token,),
        )
        share = cur.fetchone()
        if share is None:
            raise HTTPException(status_code=404, detail="Share link not found")
        cur.execute(
            """
            INSERT INTO workspace_collaborators (workspace_id, user_email, role)
            VALUES (%s, %s, %s)
            ON CONFLICT (workspace_id, user_email) DO UPDATE SET role = EXCLUDED.role
            """,
            (share["workspace_id"], current_user["email"].lower(), share["role"]),
        )
    db.commit()
    return {"workspace_id": share["workspace_id"], "role": share["role"]}


def invite_collaborator(workspace_id: str, email: str, role: str, db) -> dict:
    clean_email = email.strip().lower()
    if not clean_email or "@" not in clean_email:
        raise HTTPException(status_code=400, detail="Valid collaborator email is required")
    clean_role = role if role in ("viewer", "editor") else "editor"
    with db.cursor() as cur:
        cur.execute(
            """
            INSERT INTO workspace_collaborators (workspace_id, user_email, role)
            VALUES (%s, %s, %s)
            ON CONFLICT (workspace_id, user_email) DO UPDATE SET role = EXCLUDED.role
            RETURNING *
            """,
            (workspace_id, clean_email, clean_role),
        )
        row = cur.fetchone()
    db.commit()
    return dict(row)


def list_collaborators(workspace_id: str, db) -> list[dict]:
    with db.cursor() as cur:
        cur.execute(
            "SELECT id, workspace_id, user_email, role, created_at FROM workspace_collaborators WHERE workspace_id = %s ORDER BY created_at DESC",
            (workspace_id,),
        )
        return [dict(r) for r in cur.fetchall()]


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
