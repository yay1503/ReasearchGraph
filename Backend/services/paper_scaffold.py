import json
import re

from core.llm import call_llm
from services import project_sandbox

META_FILENAME = ".sandbox_meta.json"

SYSTEM_PROMPT = (
    "You are a senior ML research engineer who turns academic papers into clean, "
    "runnable, CPU-friendly multi-file Python starter repositories for hands-on "
    "reproduction and human-in-the-loop experimentation. Always return strict JSON."
)


def _extract_json_object(raw: str) -> dict:
    cleaned = (raw or "").strip()
    if not cleaned:
        raise ValueError("LLM returned an empty response.")

    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end > start:
        try:
            parsed = json.loads(cleaned[start : end + 1])
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError as exc:
            raise ValueError(f"Could not parse LLM scaffold JSON: {exc}") from exc

    raise ValueError("LLM did not return a valid JSON object.")


def _normalize_references(raw_refs) -> list[dict]:
    if not isinstance(raw_refs, list):
        return []
    refs = []
    for item in raw_refs[:4]:
        if isinstance(item, dict) and item.get("title"):
            refs.append(
                {
                    "title": str(item["title"]).strip(),
                    "relevance": str(item.get("relevance") or "").strip(),
                }
            )
    return refs


def _normalize_tasks(raw_tasks) -> list[dict]:
    if not isinstance(raw_tasks, list):
        return []
    tasks = []
    for idx, item in enumerate(raw_tasks[:4], start=1):
        if not isinstance(item, dict) or not item.get("title"):
            continue
        tasks.append(
            {
                "id": str(item.get("id") or f"task_{idx}").strip(),
                "title": str(item["title"]).strip(),
                "description": str(item.get("description") or "").strip(),
                "target_file": str(item.get("target_file") or "main.py").strip(),
                "completed": False,
            }
        )
    return tasks


def _normalize_files(raw_files) -> list[dict]:
    if not isinstance(raw_files, list):
        return []
    files = []
    for item in raw_files[:6]:
        if not isinstance(item, dict):
            continue
        path = str(item.get("path") or "").strip()
        content = item.get("content")
        if not path or content is None:
            continue
        files.append({"path": path, "content": str(content)})
    return files


def load_paper_sandbox_meta(workspace_id: str) -> dict | None:
    try:
        raw = project_sandbox.read_file(workspace_id, META_FILENAME)
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else None
    except (FileNotFoundError, json.JSONDecodeError, ValueError):
        return None


async def generate_paper_sandbox(
    workspace_id: str,
    paper_title: str,
    paper_content: str = "",
    llm_config: dict | None = None,
) -> dict:
    title = (paper_title or "").strip() or "Untitled Research Paper"
    content_excerpt = (paper_content or "").strip()[:6000]

    prompt = f"""Analyze the following research paper and design a compact, runnable starter Python project for a laptop CPU sandbox.

Paper Title: "{title}"
Paper Abstract / Notes:
{content_excerpt or "(No abstract provided; infer the standard mechanism from the paper title.)"}

Return ONLY a strict JSON object with these exact top-level keys:
{{
  "summary": "Exactly 2 technical sentences summarizing the paper's core mechanism.",
  "references": [
    {{ "title": "Foundational paper or concept title", "relevance": "1-sentence explanation of how it relates" }}
  ],
  "tasks": [
    {{
      "id": "task_1",
      "title": "Short imperative step title",
      "description": "Practical instruction for the researcher",
      "target_file": "config.py",
      "completed": false
    }}
  ],
  "files": [
    {{ "path": "README.md", "content": "..." }},
    {{ "path": "requirements.txt", "content": "..." }},
    {{ "path": "config.py", "content": "..." }},
    {{ "path": "model.py", "content": "..." }},
    {{ "path": "main.py", "content": "..." }}
  ]
}}

Rules:
- Provide 3 to 4 items in "references".
- Provide 4 practical reproduction items in "tasks", ordered from setup to experimentation.
- Provide 4 to 5 concise, runnable files in "files" (e.g., README.md, requirements.txt, config.py, model.py, main.py).
- Python code MUST run cleanly on CPU using standard library, numpy, scikit-learn, or lightweight torch where appropriate (no internet downloads, no GPU requirement).
- Include clear `# HUMAN-IN-THE-LOOP:` comments inside config.py, model.py, and main.py marking hyperparameters and functions the researcher should tweak.
- main.py must run end-to-end and print clear evaluation output/metrics."""

    raw_reply = await call_llm(
        prompt,
        system_prompt=SYSTEM_PROMPT,
        config=llm_config,
        timeout=120.0,
        json_mode=True,
    )
    parsed = _extract_json_object(raw_reply)

    summary = str(parsed.get("summary") or "").strip()
    references = _normalize_references(parsed.get("references"))
    tasks = _normalize_tasks(parsed.get("tasks"))
    files = _normalize_files(parsed.get("files"))

    if not files:
        raise ValueError("LLM scaffold response contained no starter files.")

    written_files: list[str] = []
    for item in files:
        result = project_sandbox.write_file(workspace_id, item["path"], item["content"])
        written_files.append(result["path"])

    metadata = {
        "paper_title": title,
        "summary": summary,
        "references": references,
        "tasks": tasks,
    }
    project_sandbox.write_file(
        workspace_id,
        META_FILENAME,
        json.dumps(metadata, indent=2),
    )

    return {
        "workspace_id": workspace_id,
        **metadata,
        "files": written_files,
    }
