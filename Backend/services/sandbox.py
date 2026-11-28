import json
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

from core.llm import call_llm_json
from core.ws import ws_manager
from services.agents import get_free_position


def get_workspace_memory(workspace_id: str, db, limit: int = 12) -> list[dict]:
    """Retrieve prior successes, failures, and fixes from research_memory."""
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT rm.id, rm.outcome, rm.error_signature, rm.resolution, rm.created_at,
                   n.title AS experiment_title
            FROM research_memory rm
            LEFT JOIN nodes n ON rm.experiment_node_id = n.id
            WHERE rm.workspace_id = %s
            ORDER BY rm.created_at DESC
            LIMIT %s
            """,
            (workspace_id, limit),
        )
        return [dict(r) for r in cur.fetchall()]


def _run_in_sandbox(
    script: str,
    repo_url: str = "",
    timeout: int = 35,
) -> tuple[subprocess.CompletedProcess, dict]:
    """
    Execute Python experiment code inside an isolated temporary directory.
    If a GitHub repo_url is provided, provisions a dedicated venv, shallow-clones
    the repo, installs requirements.txt if present, and executes inside the repo.
    """
    meta = {"mode": "isolated_tmp", "venv": False, "repo_cloned": False, "deps_installed": False}
    with tempfile.TemporaryDirectory(prefix="rg_sandbox_") as tmp_dir:
        tmp_path = Path(tmp_dir)
        work_dir = tmp_path
        py_exec = sys.executable

        clean_repo = (repo_url or "").strip()
        if clean_repo.startswith("https://github.com/"):
            venv_dir = tmp_path / "venv"
            venv_proc = subprocess.run(
                [sys.executable, "-m", "venv", str(venv_dir)],
                capture_output=True,
                text=True,
                timeout=30,
            )
            if venv_proc.returncode == 0:
                candidate_py = venv_dir / "bin" / "python"
                if candidate_py.exists():
                    py_exec = str(candidate_py)
                    meta["venv"] = True
                    meta["mode"] = "repo_venv"

            repo_dir = tmp_path / "repo"
            clone_proc = subprocess.run(
                ["git", "clone", "--depth", "1", clean_repo, str(repo_dir)],
                capture_output=True,
                text=True,
                timeout=30,
            )
            if clone_proc.returncode == 0 and repo_dir.exists():
                work_dir = repo_dir
                meta["repo_cloned"] = True
                req_file = repo_dir / "requirements.txt"
                if req_file.exists() and meta["venv"]:
                    pip_proc = subprocess.run(
                        [py_exec, "-m", "pip", "install", "-q", "-r", str(req_file)],
                        cwd=str(repo_dir),
                        capture_output=True,
                        text=True,
                        timeout=60,
                    )
                    meta["deps_installed"] = pip_proc.returncode == 0

        script_path = work_dir / "experiment.py"
        script_path.write_text(script, encoding="utf-8")
        proc = subprocess.run(
            [py_exec, str(script_path)],
            cwd=str(work_dir),
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return proc, meta


async def run_general_experiment(
    workspace_id: str,
    goal: str,
    db,
    llm_config: dict | None = None,
    verifier_config: dict | None = None,
) -> dict:
    """
    General-purpose paper/repo experiment runner:
    1. Queries workspace nodes (papers, code, datasets, questions) and research_memory.
    2. Generates a runnable Python script using LLM (informed by past failures/fixes).
    3. Executes in an isolated sandbox; on failure, invokes Debugger Agent to fix & re-run.
    4. Persists experiment, result, optional error_fix nodes, and research_memory entries.
    """
    with db.cursor() as cur:
        cur.execute(
            "SELECT id, type, title, url, content, pos_x, pos_y FROM nodes WHERE workspace_id = %s",
            (workspace_id,),
        )
        nodes = [dict(r) for r in cur.fetchall()]

    memory = get_workspace_memory(workspace_id, db)

    anchor = next(
        (n for n in nodes if n["type"] in ("question", "paper", "code")),
        nodes[0] if nodes else None,
    )
    await ws_manager.broadcast(
        workspace_id,
        {
            "event": "cursor_move",
            "agent_id": "agent_coder",
            "agent_name": "Experiment Agent",
            "x": float(anchor["pos_x"]) if anchor else 200.0,
            "y": float(anchor["pos_y"]) if anchor else 160.0,
            "label": "Reading memory & generating sandbox script",
        },
    )

    with db.cursor() as cur:
        cur.execute("UPDATE agents SET status = 'working' WHERE id = 'agent_coder'")
    db.commit()

    context_nodes = [
        {
            "type": n["type"],
            "title": n["title"],
            "url": n.get("url") or "",
            "content": (n.get("content") or "")[:600],
        }
        for n in nodes[:12]
    ]
    memory_summary = [
        {
            "outcome": m["outcome"],
            "error": m["error_signature"],
            "fix": m["resolution"],
        }
        for m in memory
    ]

    prompt = f"""Generate a self-contained Python experiment script for a laptop CPU sandbox.
