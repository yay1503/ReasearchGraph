from fastapi import APIRouter, Depends, File, UploadFile

from controllers.agent_controller import (
    analyze_workspace_sources,
    controller_dispatch,
    extract_llm_config,
    fetch_external_url,
    get_next_experiment_suggestions,
    list_all_agents,
    list_workspace_logs,
    list_workspace_memory,
    process_log_decision,
    rate_agent,
    reactivate_agent,
    request_reproduction_experiment,
    retire_agent,
    run_harness,
    run_sandbox_experiment,
    run_what_if,
    set_agent_paused,
    spawn_agent,
    test_llm,
    upload_pdf_file,
)
from core.db import get_db
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

router = APIRouter(tags=["agents"])


@router.get("/agents")
async def list_agents(db=Depends(get_db)):
    return list_all_agents(db)


@router.post("/agents")
async def create_agent_endpoint(body: AgentCreateRequest, db=Depends(get_db)):
    return spawn_agent(body, db)


@router.patch("/agents/{agent_id}/retire")
async def retire_agent_endpoint(agent_id: str, db=Depends(get_db)):
    return retire_agent(agent_id, db)


@router.patch("/agents/{agent_id}/reactivate")
async def reactivate_agent_endpoint(agent_id: str, db=Depends(get_db)):
    return reactivate_agent(agent_id, db)


@router.post("/agents/{agent_id}/rate")
async def rate_agent_endpoint(agent_id: str, body: AgentRateRequest, db=Depends(get_db)):
    return rate_agent(agent_id, body, db)


@router.post("/workspaces/{workspace_id}/agents/dispatch")
async def dispatch_agent_endpoint(
    workspace_id: str,
    body: ControllerDispatchRequest,
    llm_config: dict = Depends(extract_llm_config),
    db=Depends(get_db),
):
    return await controller_dispatch(workspace_id, body, llm_config, db)


@router.get("/workspaces/{workspace_id}/logs")
async def get_logs(workspace_id: str, db=Depends(get_db)):
    return list_workspace_logs(workspace_id, db)


@router.post("/llm/test")
async def test_llm_connection(body: LLMTestRequest):
    return await test_llm(body)


@router.post("/workspaces/{workspace_id}/agents/analyze")
async def analyze_workspace(
    workspace_id: str,
    llm_config: dict = Depends(extract_llm_config),
    db=Depends(get_db),
):
    return await analyze_workspace_sources(workspace_id, llm_config, db)


@router.post("/workspaces/{workspace_id}/agents/experiment/request")
async def request_experiment(
    workspace_id: str,
    _llm_config: dict = Depends(extract_llm_config),
    db=Depends(get_db),
):
    return await request_reproduction_experiment(workspace_id, db)


@router.post("/logs/{log_id}/decision")
async def decide_log(
    log_id: int,
    body: LogDecision,
    llm_config: dict = Depends(extract_llm_config),
    db=Depends(get_db),
):
    return await process_log_decision(log_id, body, llm_config, db)


@router.post("/workspaces/{workspace_id}/agents/what-if")
async def what_if_experiment(
    workspace_id: str,
    body: WhatIfRequest,
    llm_config: dict = Depends(extract_llm_config),
    db=Depends(get_db),
):
    return await run_what_if(workspace_id, body, llm_config, db)


@router.post("/tools/fetch-url")
async def fetch_url_endpoint(body: FetchUrlRequest):
    return await fetch_external_url(body)


@router.post("/workspaces/{workspace_id}/agents/harness")
async def trigger_harness(
    workspace_id: str,
    body: HarnessRequest,
    llm_config: dict = Depends(extract_llm_config),
    db=Depends(get_db),
):
    return await run_harness(workspace_id, body, llm_config, db)


@router.post("/tools/upload-pdf")
async def upload_pdf_endpoint(file: UploadFile = File(...)):
    return await upload_pdf_file(file)


@router.post("/agents/{agent_id}/pause")
async def pause_agent_endpoint(agent_id: str, db=Depends(get_db)):
    return set_agent_paused(agent_id, True, db)


@router.post("/agents/{agent_id}/resume")
async def resume_agent_endpoint(agent_id: str, db=Depends(get_db)):
    return set_agent_paused(agent_id, False, db)


@router.post("/workspaces/{workspace_id}/agents/experiment/sandbox")
async def sandbox_experiment_endpoint(
    workspace_id: str,
    body: HarnessRequest,
    llm_config: dict = Depends(extract_llm_config),
    db=Depends(get_db),
):
    return await run_sandbox_experiment(workspace_id, body.goal, llm_config, db)


@router.post("/workspaces/{workspace_id}/agents/suggest-next")
async def suggest_next_endpoint(
    workspace_id: str,
    llm_config: dict = Depends(extract_llm_config),
    db=Depends(get_db),
):
    return await get_next_experiment_suggestions(workspace_id, llm_config, db)


@router.get("/workspaces/{workspace_id}/memory")
async def workspace_memory_endpoint(workspace_id: str, db=Depends(get_db)):
    return list_workspace_memory(workspace_id, db)
