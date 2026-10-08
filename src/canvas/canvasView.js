import { createCanvasState } from './canvasState.js';
import { initPanZoom } from './canvasPanZoom.js';
import { createNodeCard } from './canvasNodes.js';
import { renderCustomEdges, renderEdgePageLines } from './canvasEdges.js';
import { showNewPageModal } from '../components/newPageModal.js';
import { createPage, fetchRaw, saveRaw } from '../data/vaultApi.js';
import { parsePage, serializePage } from '../meta/pageMeta.js';
import { getTemplateForType, TYPE_ICONS } from '../templates/templateRegistry.js';

const NS = 'http://www.w3.org/2000/svg';

let state         = null;
let panZoom       = null;
let allPages      = [];
let defaultDetail = localStorage.getItem('canvas-default-detail') ?? 'compact';
let activeLayerId = localStorage.getItem('canvas-active-layer') ?? 'default';

let pendingEdgeFrom     = null;  // path string, or '__multi__' for connect-selected-to mode
let selectedEdgeId      = null;
let selectedEdgePagePath = null; // path of the page-backed edge currently selected
let nodeCleanups      = [];
let hubCleanups       = [];
let currentCanvasPath = null;
let _onSave           = null;
let saveTimer         = null;

// Port drag state
let previewEdgePath = null;

// Rubber-band selection state
let selectedPaths      = new Set();
let lassoStartVP       = null;   // viewport-space coords where lasso began
let lassoActive        = false;
let lassoEl            = null;
let lassoJustCompleted = false;  // suppresses the background click that fires after lasso mouseup

// DOM refs — set once by mountCanvas
let viewport          = null;
let world             = null;
let svgEl             = null;
let edgesCanvasGroup  = null;
let edgesPageGroup    = null;
let defaultBtn        = null;
let layersBtn         = null;
let layersPanel       = null;
let hintSpan          = null;

let _onOpenFile  = null;
let _getAllPages  = null;

// ─── Debounced save ────────────────────────────────────────────────────────────

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => _onSave?.(state.toJSON()), 800);
}

// ─── One-time DOM setup ────────────────────────────────────────────────────────

