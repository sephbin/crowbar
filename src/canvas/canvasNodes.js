import { getTemplateForType } from '../templates/templateRegistry.js';

export const NODE_W = 180;

export function nodeHeight(detail) {
  return detail === 'name-only' ? 44 : 88;
}

function compactFields(meta) {
  const template = getTemplateForType(meta.type);
  return (template?.metaFields ?? [])
    .filter(f => f.key !== 'name' && meta[f.key] != null && meta[f.key] !== '')
    .slice(0, 3)
    .map(f => ({ label: f.label, value: String(meta[f.key]) }));
}

const PORT_SIDES = ['top', 'right', 'bottom', 'left'];

function portStyle(side) {
  const mid = 'calc(50% - 5px)';
  switch (side) {
    case 'top':    return { top: '-5px',  left: mid,   right: '',    bottom: '' };
    case 'right':  return { top: mid,     left: '',     right: '-5px', bottom: '' };
    case 'bottom': return { top: '',      left: mid,   right: '',    bottom: '-5px' };
    case 'left':   return { top: mid,     left: '-5px', right: '',    bottom: '' };
  }
}

export function createNodeCard(nodeState, pageByPath, { onDoubleClick, onShiftClick, onMoved, onDragging, onPortDragStart, onRemove, onContextMenu, getScale }) {
  const { path } = nodeState;
  const page   = pageByPath.get(path);
  const meta   = page?.meta ?? {};
  const name   = meta.name || path.split('/').pop().replace(/\.(html|md)$/, '');
  const detail = nodeState.detail ?? 'compact';
  const isGhost = !page;

  const el = document.createElement('div');
  el.className = [
    'canvas-node',
    `canvas-node-${detail}`,
    isGhost ? 'canvas-node-ghost' : '',
  ].filter(Boolean).join(' ');
  el.dataset.path = path;
  el.style.left = `${nodeState.x}px`;
  el.style.top  = `${nodeState.y}px`;

  const header = document.createElement('div');
  header.className = 'canvas-node-header';
  header.innerHTML = `<span class="canvas-node-name">${name}</span>`;
  el.appendChild(header);

  if (!isGhost && detail === 'compact') {
    const fields = compactFields(meta);
    if (fields.length) {
      const props = document.createElement('div');
      props.className = 'canvas-node-props';
      fields.forEach(({ label, value }) => {
        const row = document.createElement('span');
        row.className = 'canvas-node-prop';
        row.innerHTML = `<span class="prop-label">${label}:</span> <span class="prop-value">${value}</span>`;
        props.appendChild(row);
      });
      el.appendChild(props);
    }
  }

  if (isGhost) {
    const btn = document.createElement('button');
    btn.className = 'canvas-node-remove';
    btn.title = 'Remove from canvas';
    btn.textContent = '✕';
    btn.addEventListener('click', (e) => { e.stopPropagation(); onRemove(path); });
    el.appendChild(btn);
  }

  // Connection port dots (appear on hover / selection)
  if (onPortDragStart) {
    for (const side of PORT_SIDES) {
      const port = document.createElement('div');
      port.className = `canvas-port canvas-port-${side}`;
      const ps = portStyle(side);
      if (ps.top)    port.style.top    = ps.top;
      if (ps.right)  port.style.right  = ps.right;
      if (ps.bottom) port.style.bottom = ps.bottom;
      if (ps.left)   port.style.left   = ps.left;
      port.title = 'Drag to connect';
      port.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        onPortDragStart(path, side, e);
      });
      el.appendChild(port);
    }
  }

  el.addEventListener('dblclick', (e) => {
    if (e.shiftKey) return;
    e.stopPropagation();
    onDoubleClick(path);
  });

  el.addEventListener('click', (e) => {
    if (!e.shiftKey) return;
    e.stopPropagation();
    onShiftClick(path, el);
  });

  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e, nodeState);
  });

  // World-space drag — reports delta so multi-node movement can be handled upstream
  let dragging = false, startMouse, startWorld;

  el.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.shiftKey) return;
    e.stopPropagation();
    dragging = true;
    startMouse = { x: e.clientX, y: e.clientY };
    startWorld = { x: nodeState.x, y: nodeState.y };
    document.body.style.userSelect = 'none';
  });

  const onMouseMove = (e) => {
    if (!dragging) return;
    const sc = getScale();
    nodeState.x = startWorld.x + (e.clientX - startMouse.x) / sc;
    nodeState.y = startWorld.y + (e.clientY - startMouse.y) / sc;
    el.style.left = `${nodeState.x}px`;
    el.style.top  = `${nodeState.y}px`;
    onDragging?.(path, nodeState.x - startWorld.x, nodeState.y - startWorld.y);
  };

  const onMouseUp = () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = '';
    const dx = nodeState.x - startWorld.x;
    const dy = nodeState.y - startWorld.y;
    onMoved(path, dx, dy);
  };

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);

  // ── Touch drag + double-tap to open ──────────────────────────────────────────
  let touchDragging = false, touchStart = null;
  let lastTapTime = 0;

  el.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    e.stopPropagation();
    const t = e.touches[0];
    touchDragging = true;
    touchStart  = { x: t.clientX, y: t.clientY };
    startMouse  = { x: t.clientX, y: t.clientY };
    startWorld  = { x: nodeState.x, y: nodeState.y };
    document.body.style.userSelect = 'none';
  }, { passive: true });

  el.addEventListener('touchmove', (e) => {
    if (!touchDragging || e.touches.length !== 1) return;
    e.preventDefault();
    const t = e.touches[0];
    const sc = getScale();
    nodeState.x = startWorld.x + (t.clientX - startMouse.x) / sc;
    nodeState.y = startWorld.y + (t.clientY - startMouse.y) / sc;
    el.style.left = `${nodeState.x}px`;
    el.style.top  = `${nodeState.y}px`;
    onDragging?.(path, nodeState.x - startWorld.x, nodeState.y - startWorld.y);
  }, { passive: false });

  el.addEventListener('touchend', (e) => {
    if (!touchDragging) return;
    touchDragging = false;
    document.body.style.userSelect = '';
    const t = e.changedTouches[0];
    const movedX = Math.abs(t.clientX - touchStart.x);
    const movedY = Math.abs(t.clientY - touchStart.y);
    const dx = nodeState.x - startWorld.x;
    const dy = nodeState.y - startWorld.y;
    onMoved(path, dx, dy);
    if (movedX < 10 && movedY < 10) {
      const now = Date.now();
      if (now - lastTapTime < 350) { onDoubleClick(path); lastTapTime = 0; }
      else lastTapTime = now;
    }
  }, { passive: true });

  el._cleanup = () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };

  return el;
}
