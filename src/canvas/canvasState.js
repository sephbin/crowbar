const LAYER_PALETTE = [
  { color: '#e8888a', selectedColor: '#f0aaab' },
  { color: '#72c472', selectedColor: '#9dd09d' },
  { color: '#c472c4', selectedColor: '#d9a3d9' },
  { color: '#6aa3e8', selectedColor: '#9dc3f0' },
  { color: '#e8a44a', selectedColor: '#f0c487' },
  { color: '#a472c4', selectedColor: '#c2a0d9' },
];

const BUILTIN_LAYERS = [
  { id: 'default',      name: 'Edges',         color: 'var(--accent)', selectedColor: 'var(--accent2)', dash: '',    visible: true },
  { id: 'relationship', name: 'Relationships',  color: '#5a527a',       selectedColor: '#9b8fc0',        dash: '6 4', visible: true },
];

export function createCanvasState() {
  let nodes  = new Map(); // path → { path, x, y, detail }
  let edges  = new Map(); // id   → { id, from, to, label, type? }
  let groups = new Map(); // id   → { id, label, x, y, w, h }
  let hubs   = new Map(); // id   → { id, label, x, y }
  let layers = BUILTIN_LAYERS.map(l => ({ ...l }));

  return {
    // ── Nodes ──────────────────────────────────────────────────────────────────
    hasNode(path) { return nodes.has(path); },

    addNode(path, x, y, detail = 'compact') {
      nodes.set(path, { path, x, y, detail });
    },

    removeNode(path) {
      nodes.delete(path);
      for (const [id, e] of edges) {
        if (e.from === path || e.to === path) edges.delete(id);
      }
    },

    moveNode(path, x, y) {
      const n = nodes.get(path);
      if (n) { n.x = x; n.y = y; }
    },

    setNodeDetail(path, detail) {
      const n = nodes.get(path);
      if (n) n.detail = detail;
    },

    getNodes() { return nodes; },

    // ── Hubs ───────────────────────────────────────────────────────────────────
    addHub(label, x, y) {
      const id = 'hub:' + Math.random().toString(36).slice(2, 10);
      hubs.set(id, { id, label, x, y });
      return id;
    },

    removeHub(id) {
      hubs.delete(id);
      for (const [eid, e] of edges) {
        if (e.from === id || e.to === id) edges.delete(eid);
      }
    },

    moveHub(id, x, y) {
      const h = hubs.get(id);
      if (h) { h.x = x; h.y = y; }
    },

    getHubs() { return hubs; },

    // ── Edges ──────────────────────────────────────────────────────────────────
    addEdge(from, to, label, type) {
      const id = Math.random().toString(36).slice(2, 10);
      const edge = { id, from, to, label };
      if (type) edge.type = type;
      edges.set(id, edge);
      return id;
    },

    removeEdge(id) { edges.delete(id); },

    getEdges() { return edges; },

    // ── Groups ─────────────────────────────────────────────────────────────────
    addGroup(label, x, y, w, h) {
      const id = Math.random().toString(36).slice(2, 10);
      groups.set(id, { id, label, x, y, w, h });
      return id;
    },

    removeGroup(id) { groups.delete(id); },

    moveGroup(id, x, y) {
      const g = groups.get(id);
      if (g) { g.x = x; g.y = y; }
    },

    getGroups() { return groups; },

    // ── Layers ─────────────────────────────────────────────────────────────────
    getLayers() { return layers; },

    getLayer(id) { return layers.find(l => l.id === id); },

    addLayer(name) {
      const id = Math.random().toString(36).slice(2, 10);
      const palette = LAYER_PALETTE[(layers.length - BUILTIN_LAYERS.length) % LAYER_PALETTE.length];
      layers.push({ id, name, dash: '', visible: true, ...palette });
      return id;
    },

    removeLayer(id) {
      if (id === 'default' || id === 'relationship') return;
      layers = layers.filter(l => l.id !== id);
      for (const edge of edges.values()) {
        if (edge.type === id) delete edge.type;
      }
    },

    setLayerVisible(id, visible) {
      const l = layers.find(l => l.id === id);
      if (l) l.visible = visible;
    },

    renameLayer(id, name) {
      const l = layers.find(l => l.id === id);
      if (l) l.name = name;
    },

    // ── Serialisation ──────────────────────────────────────────────────────────
    loadJSON({ nodes: ns = [], edges: es = [], groups: gs = [], hubs: hs = [], layers: ls }) {
      nodes  = new Map(ns.map(n => [n.path, { detail: 'compact', ...n }]));
      edges  = new Map(es.map(e => [e.id, e]));
      groups = new Map(gs.map(g => [g.id, g]));
      hubs   = new Map(hs.map(h => [h.id, h]));
      if (ls?.length) {
        layers = ls;
        // Ensure built-in layers exist (for canvases created before this feature)
        for (const builtin of BUILTIN_LAYERS) {
          if (!layers.find(l => l.id === builtin.id)) {
            layers.unshift({ ...builtin });
          }
        }
      } else {
        layers = BUILTIN_LAYERS.map(l => ({ ...l }));
      }
    },

    toJSON() {
      return {
        nodes:  [...nodes.values()],
        edges:  [...edges.values()],
        groups: [...groups.values()],
        hubs:   [...hubs.values()],
        layers: [...layers],
      };
    },
  };
}