export function mountCanvas(container, { onOpenFile, getAllPages }) {
  _onOpenFile = onOpenFile;
  _getAllPages = getAllPages;

  container.innerHTML = '';

  // ── Toolbar ────────────────────────────────────────────────────────────────
  const toolbar = document.createElement('div');
  toolbar.className = 'canvas-toolbar';

  const fitBtn = document.createElement('button');
  fitBtn.className = 'canvas-btn';
  fitBtn.textContent = 'Fit';
  fitBtn.title = 'Fit all nodes in view';
  toolbar.appendChild(fitBtn);

  defaultBtn = document.createElement('button');
  defaultBtn.className = 'canvas-btn';
  defaultBtn.title = 'Default card style for dropped pages';
  defaultBtn.textContent = defaultDetail === 'compact' ? 'Drop: Compact' : 'Drop: Name only';
  toolbar.appendChild(defaultBtn);

  layersBtn = document.createElement('button');
  layersBtn.className = 'canvas-btn';
  layersBtn.title = 'Edge layers — show/hide edge types';
  layersBtn.textContent = 'Layers';
  toolbar.appendChild(layersBtn);

  hintSpan = document.createElement('span');
  hintSpan.className = 'canvas-hint';
  hintSpan.textContent = 'Shift+click to connect · Dbl-click canvas to add page';
  toolbar.appendChild(hintSpan);

  container.appendChild(toolbar);

  // ── Viewport + world ───────────────────────────────────────────────────────
  viewport = document.createElement('div');
  viewport.className = 'canvas-viewport';
  container.appendChild(viewport);

  world = document.createElement('div');
  world.className = 'canvas-world';
  viewport.appendChild(world);

  // ── SVG layer ──────────────────────────────────────────────────────────────
  svgEl = document.createElementNS(NS, 'svg');
  svgEl.setAttribute('class', 'canvas-svg');
  svgEl.setAttribute('width', '8000');
  svgEl.setAttribute('height', '8000');
  svgEl.setAttribute('viewBox', '0 0 8000 8000');
  world.appendChild(svgEl);

  edgesCanvasGroup = document.createElementNS(NS, 'g');
  edgesCanvasGroup.style.pointerEvents = 'all';
  svgEl.appendChild(edgesCanvasGroup);

  edgesPageGroup = document.createElementNS(NS, 'g');
  edgesPageGroup.style.pointerEvents = 'all';
  svgEl.appendChild(edgesPageGroup);

  // ── Pan/zoom ───────────────────────────────────────────────────────────────
  panZoom = initPanZoom(viewport, world);

  // ── Layers panel ───────────────────────────────────────────────────────────
  layersPanel = document.createElement('div');
  layersPanel.className = 'layers-panel hidden';
  document.body.appendChild(layersPanel);

  document.addEventListener('click', (e) => {
    if (!layersPanel.classList.contains('hidden') &&
        !layersPanel.contains(e.target) &&
        e.target !== layersBtn) {
      layersPanel.classList.add('hidden');
      layersBtn.classList.remove('active');
    }
  });

  // ── Toolbar events ─────────────────────────────────────────────────────────
  fitBtn.addEventListener('click', () => panZoom.fitToScreen(state.getNodes()));

  layersBtn.addEventListener('click', () => {
    const isHidden = layersPanel.classList.toggle('hidden');
    layersBtn.classList.toggle('active', !isHidden);
    if (!isHidden) {
      renderLayersPanel();
      const rect = layersBtn.getBoundingClientRect();
      layersPanel.style.left = `${rect.left}px`;
      layersPanel.style.top  = `${rect.bottom + 4}px`;
    }
  });

  defaultBtn.addEventListener('click', () => {
    defaultDetail = defaultDetail === 'compact' ? 'name-only' : 'compact';
    localStorage.setItem('canvas-default-detail', defaultDetail);
    defaultBtn.textContent = defaultDetail === 'compact' ? 'Drop: Compact' : 'Drop: Name only';
  });

  // ── Drop target ────────────────────────────────────────────────────────────
  viewport.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    viewport.classList.add('drag-over');
  });

  viewport.addEventListener('dragleave', (e) => {
    if (!viewport.contains(e.relatedTarget)) viewport.classList.remove('drag-over');
  });

  viewport.addEventListener('drop', (e) => {
    e.preventDefault();
    viewport.classList.remove('drag-over');

    const rect = viewport.getBoundingClientRect();
    const pos  = panZoom.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

    const tag = e.dataTransfer.getData('text/crowbar-tag');
    if (tag && state) { handleTagDrop(tag, pos, e.clientX, e.clientY); return; }

    const path = e.dataTransfer.getData('text/plain');
    if (!path || !state) return;
    if (state.hasNode(path)) return;
    state.addNode(path, Math.max(0, Math.min(7820, pos.x)), Math.max(0, Math.min(7820, pos.y)), defaultDetail);
    renderGroups();
    renderNodes();
    rerenderEdges();
    scheduleSave();
  });

  // ── Double-click empty canvas → create new page ────────────────────────────
  viewport.addEventListener('dblclick', async (e) => {
    if (e.target.closest('.canvas-node, .canvas-group-header')) return;
    const rect = viewport.getBoundingClientRect();
    const pos  = panZoom.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

    showNewPageModal(async (template, name) => {
      const { path } = await createPage(template.id, name);
      allPages = await _getAllPages();
      state.addNode(path, Math.max(0, pos.x - 90), Math.max(0, pos.y - 22), defaultDetail);
      renderGroups();
      renderNodes();
      rerenderEdges();
      scheduleSave();
    });
  });

  // ── Rubber-band selection ──────────────────────────────────────────────────
  viewport.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (panZoom.isInPanMode()) return;
    if (e.target.closest('.canvas-node, [data-edge-id], .canvas-group')) return;
    const rect = viewport.getBoundingClientRect();
    lassoStartVP = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  });

  document.addEventListener('mousemove', (e) => {
    if (!lassoStartVP) return;
    const rect = viewport.getBoundingClientRect();
    const cur = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const dx = cur.x - lassoStartVP.x;
    const dy = cur.y - lassoStartVP.y;

    if (!lassoActive && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      lassoActive = true;
      lassoEl = document.createElement('div');
      lassoEl.className = 'canvas-selection-rect';
      viewport.appendChild(lassoEl);
    }

    if (lassoActive) {
      lassoEl.style.left   = `${Math.min(lassoStartVP.x, cur.x)}px`;
      lassoEl.style.top    = `${Math.min(lassoStartVP.y, cur.y)}px`;
      lassoEl.style.width  = `${Math.abs(dx)}px`;
      lassoEl.style.height = `${Math.abs(dy)}px`;
    }
  });

  document.addEventListener('mouseup', (e) => {
    if (e.button !== 0 || !lassoStartVP) return;
    if (lassoActive && lassoEl) {
      const vpRect = viewport.getBoundingClientRect();
      const vpX = Math.min(lassoStartVP.x, e.clientX - vpRect.left);
      const vpY = Math.min(lassoStartVP.y, e.clientY - vpRect.top);
      const vpW = Math.abs(e.clientX - vpRect.left - lassoStartVP.x);
      const vpH = Math.abs(e.clientY - vpRect.top  - lassoStartVP.y);

      selectedPaths = getNodesInLasso(vpX, vpY, vpW, vpH);
      lassoEl.remove();
      lassoEl = null;
      lassoActive = false;
      lassoJustCompleted = true;
      applySelection();
    }
    lassoStartVP = null;
  });

  // ── Canvas edge click → open edge panel ───────────────────────────────────
  edgesCanvasGroup.addEventListener('click', (e) => {
    const target = e.target.closest('[data-edge-id]');
    if (!target) { selectedEdgeId = null; rerenderEdges(); hideEdgePanel(); return; }
    selectedEdgeId       = target.dataset.edgeId;
    selectedEdgePagePath = null;
    rerenderEdges();
    const edge = state.getEdges().get(selectedEdgeId);
    if (edge) showEdgePanel(edge);
    e.stopPropagation();
  });

  // ── Page-backed edge click → open edge page panel ─────────────────────────
  edgesPageGroup.addEventListener('click', (e) => {
    const target = e.target.closest('[data-edge-page-path]');
    if (!target) { selectedEdgePagePath = null; rerenderEdges(); hideEdgePanel(); return; }
    selectedEdgePagePath = target.dataset.edgePagePath;
    selectedEdgeId       = null;
    rerenderEdges();
    const page = allPages.find(p => p.path === selectedEdgePagePath);
    if (page) showEdgePagePanel(page);
    e.stopPropagation();
  });

  // ── Background click: deselect + cancel edge ───────────────────────────────
  viewport.addEventListener('click', (e) => {
    if (lassoJustCompleted) { lassoJustCompleted = false; return; }
    if (e.target === viewport || e.target === world || e.target === svgEl) {
      cancelEdgeDraw();
      selectedEdgeId       = null;
      selectedEdgePagePath = null;
      selectedPaths.clear();
      applySelection();
      rerenderEdges();
      hideEdgePanel();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      cancelEdgeDraw();
      selectedPaths.clear();
      applySelection();
      if (selectedEdgeId || selectedEdgePagePath) {
        selectedEdgeId       = null;
        selectedEdgePagePath = null;
        rerenderEdges();
        hideEdgePanel();
      }
    }
  });
}

// ─── Called each time a canvas file is opened ──────────────────────────────────

export async function loadCanvasData(path, meta, onSave) {
  if (currentCanvasPath && currentCanvasPath !== path) {
    sessionStorage.setItem(`canvas-pz:${currentCanvasPath}`, JSON.stringify(panZoom.getTransform()));
  }

  currentCanvasPath = path;
  _onSave = onSave;

  pendingEdgeFrom      = null;
  selectedEdgeId       = null;
  selectedEdgePagePath = null;
  selectedPaths.clear();
  cancelEdgeDraw();
  hideEdgePanel();

  allPages = await _getAllPages();

  state = createCanvasState();
  state.loadJSON({
    nodes:  meta.canvasNodes  ?? [],
    edges:  meta.canvasEdges  ?? [],
    groups: meta.canvasGroups ?? [],
    hubs:   meta.canvasHubs   ?? [],
    layers: meta.canvasLayers ?? [],
  });
  updateLayersBtnLabel();

  const savedPZ = sessionStorage.getItem(`canvas-pz:${path}`);
  if (savedPZ) {
    try { panZoom.setTransform(JSON.parse(savedPZ)); } catch { panZoom.setTransform({ tx: 0, ty: 0, scale: 1 }); }
  } else {
    panZoom.setTransform({ tx: 0, ty: 0, scale: 1 });
  }

  renderGroups();
  renderNodes();
  rerenderEdges();

  if (!savedPZ && state.getNodes().size > 0) {
    panZoom.fitToScreen(state.getNodes());
  }

  await migrateRelationshipsToEdges();
}

// ─── One-time migration: pull meta.relationships from page files into canvas edges ──

