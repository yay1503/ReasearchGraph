const API = import.meta.env.VITE_API_URL || '/api';

export async function syncUserWorkspace(token) {
  try {
    const wsRes = await fetch(`${API}/workspaces`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (wsRes.ok) {
      const workspaces = await wsRes.json();
      if (Array.isArray(workspaces) && workspaces.length > 0) {
        localStorage.setItem('rg_workspace_id', workspaces[0].id);
        return;
      }
    }
  } catch {
    // WorkspaceCanvas falls back to creating a workspace if needed
  }
  localStorage.removeItem('rg_workspace_id');
}
