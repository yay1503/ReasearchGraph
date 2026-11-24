import json
import uuid
import httpx
import aiosqlite

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