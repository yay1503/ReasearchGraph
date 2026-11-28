import json

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from controllers.agent_controller import extract_llm_config
from core.db import get_db
from core.llm import call_llm
from services import project_sandbox
from services.paper_scaffold import (
    META_FILENAME,
    _extract_json_object,
    generate_paper_sandbox,
    load_paper_sandbox_meta,
)

router = APIRouter(prefix="/workspaces/{workspace_id}/sandbox", tags=["sandbox"])


class ScaffoldRequest(BaseModel):
    paper_title: str = ""
    paper_content: str = ""
    node_id: str | None = None


class SandboxFileWriteRequest(BaseModel):
    path: str
    content: str


class SandboxRunRequest(BaseModel):
    entry_file: str = "main.py"
    timeout: int = 30


class SandboxTweakRequest(BaseModel):
    path: str
    current_code: str
    instruction: str


@router.post("/scaffold")
async def scaffold_sandbox(
    workspace_id: str,
    body: ScaffoldRequest,
    llm_config: dict = Depends(extract_llm_config),
    db=Depends(get_db),
):
    paper_title = (body.paper_title or "").strip()
    paper_content = (body.paper_content or "").strip()

    if body.node_id:
        with db.cursor() as cur:
            cur.execute(
                "SELECT title, content FROM nodes WHERE id = %s AND workspace_id = %s",
                (body.node_id, workspace_id),
            )
            node = cur.fetchone()
        if node is None:
            raise HTTPException(status_code=404, detail="Paper node not found")
        if not paper_title:
            paper_title = (node.get("title") or "").strip()
        if not paper_content:
            paper_content = (node.get("content") or "").strip()

    if not paper_title:
        raise HTTPException(
            status_code=400,
            detail="Provide paper_title or a valid node_id.",
        )

    try:
        result = await generate_paper_sandbox(
            workspace_id=workspace_id,
            paper_title=paper_title,
            paper_content=paper_content,
            llm_config=llm_config,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {
        "meta": {
            "paper_title": result["paper_title"],
            "summary": result["summary"],
            "references": result["references"],
            "tasks": result["tasks"],
        },
        "files": result["files"],
    }


@router.get("/state")
def get_sandbox_state(workspace_id: str):
    try:
        ws_dir = project_sandbox.get_workspace_dir(workspace_id, create=False)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if not ws_dir.exists():
        return {
            "meta": None,
            "files": [],
            "dependencies": {
                "has_requirements": False,
                "installed": [],
                "missing": [],
            },
        }

    meta = load_paper_sandbox_meta(workspace_id)
    files = [
        f
        for f in project_sandbox.list_files(workspace_id)
        if f != META_FILENAME
    ]
    dependencies = project_sandbox.check_dependencies(workspace_id)
    return {
        "meta": meta,
        "files": files,
        "dependencies": dependencies,
    }


@router.get("/file")
def read_sandbox_file(
    workspace_id: str,
    path: str = Query(..., min_length=1),
):
    try:
        content = project_sandbox.read_file(workspace_id, path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {"path": path, "content": content}


@router.put("/file")
def write_sandbox_file(workspace_id: str, body: SandboxFileWriteRequest):
    try:
        saved = project_sandbox.write_file(workspace_id, body.path, body.content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"saved": True, "path": saved["path"]}


@router.patch("/tasks/{task_id}")
def toggle_sandbox_task(workspace_id: str, task_id: str):
    try:
        meta = load_paper_sandbox_meta(workspace_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if not meta or not isinstance(meta.get("tasks"), list):
        raise HTTPException(status_code=404, detail="Sandbox metadata not found")

    matched = None
    for task in meta["tasks"]:
        if isinstance(task, dict) and str(task.get("id")) == task_id:
            task["completed"] = not bool(task.get("completed", False))
            matched = task
            break

    if matched is None:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found")

    project_sandbox.write_file(
        workspace_id,
        META_FILENAME,
        json.dumps(meta, indent=2),
    )
    return {"tasks": meta["tasks"]}


@router.post("/run")
def run_sandbox_entry(workspace_id: str, body: SandboxRunRequest):
    try:
        return project_sandbox.run_script(
            workspace_id,
            entry_file=body.entry_file,
            timeout=body.timeout,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/tweak")
async def tweak_sandbox_code(
    workspace_id: str,
    body: SandboxTweakRequest,
    llm_config: dict = Depends(extract_llm_config),
):
    if not body.instruction.strip():
        raise HTTPException(status_code=400, detail="Instruction is required.")

    system_prompt = (
        "You are a human-in-the-loop ML pair programmer. Given a source file and "
        "a researcher's tweak instruction, propose clean, minimal, runnable edits "
        "and return ONLY valid JSON."
    )
    prompt = f"""Workspace ID: {workspace_id}
Target File: {body.path}
Researcher Instruction: "{body.instruction.strip()}"

Current File Content:
```
{body.current_code}
```

Return ONLY a strict JSON object with these exact keys:
{{
  "explanation": "1-2 concise sentences explaining what you changed and why",
  "proposed_code": "the complete updated file content"
}}"""

    try:
        raw_reply = await call_llm(
            prompt,
            system_prompt=system_prompt,
            config=llm_config,
            timeout=90.0,
            json_mode=True,
        )
        parsed = _extract_json_object(raw_reply)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    proposed_code = parsed.get("proposed_code")
    if not isinstance(proposed_code, str) or not proposed_code.strip():
        raise HTTPException(
            status_code=400,
            detail="LLM response did not include proposed_code.",
        )

    return {
        "explanation": str(parsed.get("explanation") or "Applied requested code tweak.").strip(),
        "proposed_code": proposed_code,
    }
