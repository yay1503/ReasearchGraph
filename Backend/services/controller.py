import json
import uuid

from fastapi import HTTPException

from core.llm import call_llm_json
from services.harness import run_agent_harness

CORE_AGENT_IDS = {
    "agent_reader",
    "agent_clusterer",
    "agent_coder",
    "agent_debugger",
    "agent_planner",
}


def create_specialist_agent(name: str, role: str, db) -> dict:
    clean_name = name.strip()
    clean_role = role.strip().lower().replace(" ", "_")
    if not clean_name or not clean_role:
        raise HTTPException(status_code=400, detail="Agent name and role are required")
    agent_id = f"agent_{uuid.uuid4().hex[:8]}"
    with db.cursor() as cur:
        cur.execute(
            """
            INSERT INTO agents (id, name, role, status, rating_score, tasks_completed, is_active)
            VALUES (%s, %s, %s, 'idle', 1.0, 0, TRUE)
            RETURNING *
            """,
            (agent_id, clean_name, clean_role),
        )
        row = cur.fetchone()
    db.commit()
    return dict(row)


def set_agent_active(agent_id: str, active: bool, db) -> dict:
    with db.cursor() as cur:
        cur.execute(
            "UPDATE agents SET is_active = %s, status = 'idle' WHERE id = %s RETURNING *",
            (active, agent_id),
        )
        row = cur.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Agent not found")
    db.commit()
    return dict(row)


def rate_agent_score(agent_id: str, delta: float, db) -> dict:
    clamped_delta = max(-1.0, min(1.0, float(delta)))
    with db.cursor() as cur:
        cur.execute("SELECT * FROM agents WHERE id = %s", (agent_id,))
        existing = cur.fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail="Agent not found")

        new_score = round(max(0.1, min(5.0, float(existing["rating_score"]) + clamped_delta)), 2)
        auto_retire = (
            existing["is_active"]
            and new_score < 0.6
            and agent_id not in CORE_AGENT_IDS
        )
        next_active = False if auto_retire else existing["is_active"]

        cur.execute(
            "UPDATE agents SET rating_score = %s, is_active = %s WHERE id = %s RETURNING *",
            (new_score, next_active, agent_id),
        )
        updated = cur.fetchone()
    db.commit()
    result = dict(updated)
    result["auto_retired"] = auto_retire
    return result


async def dispatch_with_controller(
    workspace_id: str,
    goal: str,
    db,
    llm_config: dict | None = None,
    auto_approve: bool = False,
) -> dict:
    """
    Dynamic Agent Controller:
    1. Evaluates active agents by role and rating_score.
    2. Picks the best-suited high-rated agent, or dynamically spawns a new specialist.
    3. Optionally retires low-scoring idle specialists (< 0.6).
    4. Delegates execution to the JSON Agent Harness and records controller routing.
    """
    with db.cursor() as cur:
        cur.execute(
            "SELECT id, name, role, status, rating_score, tasks_completed, is_active FROM agents ORDER BY is_active DESC, rating_score DESC"
        )
        all_agents = [dict(r) for r in cur.fetchall()]

    active_agents = [a for a in all_agents if a["is_active"]]
    roster_json = json.dumps(active_agents, indent=2)

    controller_prompt = f"""You are the ResearchGraph Agent Controller.
User Goal: "{goal}"

Active Agents (sorted by rating_score):
{roster_json}

Decide whether to:
1. Route this goal to the best existing active agent (prefer higher rating_score), OR
2. Spawn a new specialist agent if the goal needs a dedicated role not well-covered (e.g., "Dataset Curator", "Citation Verifier", "Benchmark Analyst").

Return ONLY valid JSON:
{{
  "decision": "select_existing" or "spawn_specialist",
  "selected_agent_id": "<id of existing agent if select_existing, else null>",
  "spawn_agent": {{"name": "<Specialist Name>", "role": "<short_role>"}} or null,
  "reasoning": "One short sentence explaining why this agent was chosen or created."
}}"""

    chosen_agent = active_agents[0] if active_agents else None
    spawned = None
    controller_reason = "Routed to highest-rated active agent."

    try:
        plan = await call_llm_json(controller_prompt, config=llm_config, timeout=30.0)
        controller_reason = str(plan.get("reasoning") or controller_reason)
        if plan.get("decision") == "spawn_specialist" and isinstance(plan.get("spawn_agent"), dict):
            s_name = str(plan["spawn_agent"].get("name") or "").strip()
            s_role = str(plan["spawn_agent"].get("role") or "specialist").strip()
            if s_name:
                spawned = create_specialist_agent(s_name, s_role, db)
                chosen_agent = spawned
        elif plan.get("selected_agent_id"):
            match = next((a for a in active_agents if a["id"] == plan["selected_agent_id"]), None)
            if match:
                chosen_agent = match
    except Exception:
        # Deterministic fallback: pick highest-rated active agent
        if active_agents:
            chosen_agent = max(active_agents, key=lambda a: (a["rating_score"], a["tasks_completed"]))

    # Retire any non-core specialist below 0.6 rating
    retired_ids = []
    with db.cursor() as cur:
        for ag in active_agents:
            if ag["id"] not in CORE_AGENT_IDS and float(ag["rating_score"]) < 0.6:
                cur.execute("UPDATE agents SET is_active = FALSE WHERE id = %s", (ag["id"],))
                retired_ids.append(ag["id"])

        cur.execute(
            """
            INSERT INTO agent_logs (workspace_id, agent_id, action, reasoning, approval_status)
            VALUES (%s, %s, %s, %s, 'auto')
            """,
            (
                workspace_id,
                chosen_agent["id"] if chosen_agent else "agent_planner",
                (
                    f"[CONTROLLER SPAWNED] {chosen_agent['name']} ({chosen_agent['role']})"
                    if spawned
                    else f"[CONTROLLER ROUTED] → {chosen_agent['name']} (★ {chosen_agent['rating_score']:.1f})"
                ),
                controller_reason,
            ),
        )
    db.commit()

    harness_res = await run_agent_harness(
        workspace_id,
        goal,
        db,
        llm_config=llm_config,
        auto_approve=auto_approve,
    )

    return {
        "controller": {
            "chosen_agent": chosen_agent,
            "spawned": spawned,
            "retired_ids": retired_ids,
            "reasoning": controller_reason,
        },
        **harness_res,
    }
