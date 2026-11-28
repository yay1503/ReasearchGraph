import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Play,
  Save,
  X,
  Plus,
  Check,
  AlertCircle,
  FileCode,
  FileText,
  ListChecks,
  Sparkles,
  Terminal,
  Loader2,
  BookOpen,
  Package,
  ArrowUpRight,
} from 'lucide-react';
import { getLLMHeaders } from '../utils/llmConfig';

const API_BASE = 'http://127.0.0.1:8000';

function getAuthHeaders() {
  try {
    const token = localStorage.getItem('rg_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export default function SandboxIDE({
  workspaceId,
  paperNodes = [],
  onClose,
  onLogResult,
}) {
  // Sandbox metadata & files
  const [loadingState, setLoadingState] = useState(true);
  const [stateError, setStateError] = useState('');
  const [meta, setMeta] = useState(null);
  const [files, setFiles] = useState([]);
  const [dependencies, setDependencies] = useState({
    has_requirements: false,
    installed: [],
    missing: [],
  });

  // Left sidebar navigation & new-file state
  const [sidebarTab, setSidebarTab] = useState('files'); // 'files' | 'tasks'
  const [creatingFile, setCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFileError, setNewFileError] = useState('');
  const [creatingFileBusy, setCreatingFileBusy] = useState(false);

  // Empty-state paper scaffold state
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [paperTitleInput, setPaperTitleInput] = useState('');
  const [paperContentInput, setPaperContentInput] = useState('');
  const [scaffolding, setScaffolding] = useState(false);
  const [scaffoldError, setScaffoldError] = useState('');

  // Active editor state
  const [activeFile, setActiveFile] = useState('');
  const [code, setCode] = useState('');
  const [savedCode, setSavedCode] = useState('');
  const [loadingFile, setLoadingFile] = useState(false);
  const [fileError, setFileError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState('');
  const [pendingSwitchFile, setPendingSwitchFile] = useState(null);

  // Terminal / execution state
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [lastRunFile, setLastRunFile] = useState('');
  const [runError, setRunError] = useState('');
  const [loggedSuccess, setLoggedSuccess] = useState(false);

  // AI tweak assistant state
  const [tweakInstruction, setTweakInstruction] = useState('');
  const [tweaking, setTweaking] = useState(false);
  const [tweakError, setTweakError] = useState('');
  const [tweakSuggestion, setTweakSuggestion] = useState(null);
  const [applyingTweak, setApplyingTweak] = useState(false);

  // Task toggling state
  const [togglingTaskId, setTogglingTaskId] = useState(null);

  const editorRef = useRef(null);
  const gutterRef = useRef(null);
  const newFileInputRef = useRef(null);

  const isDirty = Boolean(activeFile) && code !== savedCode;

  // Normalize paper nodes for selector
  const normalizedPapers = useMemo(() => {
    if (!Array.isArray(paperNodes)) return [];
    return paperNodes.map((n) => ({
      id: n.id,
      title: n.data?.title || n.data?.label || n.title || 'Untitled Paper',
      content:
        n.data?.content ||
        n.data?.summary ||
        n.data?.description ||
        n.content ||
        '',
    }));
  }, [paperNodes]);

  useEffect(() => {
    if (normalizedPapers.length > 0 && !selectedNodeId && !paperTitleInput) {
      const first = normalizedPapers[0];
      setSelectedNodeId(String(first.id));
      setPaperTitleInput(first.title);
      setPaperContentInput(first.content);
    }
  }, [normalizedPapers, selectedNodeId, paperTitleInput]);

  const loadFile = useCallback(
    async (filePath) => {
      if (!workspaceId || !filePath) return;
      setLoadingFile(true);
      setFileError('');
      setPendingSwitchFile(null);
      try {
        const res = await fetch(
          `${API_BASE}/workspaces/${workspaceId}/sandbox/file?path=${encodeURIComponent(
            filePath
          )}`,
          { headers: { ...getAuthHeaders() } }
        );
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || `Failed to load ${filePath}`);
        }
        const data = await res.json();
        setActiveFile(data.path || filePath);
        setCode(data.content ?? '');
        setSavedCode(data.content ?? '');
        setTweakSuggestion(null);
        setTweakError('');
      } catch (err) {
        setFileError(err.message || 'Could not open file.');
      } finally {
        setLoadingFile(false);
      }
    },
    [workspaceId]
  );

  const fetchSandboxState = useCallback(
    async (preferredFile = null) => {
      if (!workspaceId) return;
      setLoadingState(true);
      setStateError('');
      try {
        const res = await fetch(
          `${API_BASE}/workspaces/${workspaceId}/sandbox/state`,
          { headers: { ...getAuthHeaders() } }
        );
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || 'Failed to load sandbox state');
        }
        const data = await res.json();
        const fileList = Array.isArray(data.files) ? data.files : [];
        setMeta(data.meta ?? null);
        setFiles(fileList);
        setDependencies(
          data.dependencies || {
            has_requirements: false,
            installed: [],
            missing: [],
          }
        );

        const target =
          (preferredFile && fileList.includes(preferredFile) && preferredFile) ||
          (activeFile && fileList.includes(activeFile) && activeFile) ||
          (fileList.includes('main.py') && 'main.py') ||
          fileList[0] ||
          '';

        if (target && target !== activeFile) {
          await loadFile(target);
        } else if (!target) {
          setActiveFile('');
          setCode('');
          setSavedCode('');
        }
      } catch (err) {
        setStateError(err.message || 'Unable to connect to sandbox service.');
      } finally {
        setLoadingState(false);
      }
    },
    [workspaceId, activeFile, loadFile]
  );

  useEffect(() => {
    fetchSandboxState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  // Save current file to backend
  const handleSave = useCallback(
    async (overrideContent = null, overridePath = null) => {
      const targetPath = overridePath || activeFile;
      const targetContent = overrideContent !== null ? overrideContent : code;
      if (!workspaceId || !targetPath) return false;

      setSaving(true);
      setFileError('');
      try {
        const res = await fetch(
          `${API_BASE}/workspaces/${workspaceId}/sandbox/file`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              ...getAuthHeaders(),
            },
            body: JSON.stringify({
              path: targetPath,
              content: targetContent,
            }),
          }
        );
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || 'Failed to save file');
        }
        if (targetPath === activeFile) {
          setSavedCode(targetContent);
        }
        setSaveNotice('Saved');
        setTimeout(() => setSaveNotice(''), 1800);
        if (targetPath === 'requirements.txt') {
          fetchSandboxState(targetPath);
        }
        return true;
      } catch (err) {
        setFileError(err.message || 'Failed to save file.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [workspaceId, activeFile, code, fetchSandboxState]
  );

  // Keyboard shortcuts: Ctrl+S / Cmd+S to save, Esc to close if not editing modals
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (activeFile && !saving) {
          handleSave();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFile, saving, handleSave]);

  // Focus inline new file input when toggled
  useEffect(() => {
    if (creatingFile && newFileInputRef.current) {
      newFileInputRef.current.focus();
    }
  }, [creatingFile]);

  const handleSelectFile = (path) => {
    if (path === activeFile) return;
    if (isDirty) {
      setPendingSwitchFile(path);
      return;
    }
    loadFile(path);
  };

  const handleConfirmSwitch = async (saveFirst) => {
    const nextPath = pendingSwitchFile;
    if (!nextPath) return;
    if (saveFirst) {
      const ok = await handleSave();
      if (!ok) return;
    }
    setPendingSwitchFile(null);
    loadFile(nextPath);
  };

  const handleCreateFile = async (e) => {
    e.preventDefault();
    const trimmed = newFileName.trim().replace(/^\/+/, '');
    if (!trimmed) {
      setNewFileError('Enter a filename, e.g. model.py');
      return;
    }
    if (files.includes(trimmed)) {
      setNewFileError('File already exists');
      return;
    }
    setCreatingFileBusy(true);
    setNewFileError('');
    try {
      const starter = trimmed.endsWith('.py')
        ? `# ${trimmed}\n`
        : '';
      const res = await fetch(
        `${API_BASE}/workspaces/${workspaceId}/sandbox/file`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify({ path: trimmed, content: starter }),
        }
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Could not create file');
      }
      setCreatingFile(false);
      setNewFileName('');
      await fetchSandboxState(trimmed);
    } catch (err) {
      setNewFileError(err.message || 'Could not create file');
    } finally {
      setCreatingFileBusy(false);
    }
  };

  const handleScaffold = async (e) => {
    e.preventDefault();
    if (!paperTitleInput.trim() && !selectedNodeId) {
      setScaffoldError('Select a paper node or provide a paper title.');
      return;
    }
    setScaffolding(true);
    setScaffoldError('');
    try {
      const payload = {
        paper_title: paperTitleInput.trim(),
        paper_content: paperContentInput.trim(),
        ...(selectedNodeId ? { node_id: selectedNodeId } : {}),
      };
      const res = await fetch(
        `${API_BASE}/workspaces/${workspaceId}/sandbox/scaffold`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
            ...getLLMHeaders(),
          },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to generate coding sandbox');
      }
      const data = await res.json();
      const generatedFiles = Array.isArray(data.files) ? data.files : [];
      setMeta(data.meta ?? null);
      setFiles(generatedFiles);
      const defaultFile = generatedFiles.includes('main.py')
        ? 'main.py'
        : generatedFiles[0] || '';
      await fetchSandboxState(defaultFile);
    } catch (err) {
      setScaffoldError(err.message || 'Scaffold generation failed.');
    } finally {
      setScaffolding(false);
    }
  };

  const handleRunFile = async () => {
    const entry = activeFile || 'main.py';
    if (!entry) return;
    if (isDirty) {
      const saved = await handleSave();
      if (!saved) return;
    }
    setRunning(true);
    setRunError('');
    setLoggedSuccess(false);
    try {
      const res = await fetch(
        `${API_BASE}/workspaces/${workspaceId}/sandbox/run`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify({ entry_file: entry, timeout: 30 }),
        }
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Execution request failed');
      }
      const data = await res.json();
      setRunResult(data);
      setLastRunFile(entry);
    } catch (err) {
      setRunError(err.message || 'Failed to execute script.');
    } finally {
      setRunning(false);
    }
  };

  const handleToggleTask = async (taskId) => {
    if (!taskId || togglingTaskId) return;
    setTogglingTaskId(taskId);
    try {
      const res = await fetch(
        `${API_BASE}/workspaces/${workspaceId}/sandbox/tasks/${encodeURIComponent(
          taskId
        )}`,
        {
          method: 'PATCH',
          headers: { ...getAuthHeaders() },
        }
      );
      if (!res.ok) {
        throw new Error('Failed to update task');
      }
      const data = await res.json();
      setMeta((prev) => (prev ? { ...prev, tasks: data.tasks } : prev));
    } catch (err) {
      setStateError(err.message || 'Could not update task status.');
    } finally {
      setTogglingTaskId(null);
    }
  };

  const handleSuggestTweak = async (e) => {
    e.preventDefault();
    if (!activeFile || !tweakInstruction.trim()) return;
    setTweaking(true);
    setTweakError('');
    setTweakSuggestion(null);
    try {
      const res = await fetch(
        `${API_BASE}/workspaces/${workspaceId}/sandbox/tweak`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
            ...getLLMHeaders(),
          },
          body: JSON.stringify({
            path: activeFile,
            current_code: code,
            instruction: tweakInstruction.trim(),
          }),
        }
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'AI tweak request failed');
      }
      const data = await res.json();
      setTweakSuggestion({
        explanation: data.explanation || 'Suggested update ready for review.',
        proposed_code: data.proposed_code ?? '',
      });
    } catch (err) {
      setTweakError(err.message || 'Could not generate suggestion.');
    } finally {
      setTweaking(false);
    }
  };

  const handleApplyTweak = async () => {
    if (!tweakSuggestion || !activeFile) return;
    setApplyingTweak(true);
    const updated = tweakSuggestion.proposed_code;
    setCode(updated);
    const ok = await handleSave(updated, activeFile);
    setApplyingTweak(false);
    if (ok) {
      setTweakSuggestion(null);
      setTweakInstruction('');
    }
  };

  const handleLogToGraph = () => {
    if (!runResult || !onLogResult) return;
    onLogResult({
      entryFile: lastRunFile || activeFile,
      stdout: runResult.stdout,
      stderr: runResult.stderr,
      exit_code: runResult.exit_code,
      duration_ms: runResult.duration_ms,
      paperTitle: meta?.paper_title || '',
    });
    setLoggedSuccess(true);
  };

  // Code editor Tab & Shift+Tab support + synchronized line numbers
  const handleEditorKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.target;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const indent = '    ';

      if (!e.shiftKey) {
        const nextValue =
          code.substring(0, start) + indent + code.substring(end);
        setCode(nextValue);
        requestAnimationFrame(() => {
          if (editorRef.current) {
            editorRef.current.selectionStart = start + indent.length;
            editorRef.current.selectionEnd = start + indent.length;
          }
        });
      } else {
        // Outdent current line up to 4 spaces
        const lineStart = code.lastIndexOf('\n', start - 1) + 1;
        const linePrefix = code.slice(lineStart, start);
        const match = linePrefix.match(/^ {1,4}/);
        if (match) {
          const removeLen = match[0].length;
          const nextValue =
            code.slice(0, lineStart) + code.slice(lineStart + removeLen);
          setCode(nextValue);
          requestAnimationFrame(() => {
            if (editorRef.current) {
              const nextCursor = Math.max(lineStart, start - removeLen);
              editorRef.current.selectionStart = nextCursor;
              editorRef.current.selectionEnd = nextCursor;
            }
          });
        }
      }
    }
  };

  const syncGutterScroll = () => {
    if (gutterRef.current && editorRef.current) {
      gutterRef.current.scrollTop = editorRef.current.scrollTop;
    }
  };

  const lineCount = useMemo(() => {
    const count = code.split('\n').length;
    return Math.max(count, 1);
  }, [code]);

  const completedTasksCount = useMemo(() => {
    if (!meta?.tasks) return 0;
    return meta.tasks.filter((t) => t.completed).length;
  }, [meta]);

  const hasSandbox = Boolean(meta) || files.length > 0;
  const missingDeps = dependencies?.missing || [];
  const hasReqs = Boolean(dependencies?.has_requirements);

  return (
    <div
      className="rg-sandbox-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Research Coding Sandbox"
    >
      {/* Top Bar */}
      <header className="rg-sandbox-topbar">
        <div className="rg-sandbox-topbar-left">
          <div className="rg-sandbox-brand">
            <FileCode size={17} aria-hidden="true" />
            <span className="rg-sandbox-title">Research Sandbox</span>
          </div>

          {activeFile && (
            <div className="rg-sandbox-active-file" title={activeFile}>
              <span>{activeFile}</span>
              {isDirty && (
                <span
                  className="rg-sandbox-dirty-dot"
                  title="Unsaved changes"
                  aria-label="Unsaved changes"
                />
              )}
              {saveNotice && !isDirty && (
                <span className="rg-sandbox-saved-tag">{saveNotice}</span>
              )}
            </div>
          )}
        </div>

        <div className="rg-sandbox-topbar-actions">
          {hasSandbox && (
            <>
              <button
                type="button"
                className="rg-sandbox-btn rg-sandbox-btn-secondary"
                onClick={() => handleSave()}
                disabled={!activeFile || saving || !isDirty}
                title="Save active file (Ctrl+S)"
              >
                {saving ? (
                  <Loader2 size={14} className="rg-spin" />
                ) : (
                  <Save size={14} />
                )}
                <span>{saving ? 'Saving…' : 'Save'}</span>
              </button>

              <button
                type="button"
                className="rg-sandbox-btn rg-sandbox-btn-primary"
                onClick={handleRunFile}
                disabled={!activeFile || running}
                title={`Execute ${activeFile || 'main.py'}`}
              >
                {running ? (
                  <Loader2 size={14} className="rg-spin" />
                ) : (
                  <Play size={14} />
                )}
                <span>{running ? 'Running…' : 'Run File'}</span>
              </button>
            </>
          )}

          <button
            type="button"
            className="rg-sandbox-icon-btn"
            onClick={onClose}
            aria-label="Close Research Sandbox"
            title="Close Sandbox"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      {loadingState ? (
        <div className="rg-sandbox-center-state">
          <Loader2 size={24} className="rg-spin" />
          <p className="rg-sandbox-muted">Loading workspace sandbox…</p>
        </div>
      ) : stateError && !hasSandbox ? (
        <div className="rg-sandbox-center-state">
          <div className="rg-sandbox-empty-card">
            <div className="rg-sandbox-error-banner">
              <AlertCircle size={16} />
              <span>{stateError}</span>
            </div>
            <button
              type="button"
              className="rg-sandbox-btn rg-sandbox-btn-secondary"
              onClick={() => fetchSandboxState()}
            >
              Retry
            </button>
          </div>
        </div>
      ) : !hasSandbox ? (
        /* Empty State: Paper Scaffold Setup */
        <div className="rg-sandbox-center-state">
          <form className="rg-sandbox-empty-card" onSubmit={handleScaffold}>
            <div className="rg-sandbox-empty-header">
              <span className="rg-sandbox-mono-eyebrow">
                EXPERIMENT SCAFFOLD
              </span>
              <h2 className="rg-sandbox-empty-title">
                Initialize a Paper Coding Sandbox
              </h2>
              <p className="rg-sandbox-empty-desc">
                Select a paper node from your research graph or paste an
                abstract to generate starter Python code, reproduction tasks,
                and curated references.
              </p>
            </div>

            {normalizedPapers.length > 0 && (
              <div className="rg-sandbox-field">
                <label
                  htmlFor="sandbox-paper-select"
                  className="rg-sandbox-label"
                >
                  Paper Node from Graph
                </label>
                <select
                  id="sandbox-paper-select"
                  className="rg-sandbox-input"
                  value={selectedNodeId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedNodeId(val);
                    const found = normalizedPapers.find(
                      (p) => String(p.id) === val
                    );
                    if (found) {
                      setPaperTitleInput(found.title);
                      setPaperContentInput(found.content);
                    }
                  }}
                >
                  {normalizedPapers.map((paper) => (
                    <option key={paper.id} value={String(paper.id)}>
                      {paper.title}
                    </option>
                  ))}
                  <option value="">Custom paper / manual entry</option>
                </select>
              </div>
            )}

            <div className="rg-sandbox-field">
              <label htmlFor="sandbox-paper-title" className="rg-sandbox-label">
                Paper Title
              </label>
              <input
                id="sandbox-paper-title"
                type="text"
                className="rg-sandbox-input"
                placeholder="e.g., Attention Is All You Need"
                value={paperTitleInput}
                onChange={(e) => setPaperTitleInput(e.target.value)}
                required
              />
            </div>

            <div className="rg-sandbox-field">
              <label
                htmlFor="sandbox-paper-content"
                className="rg-sandbox-label"
              >
                Abstract / Key Mechanism Notes
              </label>
              <textarea
                id="sandbox-paper-content"
                className="rg-sandbox-textarea"
                rows={5}
                placeholder="Paste the abstract, equations, or method summary to guide the starter codebase…"
                value={paperContentInput}
                onChange={(e) => setPaperContentInput(e.target.value)}
              />
            </div>

            {scaffoldError && (
              <div className="rg-sandbox-error-banner" role="alert">
                <AlertCircle size={15} />
                <span>{scaffoldError}</span>
              </div>
            )}

            <div className="rg-sandbox-empty-actions">
              <button
                type="submit"
                className="rg-sandbox-btn rg-sandbox-btn-primary rg-sandbox-btn-lg"
                disabled={scaffolding}
              >
                {scaffolding ? (
                  <>
                    <Loader2 size={15} className="rg-spin" />
                    <span>Generating Project &amp; Tasks…</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={15} />
                    <span>Generate Coding Sandbox</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* 3-Pane Editorial IDE */
        <div className="rg-sandbox-grid">
          {/* Left Sidebar */}
          <aside className="rg-sandbox-sidebar">
            <div
              className="rg-sandbox-tabs"
              role="tablist"
              aria-label="Sandbox navigation"
            >
              <button
                type="button"
                role="tab"
                aria-selected={sidebarTab === 'files'}
                className={`rg-sandbox-tab ${
                  sidebarTab === 'files' ? 'is-active' : ''
                }`}
                onClick={() => setSidebarTab('files')}
              >
                <FileText size={13} />
                <span>Files</span>
                <span className="rg-sandbox-count">{files.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sidebarTab === 'tasks'}
                className={`rg-sandbox-tab ${
                  sidebarTab === 'tasks' ? 'is-active' : ''
                }`}
                onClick={() => setSidebarTab('tasks')}
              >
                <ListChecks size={13} />
                <span>Tasks &amp; Refs</span>
                {meta?.tasks?.length > 0 && (
                  <span className="rg-sandbox-count">
                    {completedTasksCount}/{meta.tasks.length}
                  </span>
                )}
              </button>
            </div>

            {sidebarTab === 'files' ? (
              <div className="rg-sandbox-sidebar-body">
                <div className="rg-sandbox-section-head">
                  <span className="rg-sandbox-mono-label">PROJECT FILES</span>
                  <button
                    type="button"
                    className="rg-sandbox-mini-btn"
                    onClick={() => {
                      setCreatingFile((v) => !v);
                      setNewFileError('');
                    }}
                  >
                    <Plus size={13} />
                    <span>New File</span>
                  </button>
                </div>

                {creatingFile && (
                  <form
                    className="rg-sandbox-newfile-form"
                    onSubmit={handleCreateFile}
                  >
                    <input
                      ref={newFileInputRef}
                      type="text"
                      className="rg-sandbox-input rg-sandbox-input-sm"
                      placeholder="e.g., model.py"
                      value={newFileName}
                      onChange={(e) => setNewFileName(e.target.value)}
                      disabled={creatingFileBusy}
                    />
                    <div className="rg-sandbox-newfile-actions">
                      <button
                        type="submit"
                        className="rg-sandbox-btn rg-sandbox-btn-primary rg-sandbox-btn-xs"
                        disabled={creatingFileBusy}
                      >
                        {creatingFileBusy ? 'Adding…' : 'Create'}
                      </button>
                      <button
                        type="button"
                        className="rg-sandbox-btn rg-sandbox-btn-secondary rg-sandbox-btn-xs"
                        onClick={() => {
                          setCreatingFile(false);
                          setNewFileName('');
                          setNewFileError('');
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                    {newFileError && (
                      <p className="rg-sandbox-inline-error">{newFileError}</p>
                    )}
                  </form>
                )}

                <ul className="rg-sandbox-file-list">
                  {files.map((filePath) => {
                    const selected = filePath === activeFile;
                    return (
                      <li key={filePath}>
                        <button
                          type="button"
                          className={`rg-sandbox-file-item ${
                            selected ? 'is-selected' : ''
                          }`}
                          onClick={() => handleSelectFile(filePath)}
                        >
                          <FileCode size={14} className="rg-sandbox-file-icon" />
                          <span className="rg-sandbox-file-name">
                            {filePath}
                          </span>
                          {selected && isDirty && (
                            <span
                              className="rg-sandbox-dirty-dot"
                              title="Unsaved"
                            />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>

                {hasReqs && (
                  <div className="rg-sandbox-deps-box">
                    <div className="rg-sandbox-deps-row">
                      <span className="rg-sandbox-deps-label">
                        <Package size={13} />
                        <span>requirements.txt</span>
                      </span>
                      <span
                        className={`rg-sandbox-status-pill ${
                          missingDeps.length === 0 ? 'is-ok' : 'is-warn'
                        }`}
                      >
                        {missingDeps.length === 0 ? 'installed' : 'missing'}
                      </span>
                    </div>
                    {missingDeps.length > 0 && (
                      <p className="rg-sandbox-deps-missing">
                        Missing: {missingDeps.join(', ')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="rg-sandbox-sidebar-body">
                {meta?.paper_title && (
                  <div className="rg-sandbox-paper-brief">
                    <div className="rg-sandbox-paper-brief-title">
                      {meta.paper_title}
                    </div>
                    {meta.summary && (
                      <p className="rg-sandbox-paper-brief-summary">
                        {meta.summary}
                      </p>
                    )}
                  </div>
                )}

                <div className="rg-sandbox-section-head">
                  <span className="rg-sandbox-mono-label">
                    REPRODUCTION TASKS
                  </span>
                </div>

                {meta?.tasks?.length ? (
                  <ul className="rg-sandbox-task-list">
                    {meta.tasks.map((task) => (
                      <li
                        key={task.id}
                        className={`rg-sandbox-task-card ${
                          task.completed ? 'is-done' : ''
                        }`}
                      >
                        <button
                          type="button"
                          className="rg-sandbox-task-check"
                          onClick={() => handleToggleTask(task.id)}
                          disabled={togglingTaskId === task.id}
                          aria-label={`Mark "${task.title}" as ${
                            task.completed ? 'incomplete' : 'complete'
                          }`}
                        >
                          {task.completed ? <Check size={12} /> : null}
                        </button>
                        <div className="rg-sandbox-task-content">
                          <div className="rg-sandbox-task-title">
                            {task.title}
                          </div>
                          {task.description && (
                            <p className="rg-sandbox-task-desc">
                              {task.description}
                            </p>
                          )}
                          {task.target_file && (
                            <button
                              type="button"
                              className="rg-sandbox-target-pill"
                              onClick={() => handleSelectFile(task.target_file)}
                            >
                              {task.target_file}
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rg-sandbox-muted-sm">
                    No reproduction tasks recorded yet.
                  </p>
                )}

                <div className="rg-sandbox-section-head rg-sandbox-section-spacer">
                  <span className="rg-sandbox-mono-label">
                    <BookOpen size={12} />
                    <span>REFERENCES</span>
                  </span>
                </div>

                {meta?.references?.length ? (
                  <ul className="rg-sandbox-ref-list">
                    {meta.references.map((ref, idx) => (
                      <li key={idx} className="rg-sandbox-ref-card">
                        <div className="rg-sandbox-ref-title">{ref.title}</div>
                        {ref.relevance && (
                          <p className="rg-sandbox-ref-desc">{ref.relevance}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rg-sandbox-muted-sm">
                    No references listed for this sandbox.
                  </p>
                )}
              </div>
            )}
          </aside>

          {/* Center Pane: Code Editor (65%) + Terminal (35%) */}
          <main className="rg-sandbox-center">
            {pendingSwitchFile && (
              <div className="rg-sandbox-unsaved-banner" role="alert">
                <span>
                  Unsaved edits in <code>{activeFile}</code> before opening{' '}
                  <code>{pendingSwitchFile}</code>.
                </span>
                <div className="rg-sandbox-unsaved-actions">
                  <button
                    type="button"
                    className="rg-sandbox-btn rg-sandbox-btn-primary rg-sandbox-btn-xs"
                    onClick={() => handleConfirmSwitch(true)}
                  >
                    Save &amp; Switch
                  </button>
                  <button
                    type="button"
                    className="rg-sandbox-btn rg-sandbox-btn-secondary rg-sandbox-btn-xs"
                    onClick={() => handleConfirmSwitch(false)}
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    className="rg-sandbox-btn rg-sandbox-btn-secondary rg-sandbox-btn-xs"
                    onClick={() => setPendingSwitchFile(null)}
                  >
                    Stay
                  </button>
                </div>
              </div>
            )}

            {(fileError || stateError) && (
              <div className="rg-sandbox-inline-alert" role="alert">
                <AlertCircle size={14} />
                <span>{fileError || stateError}</span>
              </div>
            )}

            {/* Editor (65%) */}
            <section className="rg-sandbox-editor-pane">
              {loadingFile ? (
                <div className="rg-sandbox-editor-loading">
                  <Loader2 size={18} className="rg-spin" />
                  <span>Loading {activeFile}…</span>
                </div>
              ) : !activeFile ? (
                <div className="rg-sandbox-editor-loading">
                  <span>Select a file from the left sidebar to begin editing.</span>
                </div>
              ) : (
                <div className="rg-sandbox-editor-wrap">
                  <div
                    ref={gutterRef}
                    className="rg-sandbox-gutter"
                    aria-hidden="true"
                  >
                    {Array.from({ length: lineCount }, (_, idx) => (
                      <div key={idx + 1} className="rg-sandbox-line-num">
                        {idx + 1}
                      </div>
                    ))}
                  </div>
                  <textarea
                    ref={editorRef}
                    className="rg-sandbox-code-textarea"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    onKeyDown={handleEditorKeyDown}
                    onScroll={syncGutterScroll}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoComplete="off"
                    autoCorrect="off"
                    aria-label={`Code editor for ${activeFile}`}
                  />
                </div>
              )}
            </section>

            {/* Terminal (35%) */}
            <section className="rg-sandbox-terminal-pane">
              <div className="rg-sandbox-terminal-head">
                <div className="rg-sandbox-terminal-meta">
                  <Terminal size={14} />
                  <span className="rg-sandbox-mono-label">OUTPUT</span>
                  {lastRunFile && (
                    <span className="rg-sandbox-terminal-file">
                      {lastRunFile}
                    </span>
                  )}
                  {runResult && (
                    <>
                      <span
                        className={`rg-sandbox-exit-pill ${
                          runResult.exit_code === 0 ? 'is-pass' : 'is-fail'
                        }`}
                      >
                        exit {runResult.exit_code}
                      </span>
                      <span className="rg-sandbox-duration">
                        {runResult.duration_ms}ms
                      </span>
                    </>
                  )}
                </div>

                {runResult && (
                  <button
                    type="button"
                    className="rg-sandbox-btn rg-sandbox-btn-secondary rg-sandbox-btn-xs"
                    onClick={handleLogToGraph}
                    disabled={!onLogResult}
                  >
                    <ArrowUpRight size={13} />
                    <span>
                      {loggedSuccess ? 'Logged to Graph' : 'Log Result to Graph'}
                    </span>
                  </button>
                )}
              </div>

              <div className="rg-sandbox-terminal-body">
                {running ? (
                  <div className="rg-sandbox-terminal-placeholder">
                    <Loader2 size={14} className="rg-spin" />
                    <span>Running {activeFile || 'script'}…</span>
                  </div>
                ) : runError ? (
                  <pre className="rg-sandbox-stderr">{runError}</pre>
                ) : !runResult ? (
                  <div className="rg-sandbox-terminal-placeholder">
                    Click <strong>Run File</strong> to execute your active
                    Python file inside this workspace sandbox.
                  </div>
                ) : (
                  <>
                    {runResult.stdout && (
                      <pre className="rg-sandbox-stdout">{runResult.stdout}</pre>
                    )}
                    {runResult.stderr && (
                      <pre className="rg-sandbox-stderr">{runResult.stderr}</pre>
                    )}
                    {!runResult.stdout && !runResult.stderr && (
                      <div className="rg-sandbox-terminal-placeholder">
                        Process finished with exit code {runResult.exit_code} (no
                        output).
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>
          </main>

          {/* Right Panel: Human-in-the-Loop AI Tweak Assistant */}
          <aside className="rg-sandbox-assistant">
            <div className="rg-sandbox-assistant-head">
              <div className="rg-sandbox-assistant-title-row">
                <Sparkles size={15} />
                <h2>AI Code Assistant</h2>
              </div>
              <p className="rg-sandbox-assistant-sub">
                Suggest targeted edits for{' '}
                <code>{activeFile || 'the active file'}</code> and review before
                applying.
              </p>
            </div>

            <form
              className="rg-sandbox-tweak-form"
              onSubmit={handleSuggestTweak}
            >
              <textarea
                className="rg-sandbox-textarea rg-sandbox-tweak-input"
                rows={4}
                placeholder="Ask AI to tweak this file (e.g., 'Add dropout 0.1' or 'Switch to AdamW')..."
                value={tweakInstruction}
                onChange={(e) => setTweakInstruction(e.target.value)}
                disabled={!activeFile || tweaking}
              />
              <button
                type="submit"
                className="rg-sandbox-btn rg-sandbox-btn-primary rg-sandbox-btn-block"
                disabled={
                  !activeFile || !tweakInstruction.trim() || tweaking
                }
              >
                {tweaking ? (
                  <>
                    <Loader2 size={14} className="rg-spin" />
                    <span>Drafting Tweak…</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    <span>Suggest Tweak</span>
                  </>
                )}
              </button>
            </form>

            {tweakError && (
              <div className="rg-sandbox-error-banner" role="alert">
                <AlertCircle size={14} />
                <span>{tweakError}</span>
              </div>
            )}

            <div className="rg-sandbox-tweak-preview-area">
              {tweakSuggestion ? (
                <div className="rg-sandbox-proposal-card">
                  <div className="rg-sandbox-proposal-label">
                    PROPOSED CHANGE
                  </div>
                  <p className="rg-sandbox-proposal-exp">
                    {tweakSuggestion.explanation}
                  </p>

                  <pre className="rg-sandbox-proposal-code">
                    <code>{tweakSuggestion.proposed_code}</code>
                  </pre>

                  <div className="rg-sandbox-proposal-actions">
                    <button
                      type="button"
                      className="rg-sandbox-btn rg-sandbox-btn-primary rg-sandbox-btn-sm"
                      onClick={handleApplyTweak}
                      disabled={applyingTweak}
                    >
                      {applyingTweak ? (
                        <Loader2 size={13} className="rg-spin" />
                      ) : (
                        <Check size={13} />
                      )}
                      <span>
                        {applyingTweak ? 'Applying…' : 'Apply to Editor'}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="rg-sandbox-btn rg-sandbox-btn-secondary rg-sandbox-btn-sm"
                      onClick={() => setTweakSuggestion(null)}
                      disabled={applyingTweak}
                    >
                      Discard
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rg-sandbox-assistant-empty">
                  <p>
                    Human-in-the-loop mode: AI never overwrites your code
                    automatically. Every proposed patch appears here for
                    inspection first.
                  </p>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
