import json
import uuid

from core.llm import call_llm_json
from core.ws import ws_manager
from services.agents import get_free_position
from services.tools import fetch_url, search_arxiv, search_github, web_search

ALLOWED_NODE_TYPES = {
    "paper",
    "question",
    "dataset",
    "code",
    "experiment",
    "result",
    "error_fix",
    "note",
    "group",
}

READ_TOOLS = {
    "fetch_url": fetch_url,
    "search_arxiv": search_arxiv,
    "search_github": search_github,
    "web_search": web_search,
}

MUTATION_TOOLS = {
    "create_node",
    "update_node",
    "connect_nodes",
    "delete_node",
    "delete_edge",
}


def _snapshot_graph(workspace_id: str, db) -> dict:
    with db.cursor() as cur:
        cur.execute(
            "SELECT id, type, title, url, content, tags_json FROM nodes WHERE workspace_id = %s ORDER BY created_at ASC",
            (workspace_id,),
        )
        nodes = [dict(r) for r in cur.fetchall()]
        cur.execute(
            "SELECT id, source_id, target_id, label, status FROM edges WHERE workspace_id = %s",
            (workspace_id,),
        )
        edges = [dict(r) for r in cur.fetchall()]

    compact_nodes = [
        {
            "id": n["id"],
            "type": n["type"],
            "title": n["title"],
            "url": n.get("url") or "",
            "content": (n.get("content") or "")[:400],
        }
        for n in nodes
    ]
    return {"nodes": compact_nodes, "edges": edges}


def _format_action_label(tool: str, args: dict) -> str:
    if tool == "create_node":
        ntype = args.get("type", "note").upper()
        title = args.get("title", "Untitled")
        return f"[CREATE {ntype}] {title}"
    if tool == "update_node":
        return f"[UPDATE NODE] {args.get('node_id', '')[:8]} — {args.get('title') or 'Edit content/note'}"
    if tool == "connect_nodes":
        return f"[CONNECT] {args.get('source_id', '')[:6]} --({args.get('label', 'relates_to')})--> {args.get('target_id', '')[:6]}"
    if tool == "delete_node":
        return f"[DELETE NODE] {args.get('node_id', '')}"
    if tool == "delete_edge":
        return f"[DELETE EDGE] {args.get('edge_id', '')}"
    return f"[{tool.upper()}]"