async function migrateRelationshipsToEdges() {
  if (!state || !allPages) return;
  const nodes = state.getNodes();

  // Build set of existing relationship edges to skip duplicates
  const existingKeys = new Set();
  for (const e of state.getEdges().values()) {
    if (e.type === 'relationship') existingKeys.add(`${e.from}::${e.to}`);
  }

  let addedAny = false;
  const pagesToClean = new Map(); // path → remaining relationships (those whose target isn't on this canvas)

  for (const page of allPages) {
    if (!page.meta?.relationships?.length) continue;
    if (!nodes.has(page.path)) continue;

    const remaining = [];
    for (const rel of page.meta.relationships) {
      if (nodes.has(rel.target)) {
        const key = `${page.path}::${rel.target}`;
        if (!existingKeys.has(key)) {
          const id = state.addEdge(page.path, rel.target, rel.label ?? '', 'relationship');
          const edge = state.getEdges().get(id);
          if (edge && rel.reverseLabel) edge.reverseLabel = rel.reverseLabel;
          existingKeys.add(key);
          addedAny = true;
        }
        // Drop from page file regardless (already a canvas edge now)
      } else {
        remaining.push(rel); // target not on this canvas — leave it alone
      }
    }
    if (remaining.length < page.meta.relationships.length) {
      pagesToClean.set(page.path, remaining);
    }
  }

  if (pagesToClean.size === 0) return;

  // Remove migrated relationships from source page files
  await Promise.all([...pagesToClean.entries()].map(async ([path, remaining]) => {
    try {
      const raw = await fetchRaw(path);
      if (!raw) return;
      const { meta, content } = parsePage(raw);
      if (remaining.length === 0) delete meta.relationships;
      else meta.relationships = remaining;
      await saveRaw(path, serializePage(meta, content));
    } catch { /* ignore individual page errors */ }
  }));

  if (addedAny) {
    scheduleSave();
    rerenderEdges();
  }
  allPages = await _getAllPages();
}

// ─── Refresh pages (call after returning from editor to pick up meta changes) ──

export async function refreshCanvasPages() {
  allPages = await _getAllPages();
  renderGroups();
  renderNodes();
  rerenderEdges();
}

// ─── Internal rendering ────────────────────────────────────────────────────────

function renderGroups() {
  if (!state) return;
  world.querySelectorAll('.canvas-group').forEach(el => el.remove());

  for (const g of state.getGroups().values()) {
    const el = document.createElement('div');
    el.className = 'canvas-group';
    el.style.left   = `${g.x}px`;
    el.style.top    = `${g.y}px`;
    el.style.width  = `${g.w}px`;
    el.style.height = `${g.h}px`;
    el.dataset.groupId = g.id;

    const header = document.createElement('div');
    header.className = 'canvas-group-header';
    header.textContent = g.label || 'Group';
    el.appendChild(header);
    world.appendChild(el);

    header.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const name = prompt('Group label:', g.label ?? '');
      if (name !== null) {
        g.label = name.trim();
        header.textContent = g.label || 'Group';
        scheduleSave();
      }
    });

    header.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showGroupContextMenu(e, g);
    });

    addGroupDrag(el, header, g);
  }
}

function addGroupDrag(el, handle, g) {
  let dragging = false, startMouse, startGroup;

  handle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    dragging = true;
    startMouse = { x: e.clientX, y: e.clientY };
    startGroup = { x: g.x, y: g.y };
    document.body.style.userSelect = 'none';
  });

  const onMove = (e) => {
    if (!dragging) return;
    const sc = panZoom.getTransform().scale;
    g.x = startGroup.x + (e.clientX - startMouse.x) / sc;
    g.y = startGroup.y + (e.clientY - startMouse.y) / sc;
    el.style.left = `${g.x}px`;
    el.style.top  = `${g.y}px`;
    state.moveGroup(g.id, g.x, g.y);
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = '';
    scheduleSave();
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function renderNodes() {
  nodeCleanups.forEach(fn => fn());
  nodeCleanups = [];
  world.querySelectorAll('.canvas-node').forEach(el => el.remove());

  if (!state || state.getNodes().size === 0) {
    showEmptyState();
    return;
  }
  removeEmptyState();

  const pageByPath = new Map(allPages.map(p => [p.path, p]));

  for (const nodeState of state.getNodes().values()) {
    const el = createNodeCard(nodeState, pageByPath, {
      onDoubleClick(path) { _onOpenFile?.(path); },
      onShiftClick(path, el) { handleShiftClick(path, el); },
      onPortDragStart(path, side, e) { handlePortDragStart(path, side, e); },
      onDragging(path, dx, dy) {
        if (!selectedPaths.has(path) || selectedPaths.size <= 1) return;
        for (const p of selectedPaths) {
          if (p === path) continue;
          const n = state.getNodes().get(p);
          if (!n) continue;
          const pEl = world.querySelector(`.canvas-node[data-path="${CSS.escape(p)}"]`);
          if (pEl) { pEl.style.left = `${n.x + dx}px`; pEl.style.top = `${n.y + dy}px`; }
        }
        rerenderEdges();
      },
      onMoved(path, dx, dy) {
        // nodeState.x/y already updated by canvasNodes; sync the state map
        state.moveNode(path, nodeState.x, nodeState.y);

        // Move all other selected nodes by the same world-space delta
        if (selectedPaths.has(path) && selectedPaths.size > 1) {
          for (const p of selectedPaths) {
            if (p === path) continue;
            const n = state.getNodes().get(p);
            if (!n) continue;
            n.x += dx; n.y += dy;
            state.moveNode(p, n.x, n.y);
            const pEl = world.querySelector(`.canvas-node[data-path="${CSS.escape(p)}"]`);
            if (pEl) { pEl.style.left = `${n.x}px`; pEl.style.top = `${n.y}px`; }
          }
        }
        rerenderEdges();
        scheduleSave();
      },
      onRemove(path) {
        selectedPaths.delete(path);
        state.removeNode(path);
        renderGroups();
        renderNodes();
        rerenderEdges();
        scheduleSave();
      },
      onContextMenu(e, ns) { showNodeContextMenu(e, ns); },
      getScale() { return panZoom.getTransform().scale; },
    });
    world.appendChild(el);
    if (el._cleanup) nodeCleanups.push(el._cleanup);
  }

  applySelection();
  renderHubs();
}

function renderHubs() {
  hubCleanups.forEach(fn => fn());
  hubCleanups = [];
  world.querySelectorAll('.canvas-hub-node').forEach(el => el.remove());
  if (!state) return;

  for (const hub of state.getHubs().values()) {
    const el = document.createElement('div');
    el.className = 'canvas-hub-node';
    el.dataset.hubId = hub.id;
    el.style.left = `${hub.x}px`;
    el.style.top  = `${hub.y}px`;

    const rm = document.createElement('button');
    rm.className = 'canvas-node-remove';
    rm.title = 'Remove hub';
    rm.textContent = '✕';
    rm.addEventListener('click', (e) => {
      e.stopPropagation();
      state.removeHub(hub.id);
      renderHubs();
      rerenderEdges();
      scheduleSave();
    });
    if (hub.label) el.prepend(hub.label);
    el.appendChild(rm);

    let dragging = false, startMouse, startHub;
    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      dragging = true;
      startMouse = { x: e.clientX, y: e.clientY };
      startHub = { x: hub.x, y: hub.y };
      document.body.style.userSelect = 'none';
    });
    const onMove = (e) => {
      if (!dragging) return;
      const sc = panZoom.getTransform().scale;
      hub.x = startHub.x + (e.clientX - startMouse.x) / sc;
      hub.y = startHub.y + (e.clientY - startMouse.y) / sc;
      el.style.left = `${hub.x}px`;
      el.style.top  = `${hub.y}px`;
      rerenderEdges();
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      document.body.style.userSelect = '';
      state.moveHub(hub.id, hub.x, hub.y);
      scheduleSave();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    hubCleanups.push(() => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    });

    world.appendChild(el);
  }
}

