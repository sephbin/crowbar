const NS = 'http://www.w3.org/2000/svg';
const NODE_W = 180;
const D = Math.SQRT2 / 2; // unit diagonal component ≈ 0.707

// ─── Geometry helpers ──────────────────────────────────────────────────────────

function nodeH(node) { return node.detail === 'name-only' ? 44 : 88; }

// 8 anchor points per card: 4 edge midpoints + 4 corners.
// Each carries an outward unit direction (dx, dy) for bezier control points.
// Hub nodes (node.hub === true) use a single centerpoint anchor so all splines
// terminate at the dot's center with no preferred outgoing direction.
function nodeAnchors(node) {
  if (node.hub) return [{ x: node.x, y: node.y, dx: 0, dy: 0 }];

  const w  = NODE_W;
  const h  = nodeH(node);
  const cx = node.x + w / 2;
  const cy = node.y + h / 2;
  const x0 = node.x, x1 = node.x + w;
  const y0 = node.y, y1 = node.y + h;

  return [
    // Edge midpoints
    { x: cx, y: y0, dx:  0, dy: -1 },  // top
    { x: cx, y: y1, dx:  0, dy:  1 },  // bottom
    { x: x0, y: cy, dx: -1, dy:  0 },  // left
    { x: x1, y: cy, dx:  1, dy:  0 },  // right
    // Corners
    { x: x0, y: y0, dx: -D, dy: -D },  // top-left
    { x: x1, y: y0, dx:  D, dy: -D },  // top-right
    { x: x1, y: y1, dx:  D, dy:  D },  // bottom-right
    { x: x0, y: y1, dx: -D, dy:  D },  // bottom-left
  ];
}

// Pick the anchor pair (one from each node) with the smallest distance,
// then build a bezier whose tangents follow each anchor's outward direction.
function directionalEdge(fromNode, toNode) {
  const fromAnchors = nodeAnchors(fromNode);
  const toAnchors   = nodeAnchors(toNode);

  let best = Infinity, fa = fromAnchors[0], ta = toAnchors[0];
  for (const a of fromAnchors) {
    for (const b of toAnchors) {
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      if (dist < best) { best = dist; fa = a; ta = b; }
    }
  }

  const ctrl = Math.max(best * 0.15, 30);
  const c1   = { x: fa.x + fa.dx * ctrl, y: fa.y + fa.dy * ctrl };
  const c2   = { x: ta.x + ta.dx * ctrl, y: ta.y + ta.dy * ctrl };

  return {
    d:   `M ${fa.x} ${fa.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${ta.x} ${ta.y}`,
    mid: bezierMid(fa, c1, c2, ta),
  };
}

function bezierMid(p0, p1, p2, p3) {
  const t = 0.5;
  const ax = p0.x + (p1.x - p0.x) * t, ay = p0.y + (p1.y - p0.y) * t;
  const bx = p1.x + (p2.x - p1.x) * t, by = p1.y + (p2.y - p1.y) * t;
  const cx = p2.x + (p3.x - p2.x) * t, cy = p2.y + (p3.y - p2.y) * t;
  const dx = ax + (bx - ax) * t,        dy = ay + (by - ay) * t;
  const ex = bx + (cx - bx) * t,        ey = by + (cy - by) * t;
  return { x: dx + (ex - dx) * t, y: dy + (ey - dy) * t };
}

function svgEl(tag, attrs) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

// ─── Renderers ────────────────────────────────────────────────────────────────

const FALLBACK_LAYER = { color: 'var(--accent)', selectedColor: 'var(--accent2)', dash: '', visible: true };

export function renderCustomEdges(group, edges, nodes, { selectedId, layers } = {}) {
  const layerMap = new Map();
  for (const l of (layers ?? [])) layerMap.set(l.id, l);

  group.innerHTML = '';
  for (const edge of edges.values()) {
    const fromNode = nodes.get(edge.from);
    const toNode   = nodes.get(edge.to);
    if (!fromNode || !toNode) continue;

    const layerId = edge.type ?? 'default';
    const layer   = layerMap.get(layerId) ?? FALLBACK_LAYER;
    if (!layer.visible) continue;

    const { d, mid } = directionalEdge(fromNode, toNode);
    const isSel   = edge.id === selectedId;
    const stroke  = isSel ? layer.selectedColor : layer.color;
    const dash    = layer.dash && !isSel ? layer.dash : '';
    const weight  = isSel ? '2' : (layer.dash ? '1.5' : '2');

    const hit = svgEl('path', { d, stroke: 'transparent', 'stroke-width': '14', fill: 'none', 'data-edge-id': edge.id });
    hit.style.cursor = 'pointer';
    group.appendChild(hit);

    group.appendChild(svgEl('path', { d, stroke, 'stroke-width': weight, 'stroke-dasharray': dash, fill: 'none', 'data-edge-id': edge.id }));

    if (edge.label) {
      const text = svgEl('text', {
        x: mid.x, y: mid.y - 5,
        'text-anchor': 'middle',
        fill: layerId === 'default' ? 'var(--text-muted)' : layer.color,
        'font-size': '11',
        'font-family': 'Segoe UI, system-ui, sans-serif',
      });
      text.textContent = edge.label;
      group.appendChild(text);
    }
  }
}

// Color and dash style keyed by page type
const TYPE_EDGE_COLORS = {
  character: '#e8888a',
  location:  '#72c472',
  faction:   '#c472c4',
  event:     '#6aa3e8',
  quest:     '#e8a44a',
  session:   '#a472c4',
};
const TYPE_EDGE_DASHES = {
  event:   '8 4',
  session: '8 4',
};

export function renderEdgePageLines(group, edgePages, nodes, { selectedPath } = {}) {
  group.innerHTML = '';
  for (const page of edgePages) {
    const connects = page.meta?.connects;
    if (!Array.isArray(connects) || connects.length < 2) continue;
    const hubNode = nodes.get(connects[0]);
    if (!hubNode) continue;

    const color  = TYPE_EDGE_COLORS[page.meta.type] ?? 'var(--accent)';
    const dash   = TYPE_EDGE_DASHES[page.meta.type] ?? '';
    const isSel  = page.path === selectedPath;
    const weight = isSel ? '2.5' : '1.5';
    const opacity = isSel ? '1' : '0.8';

    let labelMid = null;

    for (let i = 1; i < connects.length; i++) {
      const targetNode = nodes.get(connects[i]);
      if (!targetNode) continue;

      const { d, mid } = directionalEdge(hubNode, targetNode);
      if (!labelMid) labelMid = mid;

      const hit = svgEl('path', { d, stroke: 'transparent', 'stroke-width': '14', fill: 'none', 'data-edge-page-path': page.path });
      hit.style.cursor = 'pointer';
      group.appendChild(hit);

      group.appendChild(svgEl('path', { d, stroke: color, 'stroke-width': weight, 'stroke-dasharray': dash, fill: 'none', opacity, 'data-edge-page-path': page.path }));
    }

    if (labelMid && page.meta.name) {
      const text = svgEl('text', { x: labelMid.x, y: labelMid.y - 6, 'text-anchor': 'middle', fill: color, 'font-size': '11', 'font-family': 'Segoe UI, system-ui, sans-serif', opacity: '0.9', 'pointer-events': 'none' });
      text.textContent = page.meta.name;
      group.appendChild(text);
    }
  }
}

