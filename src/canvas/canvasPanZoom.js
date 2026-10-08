export function initPanZoom(viewport, world) {
  let tx = 0, ty = 0, scale = 1;
  let isPanning = false, panStart = null;
  let spaceDown = false;
  let rightDragActive = false;
  let rightDragMoved  = false;

  applyTransform();

  function applyTransform() {
    world.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  // ── Touch: 1-finger pan + 2-finger pinch zoom ────────────────────────────────
  let touchPanId    = null;
  let touchPanStart = null;   // { x: clientX - tx, y: clientY - ty }
  let pinchDist     = null;
  let pinchLastMid  = null;

  viewport.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      const onInteractive = !!e.target.closest('.canvas-node, .canvas-hub-node, .canvas-group-header');
      if (!onInteractive) {
        const t = e.touches[0];
        touchPanId    = t.identifier;
        touchPanStart = { x: t.clientX - tx, y: t.clientY - ty };
      }
    } else if (e.touches.length === 2) {
      touchPanStart = null;
      touchPanId    = null;
      const t1 = e.touches[0], t2 = e.touches[1];
      pinchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const rect = viewport.getBoundingClientRect();
      pinchLastMid = {
        x: (t1.clientX + t2.clientX) / 2 - rect.left,
        y: (t1.clientY + t2.clientY) / 2 - rect.top,
      };
    }
  }, { passive: true });

  viewport.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length === 1 && touchPanStart !== null) {
      const t = [...e.touches].find(t => t.identifier === touchPanId);
      if (!t) return;
      tx = t.clientX - touchPanStart.x;
      ty = t.clientY - touchPanStart.y;
      applyTransform();
    } else if (e.touches.length === 2 && pinchDist !== null) {
      const t1 = e.touches[0], t2 = e.touches[1];
      const newDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const factor  = newDist / pinchDist;
      const rect = viewport.getBoundingClientRect();
      const mx = (t1.clientX + t2.clientX) / 2 - rect.left;
      const my = (t1.clientY + t2.clientY) / 2 - rect.top;
      // Zoom around pinch midpoint
      tx = mx - (mx - tx) * factor;
      ty = my - (my - ty) * factor;
      scale = Math.min(Math.max(scale * factor, 0.1), 3);
      // Pan from midpoint movement
      if (pinchLastMid) { tx += mx - pinchLastMid.x; ty += my - pinchLastMid.y; }
      pinchLastMid = { x: mx, y: my };
      pinchDist = newDist;
      applyTransform();
    }
  }, { passive: false });

  viewport.addEventListener('touchend', (e) => {
    const ended = new Set([...e.changedTouches].map(t => t.identifier));
    if (touchPanId !== null && ended.has(touchPanId)) { touchPanStart = null; touchPanId = null; }
    if (e.touches.length < 2) { pinchDist = null; pinchLastMid = null; }
  }, { passive: true });

  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const rect = viewport.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    tx = mx - (mx - tx) * factor;
    ty = my - (my - ty) * factor;
    scale = Math.min(Math.max(scale * factor, 0.1), 3);
    applyTransform();
  }, { passive: false });

  viewport.addEventListener('mousedown', (e) => {
    const onNode = !!e.target.closest('.canvas-node');
    if (e.button === 1 || (e.button === 0 && spaceDown) || (e.button === 2 && !onNode)) {
      isPanning = true;
      rightDragActive = e.button === 2;
      rightDragMoved  = false;
      panStart = { x: e.clientX - tx, y: e.clientY - ty };
      e.preventDefault();
    }
  });

  // Suppress context menu only when a right-drag pan actually moved
  viewport.addEventListener('contextmenu', (e) => {
    if (rightDragActive) {
      e.preventDefault();
      rightDragActive = false;
    }
  });

  const onMouseMove = (e) => {
    if (!isPanning) return;
    if (rightDragActive) rightDragMoved = true;
    tx = e.clientX - panStart.x;
    ty = e.clientY - panStart.y;
    applyTransform();
  };

  const onMouseUp = (e) => {
    if (!isPanning) return;
    if (e.button === 2) {
      if (!rightDragMoved) rightDragActive = false; // no movement → let contextmenu fire normally
      isPanning = false;
      return;
    }
    if (e.button === 1 || (e.button === 0 && spaceDown)) isPanning = false;
  };

  const onKeyDown = (e) => {
    if (e.code === 'Space' && !e.target.matches('input,textarea,[contenteditable]')) {
      spaceDown = true;
      viewport.style.cursor = 'grab';
      e.preventDefault();
    }
  };

  const onKeyUp = (e) => {
    if (e.code === 'Space') { spaceDown = false; viewport.style.cursor = ''; }
  };

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  return {
    getTransform() { return { tx, ty, scale }; },

    setTransform(t) {
      tx = t.tx ?? 0; ty = t.ty ?? 0; scale = t.scale ?? 1;
      applyTransform();
    },

    screenToWorld(sx, sy) {
      return { x: (sx - tx) / scale, y: (sy - ty) / scale };
    },

    isInPanMode() { return spaceDown || isPanning; },

    fitToScreen(nodeMap) {
      if (!nodeMap.size) return;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of nodeMap.values()) {
        const h = n.detail === 'name-only' ? 44 : 88;
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + 180);
        maxY = Math.max(maxY, n.y + h);
      }
      const rect = viewport.getBoundingClientRect();
      const pad = 80;
      const contentW = maxX - minX + pad * 2;
      const contentH = maxY - minY + pad * 2;
      scale = Math.min(rect.width / contentW, rect.height / contentH, 2);
      tx = (rect.width - contentW * scale) / 2 - (minX - pad) * scale;
      ty = (rect.height - contentH * scale) / 2 - (minY - pad) * scale;
      applyTransform();
    },

    destroy() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    },
  };
}