function applySelection() {
  world.querySelectorAll('.canvas-node').forEach(el =>
    el.classList.toggle('canvas-node-selected', selectedPaths.has(el.dataset.path))
  );
}

function rerenderEdges() {
  if (!state) return;
  const nodes = state.getNodes();
  const allNodes = new Map(nodes);
  for (const [id, hub] of state.getHubs()) {
    allNodes.set(id, { x: hub.x, y: hub.y, hub: true });
  }
  renderCustomEdges(edgesCanvasGroup, state.getEdges(), allNodes, { selectedId: selectedEdgeId, layers: state.getLayers() });
  const edgePages = allPages.filter(p =>
    Array.isArray(p.meta?.connects) &&
    p.meta.connects.length >= 2 &&
    p.meta.connects.every(path => nodes.has(path))
  );
  renderEdgePageLines(edgesPageGroup, edgePages, nodes, { selectedPath: selectedEdgePagePath });
}

// ─── Port drag (edge creation by dragging from a port dot) ────────────────────

function sideAnchor(node, side) {
  const h = node.detail === 'name-only' ? 44 : 88;
  switch (side) {
    case 'top':    return { x: node.x + 90,  y: node.y,       dx:  0, dy: -1 };
    case 'right':  return { x: node.x + 180, y: node.y + h/2, dx:  1, dy:  0 };
    case 'bottom': return { x: node.x + 90,  y: node.y + h,   dx:  0, dy:  1 };
    case 'left':   return { x: node.x,       y: node.y + h/2, dx: -1, dy:  0 };
    default:       return { x: node.x + 180, y: node.y + h/2, dx:  1, dy:  0 };
  }
}

function makePreviewPath(anchor, wx, wy) {
  const dist = Math.hypot(wx - anchor.x, wy - anchor.y);
  const ctrl = Math.max(dist * 0.15, 30);
  const c1x = anchor.x + anchor.dx * ctrl;
  const c1y = anchor.y + anchor.dy * ctrl;
  const adx = anchor.x - wx;
  const ady = anchor.y - wy;
  const alen = Math.hypot(adx, ady) || 1;
  const c2x = wx + (adx / alen) * ctrl;
  const c2y = wy + (ady / alen) * ctrl;
  return `M ${anchor.x} ${anchor.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${wx} ${wy}`;
}

function handlePortDragStart(fromPath, side, startEvent) {
  const fromNode = state?.getNodes().get(fromPath);
  if (!fromNode) return;

  previewEdgePath = document.createElementNS(NS, 'path');
  previewEdgePath.setAttribute('stroke', 'var(--accent)');
  previewEdgePath.setAttribute('stroke-width', '1.5');
  previewEdgePath.setAttribute('stroke-dasharray', '6 3');
  previewEdgePath.setAttribute('fill', 'none');
  previewEdgePath.setAttribute('opacity', '0.75');
  previewEdgePath.setAttribute('pointer-events', 'none');
  svgEl.appendChild(previewEdgePath);

  const anchor = sideAnchor(fromNode, side);

  // Set initial path to cursor position
  const vpRect = viewport.getBoundingClientRect();
  const initWorld = panZoom.screenToWorld(startEvent.clientX - vpRect.left, startEvent.clientY - vpRect.top);
  previewEdgePath.setAttribute('d', makePreviewPath(anchor, initWorld.x, initWorld.y));

  const onMove = (e) => {
    const rect = viewport.getBoundingClientRect();
    const w = panZoom.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    previewEdgePath?.setAttribute('d', makePreviewPath(anchor, w.x, w.y));
  };

  const onUp = (e) => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    previewEdgePath?.remove();
    previewEdgePath = null;

    const targetEl = document.elementFromPoint(e.clientX, e.clientY)?.closest('.canvas-node');
    if (targetEl && targetEl.dataset.path && targetEl.dataset.path !== fromPath) {
      showEdgeAssignPopover(fromPath, targetEl.dataset.path, e.clientX, e.clientY);
    }
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// ─── Lasso helpers ─────────────────────────────────────────────────────────────

function getNodesInLasso(vpX, vpY, vpW, vpH) {
  const { tx, ty, scale } = panZoom.getTransform();
  const wxMin = (vpX       - tx) / scale;
  const wyMin = (vpY       - ty) / scale;
  const wxMax = (vpX + vpW - tx) / scale;
  const wyMax = (vpY + vpH - ty) / scale;

  const found = new Set();
  for (const n of state.getNodes().values()) {
    const h = n.detail === 'name-only' ? 44 : 88;
    if (n.x < wxMax && n.x + 180 > wxMin && n.y < wyMax && n.y + h > wyMin) {
      found.add(n.path);
    }
  }
  return found;
}

// ─── Empty state ───────────────────────────────────────────────────────────────

function showEmptyState() {
  removeEmptyState();
  const el = document.createElement('div');
  el.className = 'canvas-empty';
  el.id = 'canvas-empty-state';
  el.innerHTML = '<div class="canvas-empty-title">Canvas</div><div>Drag pages from the sidebar, or double-click to add a new page</div>';
  viewport.appendChild(el);
}

function removeEmptyState() {
  viewport?.querySelector('#canvas-empty-state')?.remove();
}

// ─── Tag drop ─────────────────────────────────────────────────────────────────

function handleTagDrop(tag, dropPos, clientX, clientY) {
  const matching = allPages.filter(p =>
    Array.isArray(p.meta?.tags) && p.meta.tags.includes(tag)
  );
  if (!matching.length) return;

  const toAdd = matching.filter(p => !state.hasNode(p.path));
  const alreadyCount = matching.length - toAdd.length;

  showTagDropDialogue(tag, dropPos, toAdd, alreadyCount, matching.map(p => p.path), clientX, clientY);
}

function placeTagNodes(toAdd, dropPos) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(toAdd.length)));
  const spacingX = 220, spacingY = 120;
  toAdd.forEach((p, i) => {
    const col = i % cols, rowNum = Math.floor(i / cols);
    const x = dropPos.x + col * spacingX - ((cols - 1) * spacingX) / 2;
    const y = dropPos.y + rowNum * spacingY;
    state.addNode(p.path, Math.max(0, Math.min(7820, x)), Math.max(0, Math.min(7820, y)), defaultDetail);
  });
}

