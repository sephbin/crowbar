import { apiFetch } from './project.js';
import { parsePage, serializePage } from '../meta/pageMeta.js';
import { getTemplate } from '../templates/templateRegistry.js';

export async function fetchTree() {
  const res = await apiFetch('/api/vault/tree');
  return res.json();
}

export function flattenTree(nodes, acc = []) {
  nodes.forEach(n => {
    if (n.type === 'file') acc.push(n);
    else if (n.children) flattenTree(n.children, acc);
  });
  return acc;
}

export async function fetchAllPages() {
  return flattenTree(await fetchTree());
}

export async function fetchRaw(path) {
  const res = await apiFetch(`/api/vault/file?path=${encodeURIComponent(path)}`);
  if (!res.ok) return null;
  const { content } = await res.json();
  return content;
}

export async function saveRaw(path, raw) {
  await apiFetch('/api/vault/raw', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, raw }),
  });
}

function slugify(name) {
  return name.replace(/[^a-z0-9\-_ ]/gi, '').trim().replace(/\s+/g, '-') || 'page';
}

// Creates a new page from a template, avoiding filename collisions with existing pages.
// extraMeta is merged into defaultMeta after name is set (e.g. pass { connects: [...] }).
export async function createPage(templateId, name, extraMeta = {}) {
  const template = getTemplate(templateId);
  const existing = new Set((await fetchAllPages()).map(p => p.path));

  const base = slugify(name || 'page');
  let filename = `${base}.html`;
  let n = 2;
  while (existing.has(filename)) {
    filename = `${base}-${n}.html`;
    n++;
  }

  const meta = { ...template.defaultMeta, name, ...extraMeta };
  const content = template.bodyHTML(meta);
  await saveRaw(filename, serializePage(meta, content));
  return { path: filename, meta };
}

// Mutates meta.relationships on a page other than the one currently open in the editor.
export async function updatePageRelationships(path, updateFn) {
  const raw = await fetchRaw(path);
  if (raw == null) return;
  const { meta, content } = parsePage(raw);
  meta.relationships = updateFn(meta.relationships ?? []);
  await saveRaw(path, serializePage(meta, content));
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// Asks Claude to suggest facet:value tags (from the vault's curated registry)
// that apply to this page but aren't already present. Read-only — the caller
// decides whether to merge and save them.
export async function suggestFacetTags(meta, content) {
  const res = await apiFetch('/api/claude/autotag', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ meta, content }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Suggest tags failed');
  return data.added ?? [];
}
