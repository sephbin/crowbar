import { TYPE_ICONS } from '../templates/templateRegistry.js';

const DEFAULT_ICON = '📄';

function displayName(node) {
  return node.meta?.name || node.name.replace(/\.(html|md)$/, '');
}

// ─── File row ─────────────────────────────────────────────────────────────────

function fileRow(node, { onFileOpen, onContextMenu, activeFile }) {
  const li = document.createElement('li');
  li.className = 'file' + (node.path === activeFile ? ' active' : '');
  li.dataset.path = node.path;
  li.draggable = true;

  li.addEventListener('dragstart', (e) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', node.path);
  });

  const label = document.createElement('div');
  label.className = 'tree-label file-label';
  label.innerHTML = `<span class="tree-name">${displayName(node)}</span>`;

  label.addEventListener('click', () => onFileOpen(node.path));
  label.addEventListener('contextmenu', e => onContextMenu(e, node));
  li.appendChild(label);
  return li;
}

// ─── Group block ──────────────────────────────────────────────────────────────

// Collapsible group. `renderBody(body)` fills in the body container — either a
// flat file list or nested sub-groups. Defaults to collapsed unless the user
// previously expanded this exact group (tracked by `storageKey`).
// dragTag: when provided, makes the header draggable and encodes this tag string
// as `text/crowbar-tag` — the canvas picks it up to add all pages with that tag.
function groupSection(storageKey, title, icon, count, renderBody, dragTag = null) {
  const section = document.createElement('div');
  section.className = 'tree-group';

  const header = document.createElement('div');
  header.className = 'group-header';
  header.innerHTML = `<span class="group-icon">${icon}</span><span class="group-title">${title}</span><span class="group-count">${count}</span>`;

  if (dragTag !== null) {
    header.draggable = true;
    header.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/crowbar-tag', dragTag);
      e.stopPropagation();
    });
  }

  const key = `group:${storageKey}`;
  let collapsed = sessionStorage.getItem(key) !== 'open';

  const body = document.createElement('div');
  body.className = 'group-body';
  if (collapsed) body.classList.add('hidden');

  header.addEventListener('click', () => {
    collapsed = !collapsed;
    body.classList.toggle('hidden', collapsed);
    sessionStorage.setItem(key, collapsed ? 'collapsed' : 'open');
  });

  renderBody(body);

  section.appendChild(header);
  section.appendChild(body);
  return section;
}

function fileList(nodes, handlers) {
  const ul = document.createElement('ul');
  ul.className = 'file-tree';
  nodes.forEach(n => ul.appendChild(fileRow(n, handlers)));
  return ul;
}

// ─── Grouping layers ────────────────────────────────────────────────────────
//
// A "layer" is a field files can be organised by. `extract(meta)` returns the
// bucket value(s) for a file. `multi: true` means it returns an array (a file
// can land in more than one bucket, e.g. tags); otherwise it returns a single
// scalar (a file lands in exactly one bucket). Sub-grouping is driven by
// picking a layer key here — stacking several layers just means calling
// `groupByLayer` again on each bucket's contents.

export const GROUP_LAYERS = [
  { key: 'tags',       label: 'Tag',          icon: '🏷', multi: true,  extract: meta => meta.tags },
  { key: 'controller', label: 'Controller',   icon: '🎭', multi: false, extract: meta => meta.controller },
  { key: 'faction',    label: 'Controlled by', icon: '⚜', multi: false, extract: meta => meta.faction },
  { key: 'location',   label: 'Location',     icon: '🏰', multi: false, extract: meta => meta.location },
  { key: 'role',       label: 'Role',         icon: '🎯', multi: false, extract: meta => meta.role },
  { key: 'occupation', label: 'Occupation',   icon: '💼', multi: false, extract: meta => meta.occupation },
  { key: 'status',     label: 'Status',       icon: '⚡', multi: false, extract: meta => meta.status },
];

// A "facet" is a structured tag of the form `facet:value` (e.g. "heritage:welsh").
// Facets are not separate top-level layers — they live inside the Tag grouping
// as a nested sub-tree (facet name, then value), since a facet is just a tag.
const FACET_ICON = '🔷';

export function getAllLayers() {
  return GROUP_LAYERS;
}

export function getLayer(key) {
  return GROUP_LAYERS.find(l => l.key === key) ?? GROUP_LAYERS[0];
}

// Splits `files` into buckets keyed by the given layer's extracted value(s).
// Files missing the value (or with an empty array/string) land in `none`.
function groupByLayer(files, layer) {
  const buckets = {};
  const none = [];

  files.forEach(f => {
    const value = layer.extract(f.meta ?? {});
    if (layer.multi) {
      if (!value?.length) { none.push(f); return; }
      value.forEach(v => { (buckets[v] ??= []).push(f); });
    } else {
      if (!value) { none.push(f); return; }
      (buckets[value] ??= []).push(f);
    }
  });

  return { buckets, none };
}

