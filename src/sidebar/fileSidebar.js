import { renderFlatList, renderByType, renderByTag, getAllLayers } from './fileTree.js';
import { showNewPageModal } from '../components/newPageModal.js';
import { apiFetch } from '../data/project.js';
import { fetchAllPages, createPage } from '../data/vaultApi.js';

const treeContainer = document.getElementById('file-tree');
const contextMenu = document.getElementById('context-menu');
const btnNewPage = document.getElementById('btn-new-page');
const subgroupRow = document.getElementById('subgroup-row');
const subgroupSelect = document.getElementById('subgroup-select');

let onFileOpenCb = null;
let activeFile = null;
let allFiles = [];   // flat list of all file nodes (with meta)
let viewMode = localStorage.getItem('sidebar-view') ?? 'type'; // type | tag | flat
let subGroupKey = localStorage.getItem('sidebar-subgroup') ?? 'tags'; // layer used to sub-group within Type view

// ─── Data ────────────────────────────────────────────────────────────────────

async function fetchAll() {
  allFiles = await fetchAllPages();
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderSidebar() {
  treeContainer.innerHTML = '';

  const handlers = {
    onFileOpen: (path) => { activeFile = path; onFileOpenCb?.(path); renderSidebar(); },
    onContextMenu: showContextMenu,
    activeFile,
  };

  syncSubgroupOptions();

  let el;
  if (viewMode === 'type') el = renderByType(allFiles, handlers, subGroupKey);
  else if (viewMode === 'tag') el = renderByTag(allFiles, handlers);
  else el = renderFlatList(allFiles, handlers);

  treeContainer.appendChild(el);
  subgroupRow.classList.toggle('hidden', viewMode !== 'type');
}

// Rebuilds the "Group by" dropdown from the fixed set of layers. Facets don't
// appear here as separate options — they nest inside the "Tag" layer itself.
function syncSubgroupOptions() {
  const layers = getAllLayers();
  if (!layers.some(l => l.key === subGroupKey)) subGroupKey = 'tags';

  subgroupSelect.innerHTML = layers
    .map(l => `<option value="${l.key}">${l.label}</option>`)
    .join('');
  subgroupSelect.value = subGroupKey;
}

// ─── View mode tabs ──────────────────────────────────────────────────────────

document.querySelectorAll('.view-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    viewMode = btn.dataset.view;
    localStorage.setItem('sidebar-view', viewMode);
    document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === viewMode));
    renderSidebar();
  });
  if (btn.dataset.view === viewMode) btn.classList.add('active');
});

// ─── Sub-group layer picker ───────────────────────────────────────────────────

subgroupSelect.addEventListener('change', () => {
  subGroupKey = subgroupSelect.value;
  localStorage.setItem('sidebar-subgroup', subGroupKey);
  renderSidebar();
});

// ─── New page ─────────────────────────────────────────────────────────────────

btnNewPage?.addEventListener('click', () => {
  showNewPageModal(async (template, name) => {
    const { path } = await createPage(template.id, name);

    await fetchAll();
    renderSidebar();
    activeFile = path;
    onFileOpenCb?.(path);
    renderSidebar();
  });
});

// ─── Context menu ─────────────────────────────────────────────────────────────

function showContextMenu(e, node) {
  e.preventDefault();
  contextMenu.innerHTML = '';
  contextMenu.classList.remove('hidden');
  contextMenu.style.top = `${e.clientY}px`;
  contextMenu.style.left = `${e.clientX}px`;

  [{ label: 'Delete', action: () => deleteFile(node) }].forEach(({ label, action }) => {
    const li = document.createElement('li');
    li.textContent = label;
    li.addEventListener('click', () => { hideContextMenu(); action(); });
    contextMenu.appendChild(li);
  });
}

function hideContextMenu() { contextMenu.classList.add('hidden'); }
document.addEventListener('click', hideContextMenu);
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideContextMenu(); });

async function deleteFile(node) {
  if (!confirm(`Delete "${node.name}"?`)) return;
  await apiFetch(`/api/vault/file?path=${encodeURIComponent(node.path)}`, { method: 'DELETE' });
  if (activeFile === node.path) {
    activeFile = null;
    document.getElementById('current-filename').textContent = 'No file open';
    document.getElementById('html-editor').innerHTML = '';
  }
  await fetchAll();
  renderSidebar();
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function setActiveFile(path) {
  activeFile = path;
  renderSidebar();
}

export async function mountSidebar({ onFileOpen, onRefresh }) {
  if (onFileOpen) onFileOpenCb = onFileOpen;

  await fetchAll();
  renderSidebar();

  if (!onRefresh && allFiles.length && !activeFile) {
    const first = allFiles[0];
    if (first) {
      activeFile = first.path;
      onFileOpenCb?.(first.path);
      renderSidebar();
    }
  }
}