function spawnHub(tag, dropPos, connectPaths) {
  const hubLabel = tag.includes(':') ? tag.split(':')[1] : tag;
  const hubX = Math.max(0, Math.min(7820, dropPos.x));
  const hubY = Math.max(0, Math.min(7820, dropPos.y - 160));
  const hubId = state.addHub(hubLabel, hubX, hubY);
  connectPaths.forEach(path => state.addEdge(hubId, path, ''));
}

function showTagDropDialogue(tag, dropPos, toAdd, alreadyCount, allMatchingPaths, clientX, clientY) {
  document.querySelector('.tag-drop-popover')?.remove();

  const popover = document.createElement('div');
  popover.className = 'edge-assign-popover tag-drop-popover';

  const hasNew = toAdd.length > 0;
  const onCanvasPaths = allMatchingPaths.filter(p => state.hasNode(p));
  const countLabel = hasNew
    ? `${toAdd.length} page${toAdd.length !== 1 ? 's' : ''} will be added${alreadyCount ? ` (${alreadyCount} already on canvas)` : ''}`
    : `All ${alreadyCount} pages already on canvas`;

  popover.innerHTML = `
    <div class="tag-drop-title">Tag: <strong>${tag}</strong></div>
    <div class="tag-drop-count">${countLabel}</div>
    <div class="edge-assign-actions" style="margin-top:6px">
      ${hasNew ? `<button class="edge-panel-btn edge-panel-btn-primary" id="tdrop-nodes">Add as nodes</button>` : ''}
      ${hasNew ? `<button class="edge-panel-btn edge-panel-btn-primary" id="tdrop-nodes-hub">Add as nodes + hub</button>` : ''}
      <button class="edge-panel-btn edge-panel-btn-primary" id="tdrop-hub-only">${hasNew ? 'Hub only' : 'Add hub'}</button>
      <button class="edge-assign-plain" id="tdrop-cancel">Cancel</button>
    </div>
  `;

  document.body.appendChild(popover);

  const pw = popover.offsetWidth || 240;
  const ph = popover.offsetHeight || 130;
  popover.style.left = Math.min(clientX + 8, window.innerWidth - pw - 8) + 'px';
  popover.style.top  = Math.min(clientY + 8, window.innerHeight - ph - 8) + 'px';

  function dismiss() {
    popover.remove();
    document.removeEventListener('mousedown', outside);
  }
  function outside(e) { if (!popover.contains(e.target)) dismiss(); }
  document.addEventListener('mousedown', outside);

  popover.querySelector('#tdrop-cancel').addEventListener('click', dismiss);

  popover.querySelector('#tdrop-nodes')?.addEventListener('click', () => {
    dismiss();
    placeTagNodes(toAdd, dropPos);
    renderGroups(); renderNodes(); rerenderEdges(); scheduleSave();
  });

  popover.querySelector('#tdrop-nodes-hub')?.addEventListener('click', () => {
    dismiss();
    placeTagNodes(toAdd, dropPos);
    spawnHub(tag, dropPos, allMatchingPaths);
    renderGroups(); renderNodes(); rerenderEdges(); scheduleSave();
  });

  popover.querySelector('#tdrop-hub-only').addEventListener('click', () => {
    dismiss();
    // Connect to already-on-canvas pages; fall back to all if none present yet
    spawnHub(tag, dropPos, onCanvasPaths.length ? onCanvasPaths : allMatchingPaths);
    renderGroups(); renderNodes(); rerenderEdges(); scheduleSave();
  });
}

// ─── Edge creation ─────────────────────────────────────────────────────────────

function handleShiftClick(path, el) {
  // "Connect selected to…" mode — any shift-click target completes the connection
  if (pendingEdgeFrom === '__multi__') {
    for (const p of selectedPaths) {
      if (p !== path) state.addEdge(p, path, '');
    }
    cancelEdgeDraw();
    rerenderEdges();
    scheduleSave();
    return;
  }

  if (!pendingEdgeFrom) {
    pendingEdgeFrom = path;
    el.classList.add('edge-pending');
    return;
  }
  if (pendingEdgeFrom === path) { cancelEdgeDraw(); return; }
  const from = pendingEdgeFrom;
  cancelEdgeDraw();
  // Show assignment popover near the target node
  const nodeEl = world.querySelector(`[data-path="${CSS.escape(path)}"]`);
  const rect = nodeEl?.getBoundingClientRect() ?? { right: window.innerWidth / 2, top: window.innerHeight / 2 };
  showEdgeAssignPopover(from, path, rect.right + 8, rect.top);
}

function cancelEdgeDraw() {
  world?.querySelectorAll('.edge-pending').forEach(el => el.classList.remove('edge-pending'));
  pendingEdgeFrom = null;
  if (hintSpan) hintSpan.textContent = 'Shift+click to connect · Dbl-click canvas to add page';
}

// ─── Multi-selection actions ────────────────────────────────────────────────────

function groupSelected() {
  if (selectedPaths.size < 2) return;
  const pad = 24;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of selectedPaths) {
    const n = state.getNodes().get(p);
    if (!n) continue;
    const h = n.detail === 'name-only' ? 44 : 88;
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + 180); maxY = Math.max(maxY, n.y + h);
  }
  const label = (prompt('Group label (optional):') ?? '').trim();
  state.addGroup(label, minX - pad, minY - pad - 28, maxX - minX + pad * 2, maxY - minY + pad * 2 + 28);
  renderGroups();
  scheduleSave();
}

function connectSelectedToEachOther() {
  const paths = [...selectedPaths];
  for (let i = 0; i < paths.length; i++)
    for (let j = i + 1; j < paths.length; j++)
      state.addEdge(paths[i], paths[j], '');
  rerenderEdges();
  scheduleSave();
}

function startConnectSelectedTo() {
  pendingEdgeFrom = '__multi__';
  if (hintSpan) hintSpan.textContent = 'Shift+click a target node to connect all selected → target';
  // Highlight selected nodes as pending
  world.querySelectorAll('.canvas-node').forEach(el => {
    if (selectedPaths.has(el.dataset.path)) el.classList.add('edge-pending');
  });
}

