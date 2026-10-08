import { TEMPLATES, TYPE_ICONS } from '../templates/templateRegistry.js';
import { createPage } from '../data/vaultApi.js';

// Inline links between pages. Typing "[[" opens a page picker; choosing a page
// inserts <a class="page-link" data-page="path">Name</a>. If no page has that
// name, the picker offers to create one (choose a template). Typing a complete
// "[[Name]]" links the page of that name, or starts creating it. Right-clicking a link
// offers to open it, remove it, or convert it into a relationship.

const TRIGGER = /\[\[([^\[\]]*)(\]\])?$/;
const CREATABLE = TEMPLATES.filter(t => t.id !== 'canvas');

function displayName(page) {
  return page.meta?.name || page.name.replace(/\.(html|md)$/, '');
}

function makeLink(page) {
  const a = document.createElement('a');
  a.className = 'page-link';
  a.dataset.page = page.path;
  a.contentEditable = 'false';
  a.textContent = displayName(page);
  return a;
}

// opts: getPages() → Promise<page[]>, getCurrentPath(), getCurrentType(),
//       onNavigate(path), onConvert({ target, label, reverseLabel })
export function initPageLinks(editorEl, opts) {
  const menu = document.getElementById('context-menu'); // shared with the sidebar; it hides on any click

  const picker = document.createElement('div');
  picker.className = 'link-picker hidden';
  document.body.appendChild(picker);

  let pages = [];
  let rows = [];     // picker rows: { kind: 'page' | 'create' | 'type', ... }
  let selected = 0;
  let typedName = ''; // name as typed (original case), used when creating a page

  const isOpen = () => !picker.classList.contains('hidden');
  function closePicker() { picker.classList.add('hidden'); picker.innerHTML = ''; }

  // The "[[query" text immediately before the caret, as a Range — or null.
  function triggerRange() {
    const sel = getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return null;
    const { startContainer: node, startOffset: offset } = sel.getRangeAt(0);
    if (node.nodeType !== Node.TEXT_NODE || !editorEl.contains(node)) return null;
    const m = TRIGGER.exec(node.data.slice(0, offset));
    if (!m || (m[2] && !m[1].trim())) return null; // "[[]]" is not a link
    const range = document.createRange();
    range.setStart(node, offset - m[0].length);
    range.setEnd(node, offset);
    return { range, query: m[1], closed: !!m[2] };
  }

  function rowLabel(row) {
    if (row.kind === 'page') return `${TYPE_ICONS[row.page.meta?.type] ?? '📄'} ${displayName(row.page)}`;
    if (row.kind === 'create') return `➕ Create page “${row.name}”`;
    return `${row.template.icon} ${row.template.label}`;
  }

  function renderPicker(heading) {
    picker.innerHTML = '';
    if (heading) {
      const h = document.createElement('div');
      h.className = 'link-picker-empty';
      h.textContent = heading;
      picker.appendChild(h);
    }
    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'link-picker-empty';
      empty.textContent = 'No matching pages';
      picker.appendChild(empty);
      return;
    }
    rows.forEach((row, i) => {
      const item = document.createElement('div');
      item.className = 'link-picker-item' + (i === selected ? ' selected' : '');
      item.textContent = rowLabel(row);
      // mousedown, not click: keep the editor's caret/selection intact
      item.addEventListener('mousedown', (e) => { e.preventDefault(); activate(row); });
      picker.appendChild(item);
    });
    picker.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
  }

  // Second step of creating a page: pick its template.
  function showTypeStep(name) {
    rows = CREATABLE.map(template => ({ kind: 'type', template, name }));
    selected = Math.max(0, rows.findIndex(r => r.template.id === 'blank')); // default: Blank
    renderPicker(`New page “${name}” — choose a type`);
  }

  async function activate(row) {
    if (row.kind === 'page') return choose(row.page);
    if (row.kind === 'create') return showTypeStep(row.name);
    const created = await createPage(row.template.id, row.name);
    choose({ path: created.path, name: created.path, meta: created.meta });
  }

  function positionPicker(range) {
    const rect = range.getBoundingClientRect();
    picker.style.left = `${Math.min(rect.left, window.innerWidth - 280)}px`;
    picker.style.top = `${rect.bottom + 4}px`;
  }

  function choose(page) {
    const t = triggerRange();
    if (!t) return closePicker();
    t.range.deleteContents();
    const link = makeLink(page);
    const space = document.createTextNode(' ');
    t.range.insertNode(space);
    t.range.insertNode(link);
    const caret = document.createRange();
    caret.setStartAfter(space);
    caret.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(caret);
    closePicker();
    editorEl.dispatchEvent(new Event('input', { bubbles: true })); // triggers autosave
  }

  async function update() {
    if (!triggerRange()) return closePicker();
    if (!isOpen()) pages = await opts.getPages(); // fresh list each time the picker opens
    const t = triggerRange(); // caret may have moved while fetching
    if (!t) return closePicker();

    typedName = t.query.trim();
    const q = typedName.toLowerCase();
    const others = pages.filter(p => p.path !== opts.getCurrentPath());
    const exact = others.find(p => displayName(p).toLowerCase() === q);

    // "[[Name]]" typed in full: link an existing page right away, else start creating one
    if (t.closed) {
      if (exact) return choose(exact);
      picker.classList.remove('hidden');
      positionPicker(t.range);
      return showTypeStep(typedName);
    }

    rows = others
      .filter(p => displayName(p).toLowerCase().includes(q))
      .sort((a, b) => displayName(a).localeCompare(displayName(b)))
      .slice(0, 30)
      .map(page => ({ kind: 'page', page }));
    if (typedName && !exact) rows.push({ kind: 'create', name: typedName });
    selected = 0;
    picker.classList.remove('hidden');
    renderPicker();
    positionPicker(t.range);
  }

  editorEl.addEventListener('input', update);

  editorEl.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!rows.length) return;
      selected = (selected + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      renderPicker(rows[0].kind === 'type' ? `New page “${rows[0].name}” — choose a type` : '');
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (!rows.length) return;
      e.preventDefault();
      e.stopImmediatePropagation(); // don't let the editor's Tab handler insert spaces
      activate(rows[selected]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closePicker();
    }
  }, true);

  document.addEventListener('mousedown', (e) => { if (!picker.contains(e.target)) closePicker(); });
  editorEl.addEventListener('blur', () => setTimeout(closePicker, 150));

  // ── Clicking and right-clicking a link ──

  editorEl.addEventListener('click', (e) => {
    const link = e.target.closest?.('a.page-link');
    if (!link) return;
    e.preventDefault();
    opts.onNavigate(link.dataset.page);
  });

  function unlink(link) {
    link.replaceWith(document.createTextNode(link.textContent));
    editorEl.dispatchEvent(new Event('input', { bubbles: true }));
  }

  async function convert(link) {
    const label = prompt(`They (${link.textContent}) are my…`)?.trim() ?? '';
    const reverseLabel = prompt(`I am ${link.textContent}'s…`)?.trim() ?? '';
    if (!label && !reverseLabel) return;
    await opts.onConvert({ target: link.dataset.page, label, reverseLabel });
    unlink(link); // the relationship now carries the connection; keep the name as plain text
  }

  editorEl.addEventListener('contextmenu', async (e) => {
    const link = e.target.closest?.('a.page-link');
    if (!link) return;
    e.preventDefault();

    // Relationships only exist between characters (see relationshipsBlock.js)
    const target = (await opts.getPages()).find(p => p.path === link.dataset.page);
    const canConvert = opts.getCurrentType() === 'character' && target?.meta?.type === 'character';

    const items = [
      { label: 'Open page', action: () => opts.onNavigate(link.dataset.page) },
      canConvert
        ? { label: 'Convert to relationship…', action: () => convert(link) }
        : { label: 'Convert to relationship (characters only)', disabled: true },
      { label: 'Remove link', action: () => unlink(link) },
    ];

    menu.innerHTML = '';
    items.forEach(({ label, action, disabled }) => {
      const li = document.createElement('li');
      li.textContent = label;
      if (disabled) li.style.cssText = 'opacity:.45;cursor:default';
      else li.addEventListener('click', () => { menu.classList.add('hidden'); action(); });
      menu.appendChild(li);
    });
    menu.style.top = `${e.clientY}px`;
    menu.style.left = `${e.clientX}px`;
    menu.classList.remove('hidden');
  });
}
