import json
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

from core.llm import call_llm_json


async def get_free_position(
    workspace_id: str,
    base_x: float,
    base_y: float,
    db,
) -> tuple[float, float]:
    with db.cursor() as cur:
        cur.execute(
            "SELECT pos_x, pos_y FROM nodes WHERE workspace_id = %s",
            (workspace_id,),
        )
        existing = [(float(row["pos_x"]), float(row["pos_y"])) for row in cur.fetchall()]

    x = float(base_x)
    y = float(base_y)
    max_x = float(base_x) + 900.0

    for _ in range(200):
        overlaps = any(abs(x - ex) < 180.0 and abs(y - ey) < 120.0 for ex, ey in existing)
        if not overlaps:
            return x, y
        x += 300.0
        if x > max_x:
            x = float(base_x)
            y += 180.0

    return x, y


async def run_reader_and_clusterer(
    workspace_id: str,
    db,
    llm_config: dict | None = None,
):
    # 1. Fetch existing paper and question nodes
    with db.cursor() as cur:
        cur.execute(
            "SELECT id, type, title, url, content FROM nodes WHERE workspace_id = %s AND type IN ('paper', 'question')",
            (workspace_id,),
        )
        sources = [dict(row) for row in cur.fetchall()]
    if not sources:
        return {"error": "Add at least one Paper or Question node first."}

    # 2. Mark Reader Agent as working
    with db.cursor() as cur:
        cur.execute("UPDATE agents SET status = 'working' WHERE id = 'agent_reader'")
    db.commit()

    source_text = "\n".join(
        [
            f"- [{s['type'].upper()}] {s['title']} (id: {s['id']})"
            + (f" | URL: {s['url']}" if s.get("url") else "")
            + (f" | Content: {(s.get('content') or '')[:500]}" if s.get("content") else "")
            for s in sources
        ]
    )
    prompt = f"""
You are a research assistant analyzing a workspace.
Existing nodes:
{source_text}

Extract 2 to 3 helpful new nodes to organize this research (e.g., a 'dataset' node and 1-2 'note' nodes for key methods or baseline metrics).
Return ONLY valid JSON in this exact format:
{{
  "reasoning": "One short sentence explaining what you extracted and why.",
  "new_nodes": [
    {{
      "type": "dataset",
      "title": "Short title",
      "content": "Brief 1-sentence summary",
      "connect_to_id": "{sources[0]['id']}",
      "edge_label": "uses_dataset"
    }}
  ]
}}
Allowed node types: "dataset", "note".
"""

    try:
        result = await call_llm_json(prompt, config=llm_config)
    except Exception as e:
        with db.cursor() as cur:
            cur.execute("UPDATE agents SET status = 'idle' WHERE id = 'agent_reader'")
        db.commit()
        return {"error": str(e)}

    # 3. Switch to Clusterer Agent to insert nodes & suggested edges
    with db.cursor() as cur:
        cur.execute(
            "UPDATE agents SET status = 'idle', tasks_completed = tasks_completed + 1 WHERE id = 'agent_reader'"
        )
        cur.execute("UPDATE agents SET status = 'working' WHERE id = 'agent_clusterer'")
    db.commit()

    created_nodes = []
    for i, item in enumerate(result.get("new_nodes", [])):
        node_id = uuid.uuid4().hex
        node_type = item.get("type", "note")
        if node_type not in ("dataset", "note"):
            node_type = "note"

        pos_x, pos_y = await get_free_position(workspace_id, 120 + (i * 300), 280, db)

        with db.cursor() as cur:
            cur.execute(
                "INSERT INTO nodes (id, workspace_id, type, title, content, pos_x, pos_y) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                (node_id, workspace_id, node_type, item.get("title", "Untitled"), item.get("content", ""), pos_x, pos_y),
            )

            target_id = item.get("connect_to_id") or sources[0]["id"]
            edge_id = uuid.uuid4().hex
            cur.execute(
                "INSERT INTO edges (id, workspace_id, source_id, target_id, label, is_ai_suggested, status) VALUES (%s, %s, %s, %s, %s, TRUE, 'accepted')",
                (edge_id, workspace_id, target_id, node_id, item.get("edge_label", "extracted_from")),
            )
        created_nodes.append(node_id)

    # 4. Log activity for transparency and reset Clusterer Agent
    with db.cursor() as cur:
        cur.execute(
            """
            INSERT INTO agent_logs (workspace_id, agent_id, action, reasoning, approval_status)
            VALUES (%s, 'agent_reader', %s, %s, 'auto')
            RETURNING id
            """,
            (workspace_id, f"Analyzed {len(sources)} source(s) and extracted {len(created_nodes)} new nodes.", result.get("reasoning", "")),
        )
        cur.fetchone()
        cur.execute(
            "UPDATE agents SET status = 'idle', tasks_completed = tasks_completed + 1, rating_score = rating_score + 0.1 WHERE id = 'agent_clusterer'"
        )
    db.commit()

    return {"status": "ok", "created_nodes": created_nodes}