function removeSelectedFromCanvas() {
  for (const p of selectedPaths) state.removeNode(p);
  selectedPaths.clear();
  renderGroups();
  renderNodes();
  rerenderEdges();
  scheduleSave();
}

// ─── Context menus ─────────────────────────────────────────────────────────────

function showNodeContextMenu(e, nodeState) {
  const menu = document.getElementById('context-menu');
  menu.innerHTML = '';
  menu.classList.remove('hidden');
  menu.style.top  = `${e.clientY}px`;
  menu.style.left = `${e.clientX}px`;

  const isMulti = selectedPaths.size >= 2 && selectedPaths.has(nodeState.path);

  const items = isMulti
    ? [
        { label: 'Group selected',              action: groupSelected },
        { label: 'Connect all to each other',   action: connectSelectedToEachOther },
        { label: 'Connect selected to…',        action: startConnectSelectedTo },
        { label: 'Remove selected from canvas', action: removeSelectedFromCanvas },
      ]
    : [
        {
          label: nodeState.detail === 'compact' ? 'Name only' : 'Compact card',
          action() {
            const next = nodeState.detail === 'compact' ? 'name-only' : 'compact';
            state.setNodeDetail(nodeState.path, next);
            nodeState.detail = next;
            renderGroups();
            renderNodes();
            rerenderEdges();
            scheduleSave();
          },
        },
        {
          label: 'Remove from canvas',
          action() {
            state.removeNode(nodeState.path);
            renderGroups();
            renderNodes();
            rerenderEdges();
            scheduleSave();
          },
        },
      ];

  items.forEach(({ label, action }) => {
    const li = document.createElement('li');
    li.textContent = label;
    li.addEventListener('click', (ev) => { ev.stopPropagation(); action(); });
    menu.appendChild(li);
  });
}

function showGroupContextMenu(e, g) {
  const menu = document.getElementById('context-menu');
  menu.innerHTML = '';
  menu.classList.remove('hidden');
  menu.style.top  = `${e.clientY}px`;
  menu.style.left = `${e.clientX}px`;

  [
    {
      label: 'Rename group',
      action() {
        const name = prompt('Group label:', g.label ?? '');
        if (name !== null) {
          g.label = name.trim();
          renderGroups();
          scheduleSave();
        }
      },
    },
    {
      label: 'Delete group',
      action() {
        state.removeGroup(g.id);
        renderGroups();
        scheduleSave();
      },
    },
  ].forEach(({ label, action }) => {
    const li = document.createElement('li');
    li.textContent = label;
    li.addEventListener('click', (ev) => { ev.stopPropagation(); action(); });
    menu.appendChild(li);
  });
}

// ─── Edge panels ───────────────────────────────────────────────────────────────

function pageName(path) {
  const page = allPages.find(p => p.path === path);
  return page?.meta?.name || path.split('/').pop().replace(/\.(html|md)$/, '');
}

function row(labelText) {
  const el = document.createElement('div');
  el.className = 'meta-field-row';
  const lbl = document.createElement('label');
  lbl.className = 'meta-field-label';
  lbl.textContent = labelText;
  el.appendChild(lbl);
  return el;
}

function openEdgePanelBase() {
  const panel = document.getElementById('meta-panel');
  const fields = document.getElementById('meta-fields');
  document.getElementById('meta-tags-section').classList.add('hidden');
  panel.classList.remove('hidden');
  document.getElementById('app').classList.add('meta-open');
  fields.innerHTML = '';
  return { panel, fields, badge: document.getElementById('meta-type-badge') };
}

function wireCloseBtn(onClose) {
  const closeBtn = document.getElementById('meta-panel-close');
  if (closeBtn._canvasEdgeClose) closeBtn.removeEventListener('click', closeBtn._canvasEdgeClose);
  closeBtn._canvasEdgeClose = onClose;
  closeBtn.addEventListener('click', closeBtn._canvasEdgeClose);
}

// ── Canvas-state edge panel ───────────────────────────────────────────────────

function showEdgePanel(edge) {
  const { fields, badge } = openEdgePanelBase();
  const layerId = edge.type ?? 'default';
  const isRel   = layerId === 'relationship';
  const layer   = state.getLayer(layerId);
  badge.textContent = layer?.name ?? (isRel ? 'Relationship' : 'Edge');

  const fromName = pageName(edge.from);
  const toName   = pageName(edge.to);

  if (isRel) {
    const fwdRow = row(`${fromName} → ${toName}`);
    const fwdInput = document.createElement('input');
    fwdInput.type = 'text';
    fwdInput.className = 'meta-field-input';
    fwdInput.value = edge.label ?? '';
    fwdInput.placeholder = 'e.g. father, ally, employer…';
    fwdInput.addEventListener('input', () => { edge.label = fwdInput.value; rerenderEdges(); scheduleSave(); });
    fwdRow.appendChild(fwdInput);
    fields.appendChild(fwdRow);

    const revRow = row(`${toName} → ${fromName}`);
    const revInput = document.createElement('input');
    revInput.type = 'text';
    revInput.className = 'meta-field-input';
    revInput.value = edge.reverseLabel ?? '';
    revInput.placeholder = 'e.g. son, ally, employee…';
    revInput.addEventListener('input', () => { edge.reverseLabel = revInput.value; scheduleSave(); });
    revRow.appendChild(revInput);
    fields.appendChild(revRow);
  } else {
    const labelRow = row('Label');
    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'meta-field-input';
    labelInput.value = edge.label ?? '';
    labelInput.placeholder = 'Edge label…';
    labelInput.addEventListener('input', () => { edge.label = labelInput.value; rerenderEdges(); scheduleSave(); });
    labelRow.appendChild(labelInput);
    fields.appendChild(labelRow);

    const connRow = row('Connection');
    const connVal = document.createElement('div');
    connVal.className = 'edge-panel-conn';
    connVal.textContent = `${fromName} → ${toName}`;
    connRow.appendChild(connVal);
    fields.appendChild(connRow);

    const assignBtn = document.createElement('button');
    assignBtn.className = 'edge-panel-btn edge-panel-btn-primary';
    assignBtn.textContent = 'Assign a page to this edge';
    assignBtn.addEventListener('click', () => {
      hideEdgePanel();
      const rect = assignBtn.getBoundingClientRect();
      showEdgeAssignPopover(edge.from, edge.to, rect.left, rect.bottom + 4, edge.id);
    });
    fields.appendChild(assignBtn);
  }

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'edge-panel-btn edge-panel-btn-danger';
  deleteBtn.textContent = isRel ? 'Delete relationship' : 'Delete edge';
  deleteBtn.addEventListener('click', () => {
    state.removeEdge(edge.id);
    selectedEdgeId = null;
    rerenderEdges();
    scheduleSave();
    hideEdgePanel();
  });
  fields.appendChild(deleteBtn);

  wireCloseBtn(() => { selectedEdgeId = null; rerenderEdges(); });
}

