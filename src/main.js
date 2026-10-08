import { createEditor } from './editor/htmlEditor.js';
import { mountSidebar, setActiveFile } from './sidebar/fileSidebar.js';
import { parsePage, serializePage } from './meta/pageMeta.js';
import { openMetaPanel, closeMetaPanel } from './components/metaPanel.js';
import { attachCardListeners } from './templates/characterTemplate.js';
import { getTemplateForType } from './templates/templateRegistry.js';
import { fetchAllPages, suggestFacetTags, uid } from './data/vaultApi.js';
import { apiFetch, getProjectId } from './data/project.js';
import { mountProjectSwitcher } from './components/projectSwitcher.js';
import { renderRelationshipsBlock } from './relationships/relationshipsBlock.js';
import { renderConnectionsBlock } from './components/connectionsBlock.js';
import { mountCanvas, loadCanvasData, refreshCanvasPages } from './canvas/canvasView.js';

let editor = null;
let currentPath = null;
let currentMeta = {};
let canvasMounted = false;
let isPopNav = false;

const editorContainer = document.getElementById('editor-container');
const canvasPane      = document.getElementById('canvas-pane');

function injectPageCard(meta) {
  const tmpl = getTemplateForType(meta.type);
  const blockHTML = tmpl?.blockHTML?.(meta) ?? null;
  const card = editor.setCard(blockHTML);
  if (card) {
    attachCardListeners(card, (key, value) => {
      currentMeta[key] = value;
      saveCurrentFile();
    });
  }
}

async function openFile(path) {
  if (isMobile()) closeMobileSidebar();
  const res = await apiFetch(`/api/vault/file?path=${encodeURIComponent(path)}`);
  if (!res.ok) return;
  const { content: raw } = await res.json();

  const { meta, content } = parsePage(raw ?? '');
  currentPath = path;
  currentMeta = meta;

  if (!isPopNav) {
    const url = `?file=${encodeURIComponent(path)}`;
    if (history.state?.path) {
      history.pushState({ path }, '', url);
    } else {
      history.replaceState({ path }, '', url);
    }
  }

  document.getElementById('current-filename').textContent = meta.name || path.split('/').pop().replace(/\.(html|md)$/, '');
  document.getElementById('save-status').textContent = '';

  if (meta.type === 'canvas') {
    editorContainer.classList.add('canvas-active');
    canvasPane.classList.add('canvas-active');
    closeMetaPanel();
    backdrop.classList.remove('visible');

    if (!canvasMounted) {
      mountCanvas(canvasPane, { onOpenFile: openFile, getAllPages: fetchAllPages });
      canvasMounted = true;
    }

    await loadCanvasData(path, meta, (canvasJSON) => {
      currentMeta.canvasNodes  = canvasJSON.nodes;
      currentMeta.canvasEdges  = canvasJSON.edges;
      currentMeta.canvasGroups = canvasJSON.groups;
      currentMeta.canvasHubs   = canvasJSON.hubs;
      currentMeta.canvasLayers = canvasJSON.layers;
      saveCurrentFile();
    });
    return;
  }

  // Non-canvas: ensure editor is visible
  editorContainer.classList.remove('canvas-active');
  canvasPane.classList.remove('canvas-active');

  // Refresh canvas pages so relationship edges update when returning from editor
  if (canvasMounted) refreshCanvasPages();

  editor.setContent(content);
  injectPageCard(currentMeta);
  openMetaPanel(currentMeta, onMetaChange, onSuggestTags);
  injectRelationshipsBlock();
  injectConnectionsBlock();
}

function onSuggestTags() {
  return suggestFacetTags(currentMeta, editor?.getContent() ?? '');
}

function onMetaChange(newMeta) {
  currentMeta = newMeta;
  if (newMeta.name) {
    document.getElementById('current-filename').textContent = newMeta.name;
  }
  injectPageCard(newMeta);
  saveCurrentFile();
  injectRelationshipsBlock();
  injectConnectionsBlock();
}