BUGGY_EXPERIMENT_SCRIPT = """
import json
import numpy as np
from sklearn.datasets import make_classification
from sklearn.model_selection import train_test_split
from sklearn.tree import DecisionTreeClassifier
from sklearn.metrics import roc_auc_score, f1_score

X, y = make_classification(
    n_samples=768, n_features=8, weights=[0.65, 0.35], random_state=42
)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=42, stratify=y)

# Deliberate realistic bug: max_features='auto' was removed in modern scikit-learn
clf = DecisionTreeClassifier(class_weight='balanced', max_features='auto', random_state=42)
clf.fit(X_train, y_train)
"""

FIXED_EXPERIMENT_SCRIPT = """
import json
import numpy as np
from sklearn.datasets import make_classification
from sklearn.model_selection import train_test_split
from sklearn.tree import DecisionTreeClassifier
from sklearn.neighbors import NearestNeighbors
from sklearn.metrics import roc_auc_score, f1_score

def simple_smote(X, y, k=5):
    X_min = X[y == 1]
    n_needed = int(np.sum(y == 0) - np.sum(y == 1))
    nn = NearestNeighbors(n_neighbors=k + 1).fit(X_min)
    _, indices = nn.kneighbors(X_min)
    rng = np.random.default_rng(42)
    synth = []
    for _ in range(n_needed):
        i = rng.integers(0, len(X_min))
        neighbor = X_min[indices[i, rng.integers(1, k + 1)]]
        synth.append(X_min[i] + rng.random() * (neighbor - X_min[i]))
    return np.vstack([X, np.array(synth)]), np.concatenate([y, np.ones(n_needed, dtype=int)])

X, y = make_classification(
    n_samples=768, n_features=8, weights=[0.65, 0.35], random_state=42
)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=42, stratify=y)

# 1. Baseline: Class-weighted Decision Tree
base_clf = DecisionTreeClassifier(class_weight='balanced', max_features=None, random_state=42)
base_clf.fit(X_train, y_train)
base_auc = roc_auc_score(y_test, base_clf.predict_proba(X_test)[:, 1])
base_f1 = f1_score(y_test, base_clf.predict(X_test))

# 2. SMOTE + Decision Tree
X_sm, y_sm = simple_smote(X_train, y_train, k=5)
smote_clf = DecisionTreeClassifier(max_features=None, random_state=42)
smote_clf.fit(X_sm, y_sm)
smote_auc = roc_auc_score(y_test, smote_clf.predict_proba(X_test)[:, 1])
smote_f1 = f1_score(y_test, smote_clf.predict(X_test))

print(json.dumps({
    "baseline_auc": round(float(base_auc), 3),
    "baseline_f1": round(float(base_f1), 3),
    "smote_auc": round(float(smote_auc), 3),
    "smote_f1": round(float(smote_f1), 3)
}))
"""


