import json

from fastapi import HTTPException, Request, UploadFile

from core.llm import DEFAULT_MODELS, call_llm
from models.schemas import (
    AgentCreateRequest,
    AgentRateRequest,
    ControllerDispatchRequest,
    FetchUrlRequest,
    HarnessRequest,
    LLMTestRequest,
    LogDecision,
    WhatIfRequest,
)
from services.agents import (
    execute_experiment_with_debugger,
    request_experiment_approval,
    run_reader_and_clusterer,
    run_what_if_experiment,
)
from services.controller import (
    create_specialist_agent,
    dispatch_with_controller,
    rate_agent_score,
    set_agent_active,
)
from services.harness import execute_harness_action, run_agent_harness
from services.sandbox import (
    get_workspace_memory,
    run_general_experiment,
    suggest_next_experiments,
)
from services.tools import extract_pdf_upload, fetch_url


def extract_llm_config(request: Request) -> dict:
    return {
        "provider": (request.headers.get("X-LLM-Provider") or "ollama").strip().lower(),
        "model": (request.headers.get("X-LLM-Model") or "").strip(),
        "api_key": (request.headers.get("X-LLM-API-Key") or "").strip(),
    }


def list_all_agents(db) -> list[dict]:
    with db.cursor() as cur:
        cur.execute("SELECT * FROM agents ORDER BY is_active DESC, rating_score DESC, created_at ASC")
        return [dict(row) for row in cur.fetchall()]


def spawn_agent(body: AgentCreateRequest, db) -> dict:
    return create_specialist_agent(body.name, body.role, db)


def retire_agent(agent_id: str, db) -> dict:
    return set_agent_active(agent_id, False, db)


def reactivate_agent(agent_id: str, db) -> dict:
    return set_agent_active(agent_id, True, db)


def rate_agent(agent_id: str, body: AgentRateRequest, db) -> dict:
    return rate_agent_score(agent_id, body.delta, db)


async def controller_dispatch(
    workspace_id: str,
    body: ControllerDispatchRequest,
    llm_config: dict,
    db,
) -> dict:
    return await dispatch_with_controller(
        workspace_id,
        body.goal,
        db,
        llm_config=llm_config,
        auto_approve=body.auto_approve,
    )


def list_workspace_logs(workspace_id: str, db) -> list[dict]:
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


async def test_llm(body: LLMTestRequest) -> dict:
    config = {
        "provider": (body.provider or "ollama").strip().lower(),
        "model": (body.model or "").strip(),
        "api_key": (body.api_key or "").strip(),
    }
    try:
        reply = await call_llm("Reply with OK", config=config, timeout=20.0)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {
        "ok": True,
        "provider": config["provider"],
        "model": config["model"] or DEFAULT_MODELS.get(config["provider"], ""),
        "reply": reply.strip()[:80],
    }


async def process_log_decision(
    log_id: int,
    body: LogDecision,
    llm_config: dict,
    db,
) -> dict:
    with db.cursor() as cur:
        cur.execute(
            "SELECT workspace_id, agent_id, approval_status, payload_json FROM agent_logs WHERE id = %s",
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
            "UPDATE agent_logs SET approval_status = %s, reasoning = CASE WHEN %s <> '' THEN reasoning || ' | User feedback: ' || %s ELSE reasoning END WHERE id = %s AND approval_status = 'pending'",
            (body.decision, body.feedback.strip(), body.feedback.strip(), log_id),
        )
        if cur.rowcount == 0:
            db.rollback()
            return {"status": "already_processed", "log_id": log_id, "already_processed": True}

        cur.execute("UPDATE agents SET status = 'idle' WHERE id = %s", (log_row["agent_id"],))
    db.commit()

    if body.decision == "redirected" and body.feedback.strip():
        redirect_res = await run_agent_harness(
            log_row["workspace_id"],
            f"User redirected previous action with feedback: {body.feedback.strip()}",
            db,
            llm_config=llm_config,
            auto_approve=False,
        )
        return {"status": "redirected", "log_id": log_id, "redirect": redirect_res}

    if body.decision == "approved":
        payload = {}
        try:
            payload = json.loads(log_row.get("payload_json") or "{}")
        except Exception:
            payload = {}

        if isinstance(payload, dict) and payload.get("tool"):
            try:
                exec_res = await execute_harness_action(log_row["workspace_id"], payload, db)
                return {"status": body.decision, "log_id": log_id, "executed": exec_res}
            except Exception as exc:
                raise HTTPException(status_code=400, detail=str(exc))

        if log_row["agent_id"] == "agent_coder":
            await execute_experiment_with_debugger(
                log_row["workspace_id"], db, llm_config=llm_config
            )

    return {"status": body.decision, "log_id": log_id}


async def fetch_external_url(body: FetchUrlRequest) -> dict:
    try:
        return await fetch_url(body.url)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


async def analyze_workspace_sources(workspace_id: str, llm_config: dict, db) -> dict:
    return await run_reader_and_clusterer(workspace_id, db, llm_config=llm_config)


async def request_reproduction_experiment(workspace_id: str, db) -> dict:
    return await request_experiment_approval(workspace_id, db)


async def run_what_if(workspace_id: str, body: WhatIfRequest, llm_config: dict, db) -> dict:
    return await run_what_if_experiment(
        workspace_id, body.question, db, llm_config=llm_config
    )


async def run_harness(workspace_id: str, body: HarnessRequest, llm_config: dict, db) -> dict:
    return await run_agent_harness(
        workspace_id,
        body.goal,
        db,
        llm_config=llm_config,
        auto_approve=body.auto_approve,
    )


async def upload_pdf_file(file: UploadFile) -> dict:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Please upload a .pdf file")
    content = await file.read()
    try:
        return extract_pdf_upload(content, file.filename)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read PDF: {exc}")


def set_agent_paused(agent_id: str, paused: bool, db) -> dict:
    status = "paused" if paused else "idle"
    with db.cursor() as cur:
        cur.execute("UPDATE agents SET status = %s WHERE id = %s RETURNING *", (status, agent_id))
        row = cur.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Agent not found")
    db.commit()
    return dict(row)


async def run_sandbox_experiment(workspace_id: str, goal: str, llm_config: dict, db) -> dict:
    return await run_general_experiment(workspace_id, goal, db, llm_config=llm_config)


async def get_next_experiment_suggestions(workspace_id: str, llm_config: dict, db) -> dict:
    return await suggest_next_experiments(workspace_id, db, llm_config=llm_config)


def list_workspace_memory(workspace_id: str, db) -> list[dict]:
    return get_workspace_memory(workspace_id, db)
