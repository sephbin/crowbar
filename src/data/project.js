// The active project is remembered per browser. Switching reloads the page, so
// no module ever holds state from a previous project.
const STORAGE_KEY = 'crowbar-project';
const DEFAULT_ID = 'default';

export function getProjectId() {
  try {
    // A link can name the project (?project=id), e.g. from Thoth's "edit this passage"; it becomes the active one.
    const fromUrl = new URLSearchParams(location.search).get('project');
    if (fromUrl) localStorage.setItem(STORAGE_KEY, fromUrl);
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_ID;
  } catch { return DEFAULT_ID; }
}

export function switchProject(id) {
  localStorage.setItem(STORAGE_KEY, id);
  // Drop ?file= — that path belongs to the previous project.
  location.href = location.pathname;
}

// fetch() for any project-scoped /api route.
export function apiFetch(url, opts = {}) {
  return fetch(url, { ...opts, headers: { ...opts.headers, 'X-Crowbar-Project': getProjectId() } });
}

export async function fetchProjects() {
  return (await fetch('/api/projects')).json();
}

export async function createProject(name) {
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not create project');
  return data;
}

export async function renameProject(id, name) {
  const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error('Could not rename project');
}