def _run_experiment_script(script: str) -> subprocess.CompletedProcess:
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as f:
        f.write(script)
        script_path = Path(f.name)

    try:
        return subprocess.run(
            [sys.executable, str(script_path)],
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
    finally:
        script_path.unlink(missing_ok=True)


async def _record_experiment_failure(
    workspace_id: str,
    experiment_node_id: str,
    detail: str,
    db,
):
    detail = detail.strip() or "The experiment did not produce valid metrics."
    with db.cursor() as cur:
        cur.execute(
            """
            INSERT INTO research_memory
                (workspace_id, experiment_node_id, agent_id, outcome, error_signature, resolution)
            VALUES (%s, %s, 'agent_coder', 'failure', %s, %s)
            RETURNING id
            """,
            (workspace_id, experiment_node_id, detail[:2000], "Experiment execution failed."),
        )
        cur.fetchone()
        cur.execute(
            """
            INSERT INTO agent_logs (workspace_id, agent_id, node_id, action, reasoning, approval_status)
            VALUES (%s, 'agent_coder', %s, %s, %s, 'auto')
            RETURNING id
            """,
            (workspace_id, experiment_node_id, "Reproduction failed", detail[:2000]),
        )
        cur.fetchone()
        cur.execute(
            "UPDATE agents SET status = 'idle' WHERE id IN ('agent_coder', 'agent_debugger')"
        )
    db.commit()


async def request_experiment_approval(workspace_id: str, db):
    with db.cursor() as cur:
        cur.execute("UPDATE agents SET status = 'waiting_approval' WHERE id = 'agent_coder'")
        cur.execute(
            """
            INSERT INTO agent_logs (workspace_id, agent_id, action, reasoning, approval_status)
            VALUES (%s, 'agent_coder', %s, %s, 'pending')
            RETURNING id
            """,
            (
                workspace_id,
                "Run SMOTE vs. Class-Weighted Decision Tree reproduction script",
                "Requires researcher approval before executing Python code on local CPU.",
            ),
        )
        log_id = cur.fetchone()["id"]
    db.commit()
    return {"status": "waiting_approval", "log_id": log_id}


async def execute_experiment_with_debugger(
    workspace_id: str,
    db,
    llm_config: dict | None = None,
):
    # Find an anchor node (prefer dataset, fallback to any node)
    with db.cursor() as cur:
        cur.execute(
            "SELECT id FROM nodes WHERE workspace_id = %s ORDER BY CASE WHEN type='dataset' THEN 0 ELSE 1 END LIMIT 1",
            (workspace_id,),
        )
        anchor = cur.fetchone()
    anchor_id = anchor["id"] if anchor else None

    # 1. Create Experiment node & mark Experiment Agent as working
    with db.cursor() as cur:
        cur.execute("UPDATE agents SET status = 'working' WHERE id = 'agent_coder'")
    exp_id = uuid.uuid4().hex
    exp_x, exp_y = await get_free_position(workspace_id, 120, 440, db)
    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO nodes (id, workspace_id, type, title, content, pos_x, pos_y) VALUES (%s, %s, 'experiment', %s, %s, %s, %s)",
            (exp_id, workspace_id, "SMOTE vs Weighted DT (k=5)", "Reproducing Chawla et al. (2002) baseline", exp_x, exp_y),
        )
        if anchor_id:
            cur.execute(
                "INSERT INTO edges (id, workspace_id, source_id, target_id, label, is_ai_suggested) VALUES (%s, %s, %s, %s, 'reproduces', TRUE)",
                (uuid.uuid4().hex, workspace_id, anchor_id, exp_id),
            )
    db.commit()

    # 2. Run initial script (hits InvalidParameterError)
    run1 = _run_experiment_script(BUGGY_EXPERIMENT_SCRIPT)

    if run1.returncode != 0:
        err_line = run1.stderr.strip().splitlines()[-1] if run1.stderr else "Execution error"

        # 3. Hand off to Debugger Agent + local Llama
        with db.cursor() as cur:
            cur.execute("UPDATE agents SET status = 'working' WHERE id = 'agent_debugger'")
        db.commit()

        used_fallback = False
        try:
            debug_res = await call_llm_json(
                f"""A scikit-learn script failed with: {err_line}
Explain the fix in one short sentence. Return ONLY JSON: {{"fix_summary": "..."}}""",
                config=llm_config,
                timeout=10.0,
            )
            fix_summary = debug_res.get("fix_summary")
            if not isinstance(fix_summary, str) or not fix_summary.strip():
                raise ValueError("Ollama returned no valid fix_summary")
        except Exception:
            fix_summary = "Replaced deprecated max_features='auto' with max_features=None."
            used_fallback = True

        # Save failure + fix to research_memory & canvas
        fix_node_id = uuid.uuid4().hex
        fix_x, fix_y = await get_free_position(workspace_id, exp_x + 300, exp_y, db)
        with db.cursor() as cur:
            cur.execute(
                "INSERT INTO nodes (id, workspace_id, type, title, content, pos_x, pos_y) VALUES (%s, %s, 'error_fix', %s, %s, %s, %s)",
                (fix_node_id, workspace_id, "Fix: max_features='auto'", fix_summary, fix_x, fix_y),
            )
            cur.execute(
                "INSERT INTO edges (id, workspace_id, source_id, target_id, label, is_ai_suggested) VALUES (%s, %s, %s, %s, 'fixed_by', TRUE)",
                (uuid.uuid4().hex, workspace_id, exp_id, fix_node_id),
            )
            cur.execute(
                "INSERT INTO research_memory (workspace_id, experiment_node_id, agent_id, outcome, error_signature, resolution) VALUES (%s, %s, 'agent_debugger', 'fix', %s, %s) RETURNING id",
                (workspace_id, exp_id, err_line, fix_summary),
            )
            cur.fetchone()
            cur.execute(
                "INSERT INTO agent_logs (workspace_id, agent_id, node_id, action, reasoning, approval_status) VALUES (%s, 'agent_debugger', %s, %s, %s, 'auto') RETURNING id",
                (
                    workspace_id,
                    fix_node_id,
                    "Caught & patched scikit-learn error",
                    f"{fix_summary} (Ollama unavailable or returned invalid JSON; deterministic fix applied.)"
                    if used_fallback
                    else fix_summary,
                ),
            )
            cur.fetchone()
            cur.execute(
                "UPDATE agents SET status = 'idle', tasks_completed = tasks_completed + 1, rating_score = rating_score + 0.2 WHERE id = 'agent_debugger'"
            )
        db.commit()

    # 4. Run patched script
    run2 = _run_experiment_script(FIXED_EXPERIMENT_SCRIPT)
    if run2.returncode != 0:
        detail = run2.stderr.strip() or run2.stdout.strip() or "Fixed experiment script exited unsuccessfully."
        await _record_experiment_failure(workspace_id, exp_id, detail, db)
        return {"status": "error", "detail": detail}
    try:
        metrics = json.loads(run2.stdout.strip())
        required_metrics = {"baseline_auc", "baseline_f1", "smote_auc", "smote_f1"}
        if not isinstance(metrics, dict) or not required_metrics.issubset(metrics):
            raise ValueError("Experiment output is missing required metric values.")
    except (json.JSONDecodeError, TypeError, ValueError) as exc:
        detail = f"Could not parse experiment metrics: {exc}"
        await _record_experiment_failure(workspace_id, exp_id, detail, db)
        return {"status": "error", "detail": detail}

    # 5. Create Result node & log success
    res_node_id = uuid.uuid4().hex
    res_title = f"AUC: SMOTE {metrics['smote_auc']} vs Base {metrics['baseline_auc']}"
    res_x, res_y = await get_free_position(workspace_id, exp_x, exp_y + 180, db)
    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO nodes (id, workspace_id, type, title, content, metadata_json, pos_x, pos_y) VALUES (%s, %s, 'result', %s, %s, %s, %s, %s)",
            (res_node_id, workspace_id, res_title, json.dumps(metrics), json.dumps(metrics), res_x, res_y),
        )
        cur.execute(
            "INSERT INTO edges (id, workspace_id, source_id, target_id, label, is_ai_suggested) VALUES (%s, %s, %s, %s, 'produced', TRUE)",
            (uuid.uuid4().hex, workspace_id, exp_id, res_node_id),
        )
        cur.execute(
            "INSERT INTO research_memory (workspace_id, experiment_node_id, agent_id, outcome, resolution) VALUES (%s, %s, 'agent_coder', 'success', %s) RETURNING id",
            (workspace_id, exp_id, res_title),
        )
        cur.fetchone()
        cur.execute(
            "INSERT INTO agent_logs (workspace_id, agent_id, node_id, action, reasoning, approval_status) VALUES (%s, 'agent_coder', %s, %s, %s, 'auto') RETURNING id",
            (workspace_id, res_node_id, f"Reproduction complete: {res_title}", "Executed patched script on CPU and recorded metrics."),
        )
        cur.fetchone()
        cur.execute(
            "UPDATE agents SET status = 'idle', tasks_completed = tasks_completed + 1, rating_score = rating_score + 0.2 WHERE id = 'agent_coder'"
        )
    db.commit()

    return {"status": "completed", "metrics": metrics}


