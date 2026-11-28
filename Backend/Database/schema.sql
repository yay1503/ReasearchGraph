-- Enable concurrent reads/writes and enforce foreign key constraints
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- 1. WORKSPACES: Multiple independent workspaces with save & resume
CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. NODES: Papers, datasets, code, experiments, results, notes, and topic groups
CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (
        type IN ('paper', 'question', 'dataset', 'code', 'experiment', 'result', 'error_fix', 'note', 'group')
    ),
    title TEXT NOT NULL,
    url TEXT DEFAULT '',
    content TEXT DEFAULT '',              -- Summary, note text, or code snippet
    metadata_json TEXT DEFAULT '{}',      -- Flexible JSON (metrics, hyperparameters, preview)
    tags_json TEXT DEFAULT '[]',          -- JSON array of tags, e.g. ["smote", "baseline"]
    group_id TEXT DEFAULT NULL,           -- Parent group node ID for topic clustering
    pos_x REAL DEFAULT 0.0,               -- Canvas X coordinate
    pos_y REAL DEFAULT 0.0,               -- Canvas Y coordinate
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES nodes(id) ON DELETE SET NULL
);

-- 3. EDGES: Relationships between nodes (supports AI suggestions & user overrides)
CREATE TABLE IF NOT EXISTS edges (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    label TEXT DEFAULT '',                -- e.g., "reproduces", "answers", "failed_with", "fixed_by"
    is_ai_suggested INTEGER DEFAULT 0,    -- 1 = suggested by agent, 0 = created by user
    status TEXT DEFAULT 'accepted' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (source_id) REFERENCES nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (target_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- 4. AGENTS: The evolving AI agent team and their ratings
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,                   -- e.g., 'reader', 'clusterer', 'coder', 'debugger'
    status TEXT DEFAULT 'idle' CHECK (status IN ('idle', 'working', 'paused', 'waiting_approval')),
    rating_score REAL DEFAULT 1.0,        -- Updated based on result value / user feedback
    tasks_completed INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,          -- 1 = active, 0 = retired specialist
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. AGENT LOGS: Live transparency, human-in-the-loop approvals, and timeline replay
CREATE TABLE IF NOT EXISTS agent_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    node_id TEXT DEFAULT NULL,            -- Optional link to the node being acted on
    action TEXT NOT NULL,                 -- e.g., "Generated reproduction script"
    reasoning TEXT DEFAULT '',            -- Why the agent took this step
    approval_status TEXT DEFAULT 'auto' CHECK (
        approval_status IN ('auto', 'pending', 'approved', 'rejected', 'redirected')
    ),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE SET NULL
);

-- 6. RESEARCH MEMORY: Tracks experiment successes, failures, and fixes
CREATE TABLE IF NOT EXISTS research_memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id TEXT NOT NULL,
    experiment_node_id TEXT NOT NULL,
    agent_id TEXT DEFAULT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure', 'fix')),
    error_signature TEXT DEFAULT '',      -- e.g., "ModuleNotFoundError: imblearn"
    resolution TEXT DEFAULT '',           -- What fixed it or what was learned
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (experiment_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
);

-- FULL-TEXT SEARCH (FTS5): Instant search across node titles, content, and tags
CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
    node_id UNINDEXED,
    title,
    content,
    tags_json
);

-- Keep FTS5 automatically synced with the nodes table
CREATE TRIGGER IF NOT EXISTS nodes_ai AFTER INSERT ON nodes BEGIN
    INSERT INTO nodes_fts(node_id, title, content, tags_json)
    VALUES (new.id, new.title, new.content, new.tags_json);
END;

CREATE TRIGGER IF NOT EXISTS nodes_ad AFTER DELETE ON nodes BEGIN
    DELETE FROM nodes_fts WHERE node_id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS nodes_au AFTER UPDATE ON nodes BEGIN
    DELETE FROM nodes_fts WHERE node_id = old.id;
    INSERT INTO nodes_fts(node_id, title, content, tags_json)
    VALUES (new.id, new.title, new.content, new.tags_json);
END;

-- SEED DATA: Default Agent Team
INSERT OR IGNORE INTO agents (id, name, role) VALUES
    ('agent_reader', 'Reader Agent', 'reader'),
    ('agent_clusterer', 'Clusterer Agent', 'clusterer'),
    ('agent_coder', 'Experiment Agent', 'coder'),
    ('agent_debugger', 'Debugger Agent', 'debugger');