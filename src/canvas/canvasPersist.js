import { apiFetch } from '../data/project.js';

const CANVAS_PATH = '_canvas.json';

export async function loadCanvas() {
  const res = await apiFetch(`/api/vault/file?path=${encodeURIComponent(CANVAS_PATH)}`);
  if (!res.ok) return { nodes: [], edges: [] };
  const { content } = await res.json();
  try { return JSON.parse(content); } catch { return { nodes: [], edges: [] }; }
}

let saveTimer = null;

export function scheduleCanvasSave(stateJSON) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    apiFetch('/api/vault/raw', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: CANVAS_PATH, raw: JSON.stringify(stateJSON, null, 2) }),
    });
  }, 800);
}