WHAT_IF_SCRIPT_TEMPLATE = """
import json
import numpy as np
from sklearn.datasets import make_classification
from sklearn.model_selection import train_test_split
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.neighbors import NearestNeighbors
from sklearn.metrics import roc_auc_score, f1_score

def simple_smote(X, y, k={k_neighbors}):
    X_min = X[y == 1]
    n_needed = int(np.sum(y == 0) - np.sum(y == 1))
    nn = NearestNeighbors(n_neighbors=k + 1).fit(X_min)
    _, indices = nn.kneighbors(X_min)
    rng = np.random.default_rng(42)
    synth = []
    for _ in range(n_needed):
        i = rng.integers(0, len(X_min))
        neighbor = X_min[indices[i, rng.integers(1, k + 1)]]
        synth.append(X_min[i] + rng.random() * (neighbor - X_min[i]))
    return np.vstack([X, np.array(synth)]), np.concatenate([y, np.ones(n_needed, dtype=int)])

X, y = make_classification(
    n_samples=768, n_features=8, weights=[0.65, 0.35], random_state=42
)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=42, stratify=y)

X_sm, y_sm = simple_smote(X_train, y_train, k={k_neighbors})
if "{model_type}" == "random_forest":
    clf = RandomForestClassifier(n_estimators=100, random_state=42)
else:
    clf = DecisionTreeClassifier(max_depth=5, random_state=42)

clf.fit(X_sm, y_sm)
auc = roc_auc_score(y_test, clf.predict_proba(X_test)[:, 1])
f1 = f1_score(y_test, clf.predict(X_test))

print(json.dumps({{
    "model": "{model_type}",
    "k_neighbors": {k_neighbors},
    "smote_auc": round(float(auc), 3),
    "smote_f1": round(float(f1), 3)
}}))
"""