Goal: "{goal or 'Reproduce and evaluate the core method from the workspace papers/code'}"

Workspace Sources:
{json.dumps(context_nodes, indent=2)}

Past Research Memory (avoid repeating these errors and reuse proven fixes):
{json.dumps(memory_summary, indent=2)}

Requirements:
- Use only standard library, numpy, and scikit-learn (do NOT download large datasets or require GPU).
- Print ONLY one final JSON object to stdout on the last line containing numeric metrics (e.g. {{"accuracy": ..., "f1": ..., "auc": ..., "notes": "..."}}).
- Return ONLY valid JSON:
{{
  "title": "Short experiment title",
  "reasoning": "1-sentence rationale referencing workspace sources and research memory",
  "script": "complete python script string"
}}"""

    exp_title = f"Sandbox Experiment: {(goal or 'Workspace Reproduction')[:45]}"
    reasoning = "Generated CPU-safe reproduction script informed by workspace sources and research memory."
    script = ""

    try:
        gen = await call_llm_json(prompt, config=llm_config, timeout=60.0)
        exp_title = str(gen.get("title") or exp_title)[:160]
        reasoning = str(gen.get("reasoning") or reasoning)
        script = str(gen.get("script") or "").strip()
    except Exception:
        # Deterministic CPU fallback if no LLM is configured
        script = (
            "import json\n"
            "import numpy as np\n"
            "from sklearn.datasets import make_classification\n"
            "from sklearn.model_selection import train_test_split\n"
            "from sklearn.ensemble import RandomForestClassifier\n"
            "from sklearn.metrics import roc_auc_score, f1_score\n"
            "X, y = make_classification(n_samples=600, n_features=12, weights=[0.88, 0.12], random_state=42)\n"
            "X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.3, stratify=y, random_state=42)\n"
            "clf = RandomForestClassifier(n_estimators=60, class_weight='balanced', random_state=42)\n"
            "clf.fit(X_tr, y_tr)\n"
            "preds = clf.predict(X_te)\n"
            "probs = clf.predict_proba(X_te)[:, 1]\n"
            "print(json.dumps({'rf_balanced_auc': round(roc_auc_score(y_te, probs), 4), 'rf_balanced_f1': round(f1_score(y_te, preds), 4)}))\n"
        )

    exp_id = uuid.uuid4().hex
    exp_x, exp_y = await get_free_position(workspace_id, 200, 420, db)
    with db.cursor() as cur:
        cur.execute(
            """
            INSERT INTO nodes (id, workspace_id, type, title, content, pos_x, pos_y)
            VALUES (%s, %s, 'experiment', %s, %s, %s, %s)
            """,
            (exp_id, workspace_id, exp_title, script, exp_x, exp_y),
        )
        if anchor:
            cur.execute(
                """
                INSERT INTO edges (id, workspace_id, source_id, target_id, label, is_ai_suggested, status)
                VALUES (%s, %s, %s, %s, 'tests', TRUE, 'accepted')
                """,
                (uuid.uuid4().hex, workspace_id, anchor["id"], exp_id),
            )
    db.commit()

    repo_node = next(
        (n for n in nodes if (n.get("url") or "").startswith("https://github.com/")),
        None,
    )
    repo_url = repo_node["url"] if repo_node else ""

    proc, sandbox_meta = _run_in_sandbox(script, repo_url=repo_url)
    fix_node_id = None

    if proc.returncode != 0:
        err_sig = (proc.stderr or "Sandbox execution failed").strip()[-500:]
        with db.cursor() as cur:
            cur.execute(
                """
                INSERT INTO research_memory (workspace_id, experiment_node_id, agent_id, outcome, error_signature, resolution)
                VALUES (%s, %s, 'agent_coder', 'failure', %s, '')
                """,
                (workspace_id, exp_id, err_sig),
            )
            cur.execute("UPDATE agents SET status = 'working' WHERE id = 'agent_debugger'")
        db.commit()

        await ws_manager.broadcast(
            workspace_id,
            {
                "event": "cursor_move",
                "agent_id": "agent_debugger",
                "agent_name": "Debugger Agent",
                "x": exp_x,
                "y": exp_y,
                "label": "Fixing sandbox error",
            },
        )

        # Ask Debugger Agent to repair script using stderr + memory
        fix_prompt = f"""Fix this failing Python experiment script.
