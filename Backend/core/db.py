import hashlib
import hmac
import os
import secrets
import uuid
from pathlib import Path

import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import RealDictCursor

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv()


def get_connection():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is not set in environment or .env")
    return psycopg2.connect(database_url, cursor_factory=RealDictCursor)


def get_db():
    conn = get_connection()
    try:
        yield conn
    finally:
        conn.close()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        100_000,
    )
    return f"{salt}${dk.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt, expected_hex = stored_hash.split("$", 1)
    except ValueError:
        return False
    dk = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        100_000,
    )
    return hmac.compare_digest(dk.hex(), expected_hex)


def init_db():
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS workspaces (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
            cur.execute(
                "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS user_id TEXT;"
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS nodes (
                    id TEXT PRIMARY KEY,
                    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                    type TEXT NOT NULL CHECK (
                        type IN ('paper', 'question', 'dataset', 'code', 'experiment', 'result', 'error_fix', 'note', 'group')
                    ),
                    title TEXT NOT NULL,
                    url TEXT DEFAULT '',
                    content TEXT DEFAULT '',
                    metadata_json TEXT DEFAULT '{}',
                    tags_json TEXT DEFAULT '[]',
                    group_id TEXT DEFAULT NULL REFERENCES nodes(id) ON DELETE SET NULL,
                    pos_x DOUBLE PRECISION DEFAULT 0.0,
                    pos_y DOUBLE PRECISION DEFAULT 0.0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS edges (
                    id TEXT PRIMARY KEY,
                    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                    source_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
                    target_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
                    label TEXT DEFAULT '',
                    is_ai_suggested BOOLEAN DEFAULT FALSE,
                    status TEXT DEFAULT 'accepted' CHECK (status IN ('pending', 'accepted', 'rejected')),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS agents (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    role TEXT NOT NULL,
                    status TEXT DEFAULT 'idle' CHECK (status IN ('idle', 'working', 'paused', 'waiting_approval')),
                    rating_score DOUBLE PRECISION DEFAULT 1.0,
                    tasks_completed INTEGER DEFAULT 0,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS agent_logs (
                    id SERIAL PRIMARY KEY,
                    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
                    node_id TEXT DEFAULT NULL REFERENCES nodes(id) ON DELETE SET NULL,
                    action TEXT NOT NULL,
                    reasoning TEXT DEFAULT '',
                    payload_json TEXT DEFAULT '{}',
                    approval_status TEXT DEFAULT 'auto' CHECK (
                        approval_status IN ('auto', 'pending', 'approved', 'rejected', 'redirected')
                    ),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
            cur.execute(
                "ALTER TABLE agent_logs ADD COLUMN IF NOT EXISTS payload_json TEXT DEFAULT '{}';"
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS research_memory (
                    id SERIAL PRIMARY KEY,
                    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                    experiment_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
                    agent_id TEXT DEFAULT NULL REFERENCES agents(id) ON DELETE SET NULL,
                    outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure', 'fix')),
                    error_signature TEXT DEFAULT '',
                    resolution TEXT DEFAULT '',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS workspace_shares (
                    share_token TEXT PRIMARY KEY,
                    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                    role TEXT DEFAULT 'viewer',
                    snapshot_json TEXT DEFAULT NULL,
                    shared_by_name TEXT DEFAULT '',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
            cur.execute(
                "ALTER TABLE workspace_shares ADD COLUMN IF NOT EXISTS snapshot_json TEXT DEFAULT NULL;"
            )
            cur.execute(
                "ALTER TABLE workspace_shares ADD COLUMN IF NOT EXISTS shared_by_name TEXT DEFAULT '';"
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS workspace_collaborators (
                    id SERIAL PRIMARY KEY,
                    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                    user_email TEXT NOT NULL,
                    role TEXT DEFAULT 'editor' CHECK (role IN ('viewer', 'editor')),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE (workspace_id, user_email)
                );
                """
            )
            cur.execute(
                """
                INSERT INTO agents (id, name, role) VALUES
                    ('agent_reader', 'Reader Agent', 'reader'),
                    ('agent_clusterer', 'Clusterer Agent', 'clusterer'),
                    ('agent_coder', 'Experiment Agent', 'coder'),
                    ('agent_debugger', 'Debugger Agent', 'debugger'),
                    ('agent_planner', 'Harness Agent', 'planner')
                ON CONFLICT (id) DO NOTHING;
                """
            )

            # Seed demo user and starter workspace if missing
            cur.execute(
                "SELECT id FROM users WHERE email = %s",
                ("demo@researchgraph.ai",),
            )
            demo_user = cur.fetchone()
            if demo_user is None:
                demo_user_id = uuid.uuid4().hex
                cur.execute(
                    """
                    INSERT INTO users (id, name, email, password_hash)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (
                        demo_user_id,
                        "Demo Researcher",
                        "demo@researchgraph.ai",
                        hash_password("demo1234"),
                    ),
                )
            else:
                demo_user_id = demo_user["id"]

            cur.execute(
                "SELECT COUNT(*) AS cnt FROM workspaces WHERE user_id = %s",
                (demo_user_id,),
            )
            ws_count = cur.fetchone()["cnt"]
            if ws_count == 0:
                ws_id = uuid.uuid4().hex
                cur.execute(
                    """
                    INSERT INTO workspaces (id, name, description, user_id)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (ws_id, "SMOTE Research Workspace", "", demo_user_id),
                )
                cur.execute(
                    """
                    INSERT INTO nodes (id, workspace_id, type, title, content, pos_x, pos_y)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        uuid.uuid4().hex,
                        ws_id,
                        "paper",
                        "SMOTE: Synthetic Minority Over-sampling Technique",
                        "",
                        120.0,
                        120.0,
                    ),
                )
                cur.execute(
                    """
                    INSERT INTO nodes (id, workspace_id, type, title, content, pos_x, pos_y)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        uuid.uuid4().hex,
                        ws_id,
                        "question",
                        "Does SMOTE beat class-weighted Decision Trees on Pima Diabetes?",
                        "",
                        460.0,
                        120.0,
                    ),
                )

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
