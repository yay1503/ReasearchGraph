import importlib.util
import re
import subprocess
import sys
import time
from pathlib import Path

SANDBOXES_ROOT = Path(__file__).resolve().parent.parent / "sandboxes"

_IMPORT_ALIASES = {
    "scikit-learn": "sklearn",
    "python-dotenv": "dotenv",
    "pyyaml": "yaml",
    "pillow": "PIL",
    "beautifulsoup4": "bs4",
    "opencv-python": "cv2",
    "psycopg2-binary": "psycopg2",
}


def get_workspace_dir(workspace_id: str, create: bool = True) -> Path:
    clean_id = (workspace_id or "").strip()
    if (
        not clean_id
        or "\x00" in clean_id
        or "/" in clean_id
        or "\\" in clean_id
        or clean_id in (".", "..")
        or ".." in clean_id
    ):
        raise ValueError("Invalid workspace_id")

    root = SANDBOXES_ROOT.resolve()
    ws_dir = (root / clean_id).resolve()
    if not ws_dir.is_relative_to(root) or ws_dir == root:
        raise ValueError("Invalid workspace_id path")

    if create:
        ws_dir.mkdir(parents=True, exist_ok=True)
    return ws_dir


def _resolve_safe_path(
    workspace_id: str,
    rel_path: str,
    *,
    create_root: bool = True,
) -> tuple[Path, Path]:
    if not isinstance(rel_path, str) or not rel_path.strip() or "\x00" in rel_path:
        raise ValueError("Invalid relative file path")

    raw = rel_path.strip().replace("\\", "/")
    candidate = Path(raw)
    if candidate.is_absolute() or raw.startswith("/") or ".." in candidate.parts:
        raise ValueError("Directory traversal is not permitted")

    base = get_workspace_dir(workspace_id, create=create_root)
    target = (base / candidate).resolve()
    if not target.is_relative_to(base) or target == base:
        raise ValueError("Path escapes workspace sandbox")

    return base, target


def list_files(workspace_id: str) -> list[str]:
    base = get_workspace_dir(workspace_id, create=True)
    files: list[str] = []
    for item in base.rglob("*"):
        if not item.is_file():
            continue
        rel = item.relative_to(base)
        if "__pycache__" in rel.parts or item.suffix == ".pyc":
            continue
        files.append(rel.as_posix())
    files.sort()
    return files


def read_file(workspace_id: str, rel_path: str) -> str:
    _, target = _resolve_safe_path(workspace_id, rel_path, create_root=True)
    if not target.is_file():
        raise FileNotFoundError(f"File not found: {rel_path}")
    return target.read_text(encoding="utf-8", errors="replace")


def write_file(workspace_id: str, rel_path: str, content: str) -> dict:
    base, target = _resolve_safe_path(workspace_id, rel_path, create_root=True)
    target.parent.mkdir(parents=True, exist_ok=True)
    text = content if isinstance(content, str) else str(content)
    target.write_text(text, encoding="utf-8")
    return {
        "path": target.relative_to(base).as_posix(),
        "bytes": len(text.encode("utf-8")),
    }


def delete_file(workspace_id: str, rel_path: str) -> dict:
    base, target = _resolve_safe_path(workspace_id, rel_path, create_root=False)
    if not target.is_file():
        raise FileNotFoundError(f"File not found: {rel_path}")
    rel_posix = target.relative_to(base).as_posix()
    target.unlink()
    return {"deleted": rel_posix}


def run_script(
    workspace_id: str,
    entry_file: str = "main.py",
    timeout: int = 30,
) -> dict:
    base, target = _resolve_safe_path(workspace_id, entry_file, create_root=True)
    if not target.is_file():
        raise FileNotFoundError(f"Entry file not found: {entry_file}")

    rel_entry = target.relative_to(base).as_posix()
    started = time.perf_counter()
    try:
        proc = subprocess.run(
            [sys.executable, rel_entry],
            cwd=str(base),
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        duration_ms = int((time.perf_counter() - started) * 1000)
        return {
            "stdout": proc.stdout,
            "stderr": proc.stderr,
            "exit_code": proc.returncode,
            "duration_ms": duration_ms,
        }
    except subprocess.TimeoutExpired as exc:
        duration_ms = int((time.perf_counter() - started) * 1000)
        stdout = exc.stdout.decode("utf-8", errors="replace") if isinstance(exc.stdout, bytes) else (exc.stdout or "")
        stderr = exc.stderr.decode("utf-8", errors="replace") if isinstance(exc.stderr, bytes) else (exc.stderr or "")
        return {
            "stdout": stdout,
            "stderr": f"{stderr}\nExecution timed out after {timeout}s".strip(),
            "exit_code": -1,
            "duration_ms": duration_ms,
        }


def _package_to_import_candidates(pkg_name: str) -> list[str]:
    lowered = pkg_name.lower()
    candidates = []
    if lowered in _IMPORT_ALIASES:
        candidates.append(_IMPORT_ALIASES[lowered])
    normalized = lowered.replace("-", "_")
    if normalized not in candidates:
        candidates.append(normalized)
    if lowered not in candidates:
        candidates.append(lowered)
    return candidates


def check_dependencies(workspace_id: str) -> dict:
    _, req_path = _resolve_safe_path(workspace_id, "requirements.txt", create_root=True)
    if not req_path.is_file():
        return {"has_requirements": False, "installed": [], "missing": []}

    installed: list[str] = []
    missing: list[str] = []

    for raw_line in req_path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw_line.split("#", 1)[0].strip()
        if not line or line.startswith("-"):
            continue
        pkg = re.split(r"[\[=<>!~;@\s]", line, maxsplit=1)[0].strip()
        if not pkg:
            continue

        found = any(
            importlib.util.find_spec(mod) is not None
            for mod in _package_to_import_candidates(pkg)
        )
        if found:
            installed.append(pkg)
        else:
            missing.append(pkg)

    return {
        "has_requirements": True,
        "installed": installed,
        "missing": missing,
    }