async def execute_harness_action(workspace_id: str, payload: dict, db) -> dict:
    """Execute a validated JSON canvas mutation action against PostgreSQL."""
    tool = payload.get("tool")
    args = payload.get("args") or {}
    if tool not in MUTATION_TOOLS:
        raise ValueError(f"Unsupported harness action: {tool}")

    if tool == "create_node":
        node_id = uuid.uuid4().hex
        node_type = str(args.get("type") or "note").lower()
        if node_type not in ALLOWED_NODE_TYPES:
            node_type = "note"
        title = str(args.get("title") or "Untitled Note").strip()[:240]
        url = str(args.get("url") or "").strip()
        content = str(args.get("content") or "").strip()
        tags = args.get("tags") if isinstance(args.get("tags"), list) else []
        pos_x, pos_y = await get_free_position(workspace_id, 140, 140, db)

        with db.cursor() as cur:
            cur.execute(
                """
                INSERT INTO nodes (id, workspace_id, type, title, url, content, tags_json, pos_x, pos_y)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    node_id,
                    workspace_id,
                    node_type,
                    title,
                    url,
                    content,
                    json.dumps(tags),
                    pos_x,
                    pos_y,
                ),
            )

            connect_to = args.get("connect_to_id")
            if connect_to:
                cur.execute(
                    "SELECT id FROM nodes WHERE id = %s AND workspace_id = %s",
                    (connect_to, workspace_id),
                )
                if cur.fetchone() is not None:
                    cur.execute(
                        """
                        INSERT INTO edges (id, workspace_id, source_id, target_id, label, is_ai_suggested, status)
                        VALUES (%s, %s, %s, %s, %s, TRUE, 'accepted')
                        """,
                        (
                            uuid.uuid4().hex,
                            workspace_id,
                            connect_to,
                            node_id,
                            str(args.get("edge_label") or "relates_to"),
                        ),
                    )
        db.commit()
        return {"tool": tool, "node_id": node_id, "title": title}

    if tool == "update_node":
        node_id = str(args.get("node_id") or "").strip()
        if not node_id:
            raise ValueError("node_id is required for update_node")
        with db.cursor() as cur:
            cur.execute(
                "SELECT title, url, content, tags_json FROM nodes WHERE id = %s AND workspace_id = %s",
                (node_id, workspace_id),
            )
            existing = cur.fetchone()
            if existing is None:
                raise ValueError(f"Node '{node_id}' not found")

            new_title = str(args["title"]).strip() if args.get("title") else existing["title"]
            new_url = str(args["url"]).strip() if args.get("url") is not None else existing["url"]
            new_content = existing["content"] or ""
            if args.get("content") is not None:
                new_content = str(args["content"])
            elif args.get("append_note"):
                note_text = str(args["append_note"]).strip()
                new_content = f"{new_content}\n\n[Agent Note] {note_text}".strip()

            new_tags = (
                json.dumps(args["tags"])
                if isinstance(args.get("tags"), list)
                else existing["tags_json"]
            )
            cur.execute(
                """
                UPDATE nodes
                SET title = %s, url = %s, content = %s, tags_json = %s
                WHERE id = %s AND workspace_id = %s
                """,
                (new_title, new_url, new_content, new_tags, node_id, workspace_id),
            )
        db.commit()
        return {"tool": tool, "node_id": node_id}

    if tool == "connect_nodes":
        src = str(args.get("source_id") or "").strip()
        tgt = str(args.get("target_id") or "").strip()
        label = str(args.get("label") or "relates_to").strip()
        if not src or not tgt:
            raise ValueError("source_id and target_id are required")
        edge_id = uuid.uuid4().hex
        with db.cursor() as cur:
            cur.execute(
                "SELECT id FROM nodes WHERE workspace_id = %s AND id IN (%s, %s)",
                (workspace_id, src, tgt),
            )
            found = {r["id"] for r in cur.fetchall()}
            if src not in found or tgt not in found:
                raise ValueError("One or both nodes do not exist in this workspace")
            cur.execute(
                """
                INSERT INTO edges (id, workspace_id, source_id, target_id, label, is_ai_suggested, status)
                VALUES (%s, %s, %s, %s, %s, TRUE, 'accepted')
                """,
                (edge_id, workspace_id, src, tgt, label),
            )
        db.commit()
        return {"tool": tool, "edge_id": edge_id}

    if tool == "delete_node":
        node_id = str(args.get("node_id") or "").strip()
        with db.cursor() as cur:
            cur.execute(
                "DELETE FROM nodes WHERE id = %s AND workspace_id = %s",
                (node_id, workspace_id),
            )
        db.commit()
        return {"tool": tool, "deleted_node_id": node_id}

    if tool == "delete_edge":
        edge_id = str(args.get("edge_id") or "").strip()
        with db.cursor() as cur:
            cur.execute(
                "DELETE FROM edges WHERE id = %s AND workspace_id = %s",
                (edge_id, workspace_id),
            )
        db.commit()
        return {"tool": tool, "deleted_edge_id": edge_id}

    raise ValueError(f"Unhandled tool: {tool}")


async def _run_read_tool(tool_name: str, args: dict) -> dict:
    try:
        if tool_name == "fetch_url":
            return await fetch_url(str(args.get("url") or ""))
        if tool_name == "search_arxiv":
            return {"results": await search_arxiv(str(args.get("query") or ""), max_results=4)}
        if tool_name == "search_github":
            return {"results": await search_github(str(args.get("query") or ""), max_results=4)}
        if tool_name == "web_search":
            return {"results": await web_search(str(args.get("query") or ""), max_results=4)}
        return {"error": f"Unknown read tool '{tool_name}'"}
    except Exception as exc:
        return {"error": str(exc)}


async def run_agent_harness(
    workspace_id: str,
    goal: str,
    db,
    llm_config: dict | None = None,
    auto_approve: bool = False,
) -> dict:
    """
    Structured JSON Agent Harness:
    1. Reads current workspace graph.
    2. Loops up to 3 steps allowing the LLM to invoke internet/read tools
       (fetch_url, search_arxiv, search_github, web_search).
    3. Collects proposed canvas mutations (create_node, update_node, connect_nodes,
       delete_node, delete_edge) and either queues them for user Accept/Reject
       or executes them immediately if auto_approve=True.
    """
    cleaned_goal = (goal or "").strip()
    if not cleaned_goal:
        return {"error": "Goal prompt cannot be empty."}

    with db.cursor() as cur:
        cur.execute("UPDATE agents SET status = 'working' WHERE id = 'agent_planner'")
    db.commit()

    tool_observations = []
    proposed_actions = []
    final_thought = ""

    system_prompt = """You are the ResearchGraph Agent Harness.
You act like a research collaborator on a node-graph canvas and have access to internet tools + canvas mutation tools.
You MUST reply ONLY with valid JSON matching this exact schema:
{
  "thought": "Brief 1-sentence reasoning",
  "read_tools": [
    {"tool": "fetch_url|search_arxiv|search_github|web_search", "args": {"url": "..." } or {"query": "..."}}
  ],
  "proposed_actions": [
    {
      "tool": "create_node|update_node|connect_nodes|delete_node|delete_edge",
      "args": { ... },
      "reason": "Why this action helps the user's goal"
    }
  ],
  "done": true
}

Tool argument schemas:
- Read tools (execute immediately so you can see results on the next step):
  - fetch_url: {"url": "https://arxiv.org/... or https://github.com/... or any https://..."}
  - search_arxiv: {"query": "search keywords"}
  - search_github: {"query": "search keywords"}
  - web_search: {"query": "search keywords"}
- Canvas mutation tools (require user Accept/Reject unless auto-approved):
  - create_node: {"type": "paper|question|dataset|code|note|experiment|result|error_fix", "title": "...", "url": "...", "content": "...", "tags": ["..."], "connect_to_id": "optional existing node id", "edge_label": "optional label"}
  - update_node: {"node_id": "existing node id", "title": "optional", "content": "optional full replace", "append_note": "optional note to append", "tags": ["optional"]}
  - connect_nodes: {"source_id": "node id", "target_id": "node id", "label": "e.g. cites, uses_dataset, answers"}
  - delete_node: {"node_id": "existing node id"}
  - delete_edge: {"edge_id": "existing edge id"}

Rules:
- If the user mentions a paper, repo, topic, or URL you haven't fetched yet, call read_tools first with "done": false and "proposed_actions": [].
- Once you have the facts, propose concrete canvas mutations in "proposed_actions" and set "done": true.
- Never invent fake node IDs; only reference IDs present in the Workspace Graph."""

    try:
        for _step in range(3):
            graph = _snapshot_graph(workspace_id, db)
            obs_block = (
                json.dumps(tool_observations, indent=2)
                if tool_observations
                else "None yet."
            )
            prompt = (
                f"USER GOAL:\n{cleaned_goal}\n\n"
                f"CURRENT WORKSPACE GRAPH:\n{json.dumps(graph, indent=2)}\n\n"
                f"INTERNET TOOL OBSERVATIONS SO FAR:\n{obs_block}\n\n"
                f"Return your next JSON response."
            )
            reply = await call_llm_json(
                prompt,
                system_prompt=system_prompt,
                config=llm_config,
            )
            final_thought = str(reply.get("thought") or "").strip()

            read_calls = reply.get("read_tools") or []
            if isinstance(read_calls, list) and read_calls:
                for idx_c, call in enumerate(read_calls[:3]):
                    t_name = str(call.get("tool") or "").strip()
                    t_args = call.get("args") or {}
                    if t_name in READ_TOOLS:
                        await ws_manager.broadcast(
                            workspace_id,
                            {
                                "event": "cursor_move",
                                "agent_id": "agent_planner",
                                "agent_name": "Harness Agent",
                                "x": 180.0 + idx_c * 140.0,
                                "y": 140.0,
                                "label": f"Internet: {t_name}",
                            },
                        )
                        res = await _run_read_tool(t_name, t_args)
                        tool_observations.append(
                            {"tool": t_name, "args": t_args, "output": res}
                        )
                        with db.cursor() as cur:
                            cur.execute(
                                """
                                INSERT INTO agent_logs (workspace_id, agent_id, action, reasoning, approval_status)
                                VALUES (%s, 'agent_planner', %s, %s, 'auto')
                                """,
                                (
                                    workspace_id,
                                    f"[INTERNET: {t_name}] {json.dumps(t_args)[:120]}",
                                    final_thought or "Fetched external context from the internet.",
                                ),
                            )
                        db.commit()

            actions = reply.get("proposed_actions") or []
            if isinstance(actions, list) and actions:
                for act in actions:
                    if str(act.get("tool") or "") in MUTATION_TOOLS:
                        proposed_actions.append(act)

            if reply.get("done") or proposed_actions or not read_calls:
                break

        queued_logs = []
        executed = []
        for act in proposed_actions:
            tool_name = str(act.get("tool"))
            args = act.get("args") or {}
            reason = str(act.get("reason") or final_thought or "Proposed by Agent Harness.")
            action_label = _format_action_label(tool_name, args)
            payload = {"tool": tool_name, "args": args}

            if auto_approve:
                res = await execute_harness_action(workspace_id, payload, db)
                executed.append(res)
                with db.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO agent_logs (workspace_id, agent_id, node_id, action, reasoning, payload_json, approval_status)
                        VALUES (%s, 'agent_planner', %s, %s, %s, %s, 'approved')
                        RETURNING id
                        """,
                        (
                            workspace_id,
                            res.get("node_id"),
                            action_label,
                            reason,
                            json.dumps(payload),
                        ),
                    )
                    log_id = cur.fetchone()["id"]
                queued_logs.append({"id": log_id, "status": "approved", "action": action_label})
            else:
                with db.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO agent_logs (workspace_id, agent_id, action, reasoning, payload_json, approval_status)
                        VALUES (%s, 'agent_planner', %s, %s, %s, 'pending')
                        RETURNING id
                        """,
                        (
                            workspace_id,
                            action_label,
                            reason,
                            json.dumps(payload),
                        ),
                    )
                    log_id = cur.fetchone()["id"]
                queued_logs.append({"id": log_id, "status": "pending", "action": action_label})

        with db.cursor() as cur:
            cur.execute(
                """
                UPDATE agents
                SET status = %s, tasks_completed = tasks_completed + 1
                WHERE id = 'agent_planner'
                """,
                ("waiting_approval" if (queued_logs and not auto_approve) else "idle",),
            )
        db.commit()

        await ws_manager.broadcast(
            workspace_id,
            {
                "event": "graph_updated",
                "workspace_id": workspace_id,
                "agent_id": "agent_planner",
            },
        )

        return {
            "status": "completed",
            "thought": final_thought,
            "internet_calls": len(tool_observations),
            "proposed_count": len(queued_logs),
            "executed": executed,
            "logs": queued_logs,
        }
    except Exception as exc:
        with db.cursor() as cur:
            cur.execute("UPDATE agents SET status = 'idle' WHERE id = 'agent_planner'")
        db.commit()
        return {"error": str(exc)}
