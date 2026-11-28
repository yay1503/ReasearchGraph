const API = import.meta.env.VITE_API_URL || '/api';

export function clearStoredAuth() {
  localStorage.removeItem('rg_token');
  localStorage.removeItem('rg_user');
  localStorage.removeItem('rg_workspace_id');
}

export function isJwtUnexpired(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return true; // legacy opaque token
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64));
    if (typeof payload.exp === 'number') {
      return payload.exp * 1000 > Date.now();
    }
    return true;
  } catch {
    return false;
  }
}

export function getStoredAuth() {
  try {
    const token = localStorage.getItem('rg_token');
    if (!token || !isJwtUnexpired(token)) {
      if (token) clearStoredAuth();
      return { token: null, user: null };
    }
    const rawUser = localStorage.getItem('rg_user');
    return { token, user: rawUser ? JSON.parse(rawUser) : null };
  } catch {
    return { token: null, user: null };
  }
}

export async function verifyAndSyncSession() {
  const { token, user } = getStoredAuth();
  if (!token) return null;
  try {
    const res = await fetch(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      clearStoredAuth();
      return null;
    }
    if (res.ok) {
      const me = await res.json();
      localStorage.setItem('rg_user', JSON.stringify(me));
      return { token, user: me };
    }
  } catch {
    // Keep existing local session if backend is temporarily unreachable
    if (user) return { token, user };
  }
  return user ? { token, user } : null;
}

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
