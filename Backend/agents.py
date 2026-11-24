import json
import uuid
import httpx
import aiosqlite
import sys
import subprocess
import tempfile
from pathlib import Path

OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "llama3"  # Change this to match your `ollama list` name


async def call_llama_json(prompt: str) -> dict:
    async with httpx.AsyncClient(timeout=120.0) as client:
        res = await client.post(
            OLLAMA_URL,
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "format": "json",
                "stream": False,
            },
        )
        res.raise_for_status()
        raw_text = res.json()["response"]
        return json.loads(raw_text)


async def run_reader_and_clusterer(workspace_id: str, db: aiosqlite.Connection):
    # 1. Fetch existing paper and question nodes
    cursor = await db.execute(
        "SELECT id, type, title, content FROM nodes WHERE workspace_id = ? AND type IN ('paper', 'question')",
        (workspace_id,),
    )
    sources = [dict(row) for row in await cursor.fetchall()]
    if not sources:
        return {"error": "Add at least one Paper or Question node first."}

    # 2. Mark Reader Agent as working
    await db.execute("UPDATE agents SET status = 'working' WHERE id = 'agent_reader'")
    await db.commit()

    source_text = "\n".join([f"- [{s['type'].upper()}] {s['title']} (id: {s['id']})" for s in sources])
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
        result = await call_llama_json(prompt)
    except Exception as e:
        await db.execute("UPDATE agents SET status = 'idle' WHERE id = 'agent_reader'")
        await db.commit()
        return {"error": f"Ollama call failed: {str(e)}"}

    # 3. Switch to Clusterer Agent to insert nodes & suggested edges
    await db.execute("UPDATE agents SET status = 'idle', tasks_completed = tasks_completed + 1 WHERE id = 'agent_reader'")
    await db.execute("UPDATE agents SET status = 'working' WHERE id = 'agent_clusterer'")
    await db.commit()

    created_nodes = []
    for i, item in enumerate(result.get("new_nodes", [])):
        node_id = uuid.uuid4().hex
        node_type = item.get("type", "note")
        if node_type not in ("dataset", "note"):
            node_type = "note"

        pos_x = 120 + (i * 260)
        pos_y = 280

        await db.execute(
            "INSERT INTO nodes (id, workspace_id, type, title, content, pos_x, pos_y) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (node_id, workspace_id, node_type, item.get("title", "Untitled"), item.get("content", ""), pos_x, pos_y),
        )

        target_id = item.get("connect_to_id") or sources[0]["id"]
        edge_id = uuid.uuid4().hex
        await db.execute(
            "INSERT INTO edges (id, workspace_id, source_id, target_id, label, is_ai_suggested, status) VALUES (?, ?, ?, ?, ?, 1, 'accepted')",
            (edge_id, workspace_id, target_id, node_id, item.get("edge_label", "extracted_from")),
        )
        created_nodes.append(node_id)

    # 4. Log activity for transparency and reset Clusterer Agent
    await db.execute(
        """
        INSERT INTO agent_logs (workspace_id, agent_id, action, reasoning, approval_status)
        VALUES (?, 'agent_reader', ?, ?, 'auto')
        """,
        (workspace_id, f"Analyzed {len(sources)} source(s) and extracted {len(created_nodes)} new nodes.", result.get("reasoning", "")),
    )
    await db.execute("UPDATE agents SET status = 'idle', tasks_completed = tasks_completed + 1, rating_score = rating_score + 0.1 WHERE id = 'agent_clusterer'")
    await db.commit()

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


async def request_experiment_approval(workspace_id: str, db: aiosqlite.Connection):
    await db.execute("UPDATE agents SET status = 'waiting_approval' WHERE id = 'agent_coder'")
    await db.execute(
        """
        INSERT INTO agent_logs (workspace_id, agent_id, action, reasoning, approval_status)
        VALUES (?, 'agent_coder', ?, ?, 'pending')
        """,
        (
            workspace_id,
            "Run SMOTE vs. Class-Weighted Decision Tree reproduction script",
            "Requires researcher approval before executing Python code on local CPU.",
        ),
    )
    await db.commit()
    return {"status": "waiting_approval"}