async function injectRelationshipsBlock() {
  if (!currentPath || currentMeta?.type === 'canvas') return;
  const allPages = await fetchAllPages();
  const block = renderRelationshipsBlock(currentMeta, currentPath, allPages, {
    onNavigate: (path) => openFile(path),
    onChanged: async () => {
      await saveCurrentFile();
      injectRelationshipsBlock();
    },
  });
  editor.setRelationshipsBlock(block);
}

async function injectConnectionsBlock() {
  if (!currentPath || currentMeta?.type === 'canvas') return;
  const allPages = await fetchAllPages();
  const block = renderConnectionsBlock(currentPath, allPages, {
    onNavigate: (path) => openFile(path),
  });
  editor.setConnectionsBlock(block);
}

function scheduleSave(html) {
  document.getElementById('save-status').textContent = 'saving…';
  saveCurrentFile(html);
}

async function saveCurrentFile(htmlOverride) {
  if (!currentPath) return;
  // Canvas files have no HTML body — only meta is meaningful
  const html = (currentMeta?.type === 'canvas') ? '' : (htmlOverride ?? editor?.getContent() ?? '');
  const raw = serializePage(currentMeta, html);
  await apiFetch('/api/vault/raw', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: currentPath, raw }),
  });
  document.getElementById('save-status').textContent = 'saved';
  setTimeout(() => { document.getElementById('save-status').textContent = ''; }, 1500);
}

function connectWebSocket() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.event === 'vault:change' && msg.project === getProjectId()) mountSidebar({ onFileOpen: openFile, onRefresh: true });
  };
  ws.onclose = () => setTimeout(connectWebSocket, 2000);
}

// ── Mobile sidebar drawer ──
const sidebar = document.getElementById('sidebar');
const backdrop = document.getElementById('mobile-backdrop');

function isMobile() { return window.matchMedia('(max-width: 640px)').matches; }

function openMobileSidebar() {
  sidebar.classList.add('mobile-open');
  backdrop.classList.add('visible');
}

function closeMobileSidebar() {
  sidebar.classList.remove('mobile-open');
  backdrop.classList.remove('visible');
}

document.getElementById('btn-sidebar-toggle')?.addEventListener('click', () => {
  if (sidebar.classList.contains('mobile-open')) closeMobileSidebar();
  else openMobileSidebar();
});

backdrop.addEventListener('click', () => {
  closeMobileSidebar();
  closeMetaPanel();
});

// Toggle meta panel from header button
document.getElementById('btn-toggle-meta')?.addEventListener('click', () => {
  const panel = document.getElementById('meta-panel');
  if (panel.classList.contains('hidden')) {
    if (currentPath) {
      openMetaPanel(currentMeta, onMetaChange, onSuggestTags);
      if (isMobile()) backdrop.classList.add('visible');
    }
  } else {
    closeMetaPanel();
    if (isMobile()) backdrop.classList.remove('visible');
  }
});

async function init() {
  editor = createEditor(document.getElementById('editor-container'), {
    onSave: scheduleSave,
    links: {
      getPages: fetchAllPages,
      getCurrentPath: () => currentPath,
      getCurrentType: () => currentMeta?.type,
      onNavigate: async (path) => { await openFile(path); setActiveFile(path); },
      onConvert: async ({ target, label, reverseLabel }) => {
        currentMeta.relationships = [...(currentMeta.relationships ?? []), { id: uid(), target, label, reverseLabel }];
        await saveCurrentFile();
        injectRelationshipsBlock();
      },
    },
  });

  const urlPath = new URLSearchParams(location.search).get('file');

  window.addEventListener('popstate', async (e) => {
    if (e.state?.path) {
      isPopNav = true;
      await openFile(e.state.path);
      setActiveFile(e.state.path);
      isPopNav = false;
    }
  });

  mountProjectSwitcher(document.getElementById('project-switcher'));

  await mountSidebar({ onFileOpen: openFile, onRefresh: !!urlPath });

  if (urlPath) {
    await openFile(urlPath);
    setActiveFile(urlPath);
  }

  connectWebSocket();
}

init();