async def run_what_if_experiment(
    workspace_id: str,
    question: str,
    db,
    llm_config: dict | None = None,
):
    with db.cursor() as cur:
        cur.execute("UPDATE agents SET status = 'working' WHERE id = 'agent_coder'")
    db.commit()

    # 1. Ask local Llama to parse the "What If" parameters
    model_type = "random_forest" if "forest" in question.lower() or "rf" in question.lower() else "decision_tree"
    k_neighbors = 3
    try:
        parsed = await call_llm_json(
            f"""Parse this research 'what if' question: "{question}"
Return ONLY JSON: {{"model_type": "random_forest" or "decision_tree", "k_neighbors": integer between 2 and 10, "reasoning": "1 short sentence"}}""",
            config=llm_config,
        )
        if parsed.get("model_type") in ("random_forest", "decision_tree"):
            model_type = parsed["model_type"]
        if isinstance(parsed.get("k_neighbors"), int) and 2 <= parsed["k_neighbors"] <= 10:
            k_neighbors = parsed["k_neighbors"]
        reasoning = parsed.get("reasoning", f"Testing {model_type} with k={k_neighbors}.")
    except Exception:
        reasoning = f"Testing {model_type} with k={k_neighbors} based on user what-if prompt."

    # 2. Find the latest experiment node to branch off from
    with db.cursor() as cur:
        cur.execute(
            "SELECT id FROM nodes WHERE workspace_id = %s AND type = 'experiment' ORDER BY created_at DESC LIMIT 1",
            (workspace_id,),
        )
        prev_exp = cur.fetchone()
    prev_exp_id = prev_exp["id"] if prev_exp else None

    # 3. Create the new branched Experiment node
    exp_id = uuid.uuid4().hex
    exp_title = f"What-If: {model_type.replace('_', ' ').title()} (k={k_neighbors})"
    exp_x, exp_y = await get_free_position(workspace_id, 420, 620, db)
    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO nodes (id, workspace_id, type, title, content, pos_x, pos_y) VALUES (%s, %s, 'experiment', %s, %s, %s, %s)",
            (exp_id, workspace_id, exp_title, question, exp_x, exp_y),
        )
        if prev_exp_id:
            cur.execute(
                "INSERT INTO edges (id, workspace_id, source_id, target_id, label, is_ai_suggested) VALUES (%s, %s, %s, %s, 'what_if_branch', TRUE)",
                (uuid.uuid4().hex, workspace_id, prev_exp_id, exp_id),
            )
    db.commit()

    # 4. Run the modified Python script on CPU
    script = WHAT_IF_SCRIPT_TEMPLATE.format(model_type=model_type, k_neighbors=k_neighbors)
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as f:
        f.write(script)
        script_path = Path(f.name)

    run = subprocess.run([sys.executable, str(script_path)], capture_output=True, text=True)
    script_path.unlink(missing_ok=True)

    if run.returncode != 0:
        with db.cursor() as cur:
            cur.execute("UPDATE agents SET status = 'idle' WHERE id = 'agent_coder'")
        db.commit()
        return {"error": run.stderr}

    metrics = json.loads(run.stdout.strip())

    # 5. Create linked Result node & log to Research Memory + Activity Feed
    res_id = uuid.uuid4().hex
    res_title = f"AUC: {metrics['smote_auc']} | F1: {metrics['smote_f1']} ({model_type})"
    res_x, res_y = await get_free_position(workspace_id, exp_x, exp_y + 180, db)
    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO nodes (id, workspace_id, type, title, content, metadata_json, pos_x, pos_y) VALUES (%s, %s, 'result', %s, %s, %s, %s, %s)",
            (res_id, workspace_id, res_title, json.dumps(metrics), json.dumps(metrics), res_x, res_y),
        )
        cur.execute(
            "INSERT INTO edges (id, workspace_id, source_id, target_id, label, is_ai_suggested) VALUES (%s, %s, %s, %s, 'produced', TRUE)",
            (uuid.uuid4().hex, workspace_id, exp_id, res_id),
        )
        cur.execute(
            "INSERT INTO agent_logs (workspace_id, agent_id, node_id, action, reasoning, approval_status) VALUES (%s, 'agent_coder', %s, %s, %s, 'auto') RETURNING id",
            (workspace_id, res_id, f"What-If complete: {res_title}", reasoning),
        )
        cur.fetchone()
        cur.execute(
            "UPDATE agents SET status = 'idle', tasks_completed = tasks_completed + 1, rating_score = rating_score + 0.1 WHERE id = 'agent_coder'"
        )
    db.commit()

    return {"status": "completed", "metrics": metrics}