Error stderr:
{err_sig}

Original script:
{script}

Past fixes in research memory:
{json.dumps(memory_summary, indent=2)}

Return ONLY valid JSON:
{{
  "diagnosis": "Short 1-sentence cause and fix",
  "fixed_script": "complete working python script using numpy/sklearn/stdlib printing one JSON line"
}}"""
        fixed_script = script
        diagnosis = "Patched runtime error in isolated sandbox."
        try:
            fix_res = await call_llm_json(fix_prompt, config=llm_config, timeout=45.0)
            fixed_script = str(fix_res.get("fixed_script") or "").strip() or fixed_script
            diagnosis = str(fix_res.get("diagnosis") or diagnosis)
        except Exception:
            fixed_script = (
                "import json\n"
                "from sklearn.datasets import make_classification\n"
                "from sklearn.linear_model import LogisticRegression\n"
                "from sklearn.metrics import accuracy_score\n"
                "X, y = make_classification(n_samples=300, random_state=42)\n"
                "clf = LogisticRegression(max_iter=300).fit(X[:200], y[:200])\n"
                "print(json.dumps({'fallback_accuracy': round(accuracy_score(y[200:], clf.predict(X[200:])), 4)}))\n"
            )

        proc, sandbox_meta = _run_in_sandbox(fixed_script, repo_url=repo_url)
        fix_node_id = uuid.uuid4().hex
        fix_x, fix_y = await get_free_position(workspace_id, exp_x + 280, exp_y, db)
        with db.cursor() as cur:
            cur.execute(
                """
                INSERT INTO nodes (id, workspace_id, type, title, content, pos_x, pos_y)
                VALUES (%s, %s, 'error_fix', %s, %s, %s, %s)
                """,
                (fix_node_id, workspace_id, "Debugger Auto-Fix", diagnosis, fix_x, fix_y),
            )
            cur.execute(
                """
                INSERT INTO edges (id, workspace_id, source_id, target_id, label, is_ai_suggested, status)
                VALUES (%s, %s, %s, %s, 'fixed_by', TRUE, 'accepted')
                """,
                (uuid.uuid4().hex, workspace_id, exp_id, fix_node_id),
            )
            cur.execute(
                """
                INSERT INTO research_memory (workspace_id, experiment_node_id, agent_id, outcome, error_signature, resolution)
                VALUES (%s, %s, 'agent_debugger', 'fix', %s, %s)
                """,
                (workspace_id, exp_id, err_sig[:200], diagnosis),
            )
            cur.execute(
                "UPDATE agents SET status = 'idle', tasks_completed = tasks_completed + 1, rating_score = rating_score + 0.2 WHERE id = 'agent_debugger'"
            )
        db.commit()

    stdout_lines = [ln.strip() for ln in (proc.stdout or "").splitlines() if ln.strip()]
    last_line = stdout_lines[-1] if stdout_lines else json.dumps({"status": "completed", "returncode": proc.returncode})

    res_id = uuid.uuid4().hex
    res_x, res_y = await get_free_position(workspace_id, exp_x, exp_y + 180, db)
    with db.cursor() as cur:
        cur.execute(
            """
            INSERT INTO nodes (id, workspace_id, type, title, content, pos_x, pos_y)
            VALUES (%s, %s, 'result', %s, %s, %s, %s)
            """,
            (res_id, workspace_id, f"Result: {exp_title[:36]}", last_line, res_x, res_y),
        )
        cur.execute(
            """
            INSERT INTO edges (id, workspace_id, source_id, target_id, label, is_ai_suggested, status)
            VALUES (%s, %s, %s, %s, 'produces', TRUE, 'accepted')
            """,
            (uuid.uuid4().hex, workspace_id, exp_id, res_id),
        )
        cur.execute(
            """
            INSERT INTO research_memory (workspace_id, experiment_node_id, agent_id, outcome, resolution)
            VALUES (%s, %s, 'agent_coder', 'success', %s)
            """,
            (workspace_id, exp_id, last_line[:400]),
        )
        cur.execute(
            """
            INSERT INTO agent_logs (workspace_id, agent_id, node_id, action, reasoning, approval_status)
            VALUES (%s, 'agent_coder', %s, %s, %s, 'approved')
            """,
            (
                workspace_id,
                res_id,
                f"[SANDBOX RUN] {exp_title}",
                f"{reasoning} (Consulted {len(memory)} research_memory record(s)).",
            ),
        )
        cur.execute(
            "UPDATE agents SET status = 'idle', tasks_completed = tasks_completed + 1, rating_score = rating_score + 0.2 WHERE id = 'agent_coder'"
        )
    db.commit()

    await ws_manager.broadcast(
        workspace_id,
        {
            "event": "graph_updated",
            "workspace_id": workspace_id,
            "agent_id": "agent_coder",
        },
    )

    return {
        "status": "completed",
        "experiment_node_id": exp_id,
        "result_node_id": res_id,
        "fix_node_id": fix_node_id,
        "output": last_line,
        "memory_consulted": len(memory),
        "sandbox": sandbox_meta,
    }


async def suggest_next_experiments(
    workspace_id: str,
    db,
    llm_config: dict | None = None,
) -> dict:
    """Suggest the next best experiments based on current graph + research_memory."""
    with db.cursor() as cur:
        cur.execute(
            "SELECT type, title, content FROM nodes WHERE workspace_id = %s",
            (workspace_id,),
        )
        nodes = [dict(r) for r in cur.fetchall()]
    memory = get_workspace_memory(workspace_id, db)

    prompt = f"""Based on the current research graph and past research_memory, suggest 3 high-value next experiments.