function hideEdgePanel() {
  const panel = document.getElementById('meta-panel');
  if (!panel) return;
  panel.classList.add('hidden');
  document.getElementById('app').classList.remove('meta-open');
  document.getElementById('meta-tags-section')?.classList.remove('hidden');
  const closeBtn = document.getElementById('meta-panel-close');
  if (closeBtn?._canvasEdgeClose) {
    closeBtn.removeEventListener('click', closeBtn._canvasEdgeClose);
    delete closeBtn._canvasEdgeClose;
  }
}

// ── Layers panel ──────────────────────────────────────────────────────────────

function updateLayersBtnLabel() {
  if (!layersBtn || !state) return;
  const layer = state.getLayer(activeLayerId);
  layersBtn.textContent = layer && layer.id !== 'default' ? `Layers · ${layer.name}` : 'Layers';
}

function renderLayersPanel() {
  if (!layersPanel || !state) return;
  const layers = state.getLayers();
  layersPanel.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'layers-panel-header';
  header.textContent = 'Edge Layers';
  layersPanel.appendChild(header);

  const list = document.createElement('ul');
  list.className = 'layers-list';

  for (const layer of layers) {
    const li = document.createElement('li');
    li.className = 'layers-row' + (layer.id === activeLayerId ? ' layers-row-active' : '');

    const eyeBtn = document.createElement('button');
    eyeBtn.className = 'layers-eye' + (layer.visible ? '' : ' layers-eye-hidden');
    eyeBtn.title = layer.visible ? 'Hide layer' : 'Show layer';
    eyeBtn.textContent = layer.visible ? '●' : '○';
    eyeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.setLayerVisible(layer.id, !layer.visible);
      scheduleSave();
      rerenderEdges();
      renderLayersPanel();
    });
    li.appendChild(eyeBtn);

    const swatch = document.createElement('span');
    swatch.className = 'layers-swatch';
    swatch.style.background = layer.color.startsWith('var(') ? 'var(--accent)' : layer.color;
    li.appendChild(swatch);

    const nameEl = document.createElement('span');
    nameEl.className = 'layers-name';
    nameEl.textContent = layer.name;
    li.appendChild(nameEl);

    if (layer.id !== 'default' && layer.id !== 'relationship') {
      const delBtn = document.createElement('button');
      delBtn.className = 'layers-delete';
      delBtn.title = 'Delete layer';
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.removeLayer(layer.id);
        if (activeLayerId === layer.id) {
          activeLayerId = 'default';
          localStorage.setItem('canvas-active-layer', 'default');
          updateLayersBtnLabel();
        }
        scheduleSave();
        rerenderEdges();
        renderLayersPanel();
      });
      li.appendChild(delBtn);
    }

    li.addEventListener('click', () => {
      activeLayerId = layer.id;
      localStorage.setItem('canvas-active-layer', layer.id);
      updateLayersBtnLabel();
      renderLayersPanel();
    });

    list.appendChild(li);
  }

  layersPanel.appendChild(list);

  const addArea = document.createElement('div');
  addArea.className = 'layers-add-area';

  const addBtn = document.createElement('button');
  addBtn.className = 'layers-add-btn';
  addBtn.textContent = '+ Add layer';
  addArea.appendChild(addBtn);

  const addForm = document.createElement('div');
  addForm.className = 'layers-add-form hidden';

  const addInput = document.createElement('input');
  addInput.type = 'text';
  addInput.className = 'layers-add-input';
  addInput.placeholder = 'Layer name…';
  addInput.autocomplete = 'off';
  addForm.appendChild(addInput);

  const addConfirm = document.createElement('button');
  addConfirm.className = 'layers-add-confirm';
  addConfirm.type = 'button';
  addConfirm.textContent = 'Add';
  addForm.appendChild(addConfirm);

  addBtn.addEventListener('click', () => {
    addBtn.classList.add('hidden');
    addForm.classList.remove('hidden');
    addInput.focus();
  });

  function doAddLayer() {
    const name = addInput.value.trim();
    if (!name) return;
    const id = state.addLayer(name);
    activeLayerId = id;
    localStorage.setItem('canvas-active-layer', id);
    updateLayersBtnLabel();
    scheduleSave();
    renderLayersPanel();
  }

  addConfirm.addEventListener('click', doAddLayer);
  addInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doAddLayer();
    if (e.key === 'Escape') {
      addBtn.classList.remove('hidden');
      addForm.classList.add('hidden');
    }
  });

  addArea.appendChild(addForm);
  layersPanel.appendChild(addArea);
}

// ── Page-backed edge panel ────────────────────────────────────────────────────