async def execute_experiment_with_debugger(workspace_id: str, db: aiosqlite.Connection):
    # Find an anchor node (prefer dataset, fallback to any node)
    cursor = await db.execute(
        "SELECT id FROM nodes WHERE workspace_id = ? ORDER BY CASE WHEN type='dataset' THEN 0 ELSE 1 END LIMIT 1",
        (workspace_id,),
    )
    anchor = await cursor.fetchone()
    anchor_id = anchor["id"] if anchor else None

    # 1. Create Experiment node & mark Experiment Agent as working
    await db.execute("UPDATE agents SET status = 'working' WHERE id = 'agent_coder'")
    exp_id = uuid.uuid4().hex
    await db.execute(
        "INSERT INTO nodes (id, workspace_id, type, title, content, pos_x, pos_y) VALUES (?, ?, 'experiment', ?, ?, ?, ?)",
        (exp_id, workspace_id, "SMOTE vs Weighted DT (k=5)", "Reproducing Chawla et al. (2002) baseline", 120, 440),
    )
    if anchor_id:
        await db.execute(
            "INSERT INTO edges (id, workspace_id, source_id, target_id, label, is_ai_suggested) VALUES (?, ?, ?, ?, 'reproduces', 1)",
            (uuid.uuid4().hex, workspace_id, anchor_id, exp_id),
        )
    await db.commit()

    # 2. Run initial script (hits InvalidParameterError)
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as f:
        f.write(BUGGY_EXPERIMENT_SCRIPT)
        buggy_path = Path(f.name)

    run1 = subprocess.run([sys.executable, str(buggy_path)], capture_output=True, text=True)
    buggy_path.unlink(missing_ok=True)

    if run1.returncode != 0:
        err_line = run1.stderr.strip().splitlines()[-1] if run1.stderr else "Execution error"

        # 3. Hand off to Debugger Agent + local Llama
        await db.execute("UPDATE agents SET status = 'working' WHERE id = 'agent_debugger'")
        await db.commit()

        try:
            debug_res = await call_llama_json(
                f"""A scikit-learn script failed with: {err_line}
Explain the fix in one short sentence. Return ONLY JSON: {{"fix_summary": "..."}}"""
            )
            fix_summary = debug_res.get("fix_summary", "Replaced deprecated max_features='auto' with max_features=None.")
        except Exception:
            fix_summary = "Replaced deprecated max_features='auto' with max_features=None."

        # Save failure + fix to research_memory & canvas
        fix_node_id = uuid.uuid4().hex
        await db.execute(
            "INSERT INTO nodes (id, workspace_id, type, title, content, pos_x, pos_y) VALUES (?, ?, 'error_fix', ?, ?, ?, ?)",
            (fix_node_id, workspace_id, "Fix: max_features='auto'", fix_summary, 420, 440),
        )
        await db.execute(
            "INSERT INTO edges (id, workspace_id, source_id, target_id, label, is_ai_suggested) VALUES (?, ?, ?, ?, 'fixed_by', 1)",
            (uuid.uuid4().hex, workspace_id, exp_id, fix_node_id),
        )
        await db.execute(
            "INSERT INTO research_memory (workspace_id, experiment_node_id, agent_id, outcome, error_signature, resolution) VALUES (?, ?, 'agent_debugger', 'fix', ?, ?)",
            (workspace_id, exp_id, err_line, fix_summary),
        )
        await db.execute(
            "INSERT INTO agent_logs (workspace_id, agent_id, node_id, action, reasoning, approval_status) VALUES (?, 'agent_debugger', ?, ?, ?, 'auto')",
            (workspace_id, fix_node_id, "Caught & patched scikit-learn error", fix_summary),
        )
        await db.execute("UPDATE agents SET status = 'idle', tasks_completed = tasks_completed + 1, rating_score = rating_score + 0.2 WHERE id = 'agent_debugger'")
        await db.commit()

    # 4. Run patched script
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as f:
        f.write(FIXED_EXPERIMENT_SCRIPT)
        fixed_path = Path(f.name)

    run2 = subprocess.run([sys.executable, str(fixed_path)], capture_output=True, text=True)
    fixed_path.unlink(missing_ok=True)
    metrics = json.loads(run2.stdout.strip())

    # 5. Create Result node & log success
    res_node_id = uuid.uuid4().hex
    res_title = f"AUC: SMOTE {metrics['smote_auc']} vs Base {metrics['baseline_auc']}"
    await db.execute(
        "INSERT INTO nodes (id, workspace_id, type, title, content, metadata_json, pos_x, pos_y) VALUES (?, ?, 'result', ?, ?, ?, ?, ?)",
        (res_node_id, workspace_id, res_title, json.dumps(metrics), json.dumps(metrics), 120, 600),
    )
    await db.execute(
        "INSERT INTO edges (id, workspace_id, source_id, target_id, label, is_ai_suggested) VALUES (?, ?, ?, ?, 'produced', 1)",
        (uuid.uuid4().hex, workspace_id, exp_id, res_node_id),
    )
    await db.execute(
        "INSERT INTO research_memory (workspace_id, experiment_node_id, agent_id, outcome, resolution) VALUES (?, ?, 'agent_coder', 'success', ?)",
        (workspace_id, exp_id, res_title),
    )
    await db.execute(
        "INSERT INTO agent_logs (workspace_id, agent_id, node_id, action, reasoning, approval_status) VALUES (?, 'agent_coder', ?, ?, ?, 'auto')",
        (workspace_id, res_node_id, f"Reproduction complete: {res_title}", "Executed patched script on CPU and recorded metrics."),
    )
    await db.execute("UPDATE agents SET status = 'idle', tasks_completed = tasks_completed + 1, rating_score = rating_score + 0.2 WHERE id = 'agent_coder'")
    await db.commit()

    return {"status": "completed", "metrics": metrics}