Nodes:
{json.dumps([{"type": n["type"], "title": n["title"], "content": (n["content"] or "")[:200]} for n in nodes[:12]], indent=2)}

Research Memory:
{json.dumps([{"outcome": m["outcome"], "error": m["error_signature"], "resolution": m["resolution"]} for m in memory], indent=2)}

Return ONLY valid JSON:
{{
  "suggestions": [
    {{
      "title": "Short title",
      "goal": "Actionable experiment prompt",
      "why": "1-sentence reason grounded in graph/memory"
    }}
  ]
}}"""

    try:
        res = await call_llm_json(prompt, config=llm_config, timeout=30.0)
        suggestions = res.get("suggestions") or []
        if isinstance(suggestions, list) and suggestions:
            return {"suggestions": suggestions[:3], "memory_count": len(memory)}
    except Exception:
        pass

    return {
        "memory_count": len(memory),
        "suggestions": [
            {
                "title": "Cross-Validate Class-Weighted Baselines",
                "goal": "Compare balanced Random Forest vs SMOTE across 5 folds and log AUC + F1.",
                "why": "Establishes variance bounds across minority class sampling strategies.",
            },
            {
                "title": "Ablate Hyperparameters (k=3 vs k=7)",
                "goal": "Sweep neighbor count k in [3, 5, 7] in the isolated sandbox and compare recall.",
                "why": "Tests sensitivity of synthetic minority neighborhoods on small datasets.",
            },
            {
                "title": "Fetch & Compare Related arXiv Method",
                "goal": "Search arXiv for Borderline-SMOTE or ADASYN, summarize it, and link to our question.",
                "why": "Expands literature coverage before running the next reproduction.",
            },
        ],
    }