function showEdgePagePanel(page) {
  const { fields, badge } = openEdgePanelBase();
  const tmpl = getTemplateForType(page.meta?.type);
  badge.textContent = tmpl ? `${tmpl.icon} ${tmpl.label}` : (page.meta?.type || 'Page');

  // Connects chips
  if (Array.isArray(page.meta?.connects) && page.meta.connects.length) {
    const connRow = row('Connects');
    const chips = document.createElement('div');
    chips.className = 'edge-page-connects';
    page.meta.connects.forEach(p => {
      const chip = document.createElement('span');
      chip.className = 'edge-page-chip';
      chip.textContent = pageName(p);
      chips.appendChild(chip);
    });
    connRow.appendChild(chips);
    fields.appendChild(connRow);
  }

  // Name
  const nameRow = row('Name');
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'meta-field-input';
  nameInput.value = page.meta?.name ?? '';
  nameInput.placeholder = 'Page name…';
  nameRow.appendChild(nameInput);
  fields.appendChild(nameRow);

  // Auto-save helper (debounced for text inputs, immediate for selects)
  let autoSaveTimer = null;
  async function doSave() {
    const raw = await fetchRaw(page.path);
    if (!raw) return;
    const { meta, content } = parsePage(raw);
    const trimmed = nameInput.value.trim();
    if (trimmed) meta.name = trimmed;
    for (const [key, inp] of Object.entries(fieldInputs)) {
      meta[key] = inp.value;
    }
    await saveRaw(page.path, serializePage(meta, content));
    allPages = await _getAllPages();
    rerenderEdges();
  }
  function scheduleAutoSave() {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(doSave, 600);
  }

  nameInput.addEventListener('input', scheduleAutoSave);

  // Template meta fields
  const fieldInputs = {};
  for (const field of (tmpl?.metaFields ?? [])) {
    if (field.key === 'name' || field.key === 'connects' || field.key === 'tags') continue;
    const r = row(field.label);
    let input;
    if (field.inputType === 'select') {
      input = document.createElement('select');
      input.className = 'meta-field-input';
      (field.options ?? []).forEach(opt => {
        const o = document.createElement('option');
        o.value = opt; o.textContent = opt;
        if (page.meta[field.key] === opt) o.selected = true;
        input.appendChild(o);
      });
      input.addEventListener('change', doSave);
    } else {
      input = document.createElement('input');
      input.type = 'text';
      input.className = 'meta-field-input';
      input.value = page.meta?.[field.key] ?? '';
      input.placeholder = field.placeholder ?? '';
      input.addEventListener('input', scheduleAutoSave);
    }
    fieldInputs[field.key] = input;
    r.appendChild(input);
    fields.appendChild(r);
  }

  // Open page button
  const openBtn = document.createElement('button');
  openBtn.className = 'edge-panel-btn';
  openBtn.textContent = 'Open page →';
  openBtn.style.cssText = 'background:none; border-color:var(--border); color:var(--text-muted);';
  openBtn.addEventListener('click', () => _onOpenFile(page.path));
  fields.appendChild(openBtn);

  // Detach
  const detachBtn = document.createElement('button');
  detachBtn.className = 'edge-panel-btn edge-panel-btn-danger';
  detachBtn.textContent = 'Detach from canvas';
  detachBtn.addEventListener('click', async () => {
    const raw = await fetchRaw(page.path);
    if (!raw) return;
    const { meta, content } = parsePage(raw);
    delete meta.connects;
    await saveRaw(page.path, serializePage(meta, content));
    selectedEdgePagePath = null;
    allPages = await _getAllPages();
    rerenderEdges();
    hideEdgePanel();
  });
  fields.appendChild(detachBtn);

  wireCloseBtn(() => { selectedEdgePagePath = null; rerenderEdges(); });
}

// ── Edge assignment popover ───────────────────────────────────────────────────

async function saveConnects(pagePath, newPaths) {
  const raw = await fetchRaw(pagePath);
  if (!raw) return;
  const { meta, content } = parsePage(raw);
  const existing = Array.isArray(meta.connects) ? meta.connects : [];
  meta.connects = [...existing, ...newPaths.filter(p => !existing.includes(p))];
  await saveRaw(pagePath, serializePage(meta, content));
}

function showEdgeAssignPopover(fromPath, toPath, clientX, clientY, legacyEdgeId = null) {
  document.querySelector('.edge-assign-popover')?.remove();

  const popover = document.createElement('div');
  popover.className = 'edge-assign-popover';
  popover.style.left = `${Math.min(clientX, window.innerWidth - 300)}px`;
  popover.style.top  = `${Math.min(clientY, window.innerHeight - 260)}px`;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'edge-assign-input';
  input.placeholder = 'Search pages to assign…';
  input.autocomplete = 'off';
  popover.appendChild(input);

  const suggestions = document.createElement('div');
  suggestions.className = 'edge-assign-suggestions';
  popover.appendChild(suggestions);

  const actions = document.createElement('div');
  actions.className = 'edge-assign-actions';

  for (const layer of state.getLayers()) {
    const btn = document.createElement('button');
    btn.className = 'edge-assign-plain';
    const swatchColor = layer.color.startsWith('var(') ? 'var(--accent)' : layer.color;
    btn.innerHTML = `<span class="edge-assign-layer-swatch" style="background:${swatchColor}"></span>${layer.name}`;
    if (layer.id === activeLayerId) btn.classList.add('edge-assign-layer-active');
    btn.addEventListener('click', () => {
      if (legacyEdgeId) state.removeEdge(legacyEdgeId);
      const type = layer.id === 'default' ? undefined : layer.id;
      state.addEdge(fromPath, toPath, '', type);
      activeLayerId = layer.id;
      localStorage.setItem('canvas-active-layer', layer.id);
      updateLayersBtnLabel();
      rerenderEdges();
      scheduleSave();
      dismiss();
    });
    actions.appendChild(btn);
  }

  popover.appendChild(actions);

  document.body.appendChild(popover);
  input.focus();

  function dismiss() {
    popover.remove();
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('click', onOutside, true);
  }

  async function assignPage(pagePath) {
    // Remove legacy canvas edge if this popover was triggered from one
    if (legacyEdgeId) state.removeEdge(legacyEdgeId);
    await saveConnects(pagePath, [fromPath, toPath]);
    allPages = await _getAllPages();
    rerenderEdges();
    if (legacyEdgeId) scheduleSave();
    dismiss();
  }

  function renderSuggestions(q) {
    suggestions.innerHTML = '';
    const matches = allPages
      .filter(p => {
        if (p.meta?.type === 'canvas') return false;
        if (p.path === fromPath || p.path === toPath) return false;
        const name = (p.meta?.name || p.path).toLowerCase();
        return !q || name.includes(q.toLowerCase());
      })
      .slice(0, 6);

    for (const p of matches) {
      const icon = TYPE_ICONS[p.meta?.type] ?? '📄';
      const item = document.createElement('div');
      item.className = 'edge-assign-item';
      item.textContent = `${icon} ${p.meta?.name || p.path}`;
      item.addEventListener('mousedown', (e) => { e.preventDefault(); assignPage(p.path); });
      suggestions.appendChild(item);
    }

    // Create new page option (shown whenever there is text in the input)
    if (q.trim()) {
      const createItem = document.createElement('div');
      createItem.className = 'edge-assign-item edge-assign-create';
      createItem.textContent = `✨ Create new page: "${q.trim()}"`;
      createItem.addEventListener('mousedown', (e) => {
        e.preventDefault();
        dismiss();
        showNewPageModal(async (template, name) => {
          const { path } = await createPage(template.id, name);
          await saveConnects(path, [fromPath, toPath]);
          if (legacyEdgeId) state.removeEdge(legacyEdgeId);
          allPages = await _getAllPages();
          rerenderEdges();
          if (legacyEdgeId) scheduleSave();
        }, { initialName: q.trim() });
      });
      suggestions.appendChild(createItem);
    }
  }

  input.addEventListener('input', () => renderSuggestions(input.value));
  renderSuggestions('');

  function onKey(e) { if (e.key === 'Escape') dismiss(); }
  function onOutside(e) { if (!popover.contains(e.target)) dismiss(); }

  document.addEventListener('keydown', onKey);
  setTimeout(() => document.addEventListener('click', onOutside, true), 100);
}

