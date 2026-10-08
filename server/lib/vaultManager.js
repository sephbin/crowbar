import { readFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync } from 'fs';
import { readdir } from 'fs/promises';
import { join, relative, extname, sep, resolve, dirname } from 'path';
import { homedir } from 'os';
import chokidar from 'chokidar';

const expandHome = p => p.replace(/^~/, homedir());

// The pre-projects vault. It is kept as the "default" project so existing content is untouched.
const DEFAULT_VAULT_ROOT = process.env.CROWBAR_VAULT_PATH
  ? expandHome(process.env.CROWBAR_VAULT_PATH)
  : join(homedir(), 'crowbar-vault');

// New projects are created as sibling folders under here (each one is a fully isolated vault).
const PROJECTS_DIR = process.env.CROWBAR_PROJECTS_DIR
  ? expandHome(process.env.CROWBAR_PROJECTS_DIR)
  : join(homedir(), 'crowbar-projects');

const REGISTRY_FILE = process.env.CROWBAR_PROJECTS_FILE
  ? expandHome(process.env.CROWBAR_PROJECTS_FILE)
  : join(homedir(), '.crowbar', 'projects.json');

export const DEFAULT_PROJECT_ID = 'default';

const ALLOWED_EXTS = new Set(['.html', '.md']);

const META_OPEN = '<script type="application/json" id="page-meta">';
const META_CLOSE = '</script>';

function extractMeta(raw) {
  const start = raw.indexOf(META_OPEN);
  if (start === -1) return {};
  const end = raw.indexOf(META_CLOSE, start + META_OPEN.length);
  if (end === -1) return {};
  try { return JSON.parse(raw.slice(start + META_OPEN.length, end)); } catch { return {}; }
}

function toPosix(p) { return p.split(sep).join('/'); }

// ── Project registry ──
// Each project is { id, name, path }. A project is an isolated vault: pages,
// relationships, canvases and the facet registry never cross project boundaries.

function loadRegistry() {
  let projects = [];
  try { projects = JSON.parse(readFileSync(REGISTRY_FILE, 'utf8')); } catch {}
  if (!Array.isArray(projects)) projects = [];
  if (!projects.some(p => p.id === DEFAULT_PROJECT_ID)) {
    projects.unshift({ id: DEFAULT_PROJECT_ID, name: 'Default', path: DEFAULT_VAULT_ROOT });
  }
  return projects;
}

function saveRegistry(projects) {
  mkdirSync(dirname(REGISTRY_FILE), { recursive: true });
  writeFileSync(REGISTRY_FILE, JSON.stringify(projects, null, 2), 'utf8');
}

export function listProjects() {
  return loadRegistry().map(({ id, name }) => ({ id, name }));
}

// Returns the project's vault root, or null when the id is unknown.
export function getProjectRoot(id = DEFAULT_PROJECT_ID) {
  const project = loadRegistry().find(p => p.id === id);
  return project ? project.path : null;
}

function slugifyProject(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
}

export function createProject(name, existingPath) {
  const projects = loadRegistry();
  const base = slugifyProject(name);
  let id = base;
  for (let n = 2; projects.some(p => p.id === id); n++) id = `${base}-${n}`;

  const path = existingPath ? resolve(expandHome(existingPath)) : join(PROJECTS_DIR, id);
  if (projects.some(p => resolve(p.path) === path)) throw new Error('A project already uses that folder');
  mkdirSync(path, { recursive: true });

  projects.push({ id, name, path });
  saveRegistry(projects);
  console.log(`[crowbar] Created project "${name}" at ${path}`);
  return { id, name };
}

export function renameProject(id, name) {
  const projects = loadRegistry();
  const project = projects.find(p => p.id === id);
  if (!project) throw new Error('Unknown project');
  project.name = name;
  saveRegistry(projects);
  return { id, name };
}

export function initVault() {
  for (const { name, path } of loadRegistry()) {
    if (!existsSync(path)) {
      mkdirSync(path, { recursive: true });
      console.log(`[crowbar] Created vault for "${name}" at ${path}`);
    } else {
      console.log(`[crowbar] Project "${name}": ${path}`);
    }
  }
}

// Resolves a vault-relative path, refusing anything that escapes the project root.
function safeJoin(root, relPath) {
  const full = resolve(root, relPath);
  const rel = relative(root, full);
  if (rel.startsWith('..') || resolve(rel) === rel) throw new Error('Path escapes project');
  return full;
}

async function buildTree(dir, root) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nodes = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = join(dir, entry.name);
    const relPath = toPosix(relative(root, fullPath));
    const ext = extname(entry.name);

    if (entry.isDirectory()) {
      nodes.push({ name: entry.name, path: relPath, type: 'dir', children: await buildTree(fullPath, root) });
    } else if (ALLOWED_EXTS.has(ext)) {
      let meta = {};
      try { meta = extractMeta(readFileSync(fullPath, 'utf8')); } catch {}
      nodes.push({ name: entry.name, path: relPath, type: 'file', meta });
    }
  }

  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    // Sort files by meta.name if available, else filename
    const na = a.type === 'file' ? (a.meta?.name || a.name) : a.name;
    const nb = b.type === 'file' ? (b.meta?.name || b.name) : b.name;
    return na.localeCompare(nb);
  });
  return nodes;
}

export async function getTree(root) { return buildTree(root, root); }

export function readFile(root, relPath) {
  return readFileSync(safeJoin(root, relPath), 'utf8');
}

export function writeRaw(root, relPath, raw) {
  const full = safeJoin(root, relPath);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, raw, 'utf8');
}

export function deleteFile(root, relPath) {
  unlinkSync(safeJoin(root, relPath));
}

const FACETS_FILE = '_facets.json';

const DEFAULT_FACETS = {
  heritage: { label: 'Heritage', values: ['welsh', 'english', 'scottish', 'irish', 'fae'] },
  species: { label: 'Species', values: ['human', 'cat', 'fae', 'spirit'] },
  region: { label: 'Region', values: ['forest-of-dean', 'cinderford', 'dreamlands'] },
};

// The facet registry is a small curated vocabulary of `facet:value` tags
// (e.g. "heritage:welsh") that Claude is restricted to when suggesting tags —
// it lives at the vault root so it's per-vault and directly user-editable.
export function getFacetRegistry(root) {
  const full = join(root, FACETS_FILE);
  if (!existsSync(full)) {
    writeFileSync(full, JSON.stringify(DEFAULT_FACETS, null, 2), 'utf8');
    return DEFAULT_FACETS;
  }
  try { return JSON.parse(readFileSync(full, 'utf8')); } catch { return DEFAULT_FACETS; }
}

// One watcher per project, started lazily the first time a project is used.
// Changes are tagged with the project id so clients can ignore other projects.
const watchers = new Map();

export function ensureWatcher(projectId, root, broadcast) {
  if (watchers.has(projectId)) return;
  const watcher = chokidar.watch(root, { ignoreInitial: true, ignored: /(^|[/\\])\./ });
  const emit = change => p => broadcast({ event: 'vault:change', project: projectId, path: toPosix(relative(root, p)), change });
  for (const [evt, change] of [['add', 'add'], ['unlink', 'unlink'], ['change', 'change'], ['addDir', 'addDir'], ['unlinkDir', 'unlinkDir']]) {
    watcher.on(evt, emit(change));
  }
  watchers.set(projectId, watcher);
}