// Renders files grouped by tag into `body`: plain tags are flat groups, while
// facet tags (`facet:value`) nest under a parent group per facet name, with a
// sub-group per value — e.g. "Species" containing "Cat", "Human", etc.
function renderTagGroups(files, body, keyPrefix, handlers) {
  const plainBuckets = {};
  const facetValueBuckets = {}; // facet -> { value -> files[] }
  const facetNames = new Set();
  const untagged = [];

  files.forEach(f => {
    const tags = f.meta?.tags ?? [];
    if (!tags.length) { untagged.push(f); return; }
    tags.forEach(tag => {
      const i = tag.indexOf(':');
      if (i > 0) {
        const facet = tag.slice(0, i);
        const value = tag.slice(i + 1);
        facetNames.add(facet);
        ((facetValueBuckets[facet] ??= {})[value] ??= []).push(f);
      } else {
        (plainBuckets[tag] ??= []).push(f);
      }
    });
  });

  Object.keys(plainBuckets).sort().forEach(tag => {
    const nodes = plainBuckets[tag].sort((a, b) => displayName(a).localeCompare(displayName(b)));
    body.appendChild(groupSection(`${keyPrefix}:tag:${tag}`, tag, '🏷', nodes.length, b => {
      b.appendChild(fileList(nodes, handlers));
    }, tag));
  });

  [...facetNames].sort().forEach(facet => {
    const values = facetValueBuckets[facet] ?? {};
    const facetLabel = facet.charAt(0).toUpperCase() + facet.slice(1);

    const tagged = new Set();
    Object.values(values).forEach(arr => arr.forEach(f => tagged.add(f)));
    const noneFiles = files.filter(f => !tagged.has(f));

    const total = Object.values(values).reduce((sum, arr) => sum + arr.length, 0) + noneFiles.length;

    body.appendChild(groupSection(`${keyPrefix}:facet:${facet}`, facetLabel, FACET_ICON, total, fb => {
      Object.keys(values).sort().forEach(value => {
        const nodes = values[value].sort((a, b) => displayName(a).localeCompare(displayName(b)));
        fb.appendChild(groupSection(`${keyPrefix}:facet:${facet}:${value}`, value, '🏷', nodes.length, vb => {
          vb.appendChild(fileList(nodes, handlers));
        }, `${facet}:${value}`));
      });

      if (noneFiles.length) {
        const nodes = noneFiles.sort((a, b) => displayName(a).localeCompare(displayName(b)));
        fb.appendChild(groupSection(`${keyPrefix}:facet:${facet}:none`, `No ${facetLabel}`, '·', nodes.length, vb => {
          vb.appendChild(fileList(nodes, handlers));
        }));
      }
    }));
  });

  if (untagged.length) {
    const nodes = untagged.sort((a, b) => displayName(a).localeCompare(displayName(b)));
    body.appendChild(groupSection(`${keyPrefix}:tag:none`, 'Untagged', '·', nodes.length, b => {
      b.appendChild(fileList(nodes, handlers));
    }));
  }
}

// ─── Flat list ────────────────────────────────────────────────────────────────

export function renderFlatList(files, handlers) {
  const container = document.createElement('div');
  container.className = 'tree-container';

  const sorted = [...files].sort((a, b) => displayName(a).localeCompare(displayName(b)));
  const ul = document.createElement('ul');
  ul.className = 'file-tree';
  sorted.forEach(n => ul.appendChild(fileRow(n, handlers)));
  container.appendChild(ul);
  return container;
}

// ─── By type ──────────────────────────────────────────────────────────────────

export function renderByType(files, handlers, subGroupKey = 'tags') {
  const container = document.createElement('div');
  container.className = 'tree-container';

  // Group by type
  const groups = {};
  files.forEach(f => {
    const type = f.meta?.type ?? 'page';
    if (!groups[type]) groups[type] = [];
    groups[type].push(f);
  });

  // Order: known types first, then alphabetical
  const order = ['character', 'location', 'faction', 'artifact', 'quest', 'session', 'page'];
  const sortedTypes = [
    ...order.filter(t => groups[t]),
    ...Object.keys(groups).filter(t => !order.includes(t)).sort(),
  ];

  const layer = getLayer(subGroupKey);

  sortedTypes.forEach(type => {
    const nodes = groups[type];
    const icon = TYPE_ICONS[type] ?? DEFAULT_ICON;
    const label = type.charAt(0).toUpperCase() + type.slice(1);

    container.appendChild(groupSection(`type:${type}`, label, icon, nodes.length, body => {
      if (layer.key === 'tags') {
        renderTagGroups(nodes, body, `type:${type}`, handlers);
        return;
      }

      const { buckets, none } = groupByLayer(nodes, layer);

      Object.keys(buckets).sort().forEach(value => {
        const bucketNodes = buckets[value].sort((a, b) => displayName(a).localeCompare(displayName(b)));
        body.appendChild(groupSection(`type:${type}:${layer.key}:${value}`, value, layer.icon, bucketNodes.length, b => {
          b.appendChild(fileList(bucketNodes, handlers));
        }));
      });

      if (none.length) {
        const noneNodes = none.sort((a, b) => displayName(a).localeCompare(displayName(b)));
        body.appendChild(groupSection(`type:${type}:${layer.key}:none`, `No ${layer.label}`, '·', noneNodes.length, b => {
          b.appendChild(fileList(noneNodes, handlers));
        }));
      }
    }));
  });

  return container;
}

// ─── By tag ───────────────────────────────────────────────────────────────────

export function renderByTag(files, handlers) {
  const container = document.createElement('div');
  container.className = 'tree-container';

  renderTagGroups(files, container, 'tag', handlers);

  return container;
}
