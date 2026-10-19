// Proposals: any block (paragraph, list item, ...) can carry class="proposal" to mark it as a
// suggestion that still needs a decision. The content stays editable in place; a small bar
// (never saved) offers Approve and Comment. State lives in the saved HTML as attributes:
//   data-status="proposed" | "approved"
//   data-comments='[{"text":"...","at":"2025-01-01T00:00:00.000Z"}]'
// so Claude can read approvals and comments straight from the page file.

const BLOCK_SELECTOR = 'li, p, h1, h2, h3, h4, blockquote, div';

function readComments(el) {
  try {
    const c = JSON.parse(el.dataset.comments || '[]');
    return Array.isArray(c) ? c : [];
  } catch { return []; }
}

function button(label, cls, title) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `proposal-btn ${cls}`;
  b.textContent = label;
  if (title) b.title = title;
  return b;
}

function buildBar(el) {
  const bar = document.createElement('div');
  bar.className = 'proposal-bar';
  bar.contentEditable = 'false';

  const approved = el.dataset.status === 'approved';
  const badge = document.createElement('span');
  badge.className = 'proposal-badge';
  badge.textContent = approved ? 'Approved' : 'Proposed';
  bar.appendChild(badge);

  bar.appendChild(button(approved ? 'Undo approval' : 'Approve', 'proposal-approve', approved ? 'Back to proposed' : 'Approve this'));
  bar.appendChild(button('Comment', 'proposal-comment', 'Add a comment'));

  readComments(el).forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'proposal-note';
    const txt = document.createElement('span');
    txt.textContent = c.text;
    row.appendChild(txt);
    const rm = button('×', 'proposal-remove', 'Delete comment');
    rm.dataset.index = String(i);
    row.appendChild(rm);
    bar.appendChild(row);
  });
  return bar;
}

function renderBar(el) {
  el.querySelectorAll(':scope > .proposal-bar').forEach(b => b.remove());
  el.appendChild(buildBar(el));
}

// Idempotent: only rebuilds a bar that is missing, duplicated (e.g. after Enter splits an item) or out of place.
export function refreshProposals(root) {
  root.querySelectorAll('.proposal').forEach(el => {
    const bars = el.querySelectorAll(':scope > .proposal-bar');
    if (bars.length !== 1 || el.lastElementChild !== bars[0]) renderBar(el);
  });
  root.querySelectorAll('.proposal-bar').forEach(b => {
    if (!b.parentElement?.classList.contains('proposal')) b.remove();
  });
}

export function stripProposalBars(root) {
  root.querySelectorAll('.proposal-bar').forEach(b => b.remove());
}

// Toolbar action: mark or unmark the block holding the cursor.
export function toggleProposal(root) {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return;
  let node = sel.anchorNode;
  node = node?.nodeType === 3 ? node.parentElement : node;
  const el = node?.closest?.(BLOCK_SELECTOR);
  if (!el || !root.contains(el) || el === root || el.closest('.block-stack, .rel-block, .connections-block')) return;
  if (el.classList.contains('proposal')) {
    el.classList.remove('proposal');
    el.removeAttribute('data-status');
    el.removeAttribute('data-comments');
    el.querySelectorAll(':scope > .proposal-bar').forEach(b => b.remove());
    if (!el.getAttribute('class')) el.removeAttribute('class');
  } else {
    el.classList.add('proposal');
    el.dataset.status = 'proposed';
    renderBar(el);
  }
  root.dispatchEvent(new Event('input', { bubbles: true }));
}

// Wires the bar buttons. onChange runs after any change so the page saves.
export function initProposals(root, onChange) {
  root.addEventListener('click', (e) => {
    const btn = e.target.closest?.('.proposal-btn');
    if (!btn || !root.contains(btn)) return;
    e.preventDefault();
    const el = btn.closest('.proposal');
    if (!el) return;

    if (btn.classList.contains('proposal-approve')) {
      el.dataset.status = el.dataset.status === 'approved' ? 'proposed' : 'approved';
      renderBar(el);
      onChange?.();
    } else if (btn.classList.contains('proposal-remove')) {
      const comments = readComments(el);
      comments.splice(Number(btn.dataset.index), 1);
      if (comments.length) el.dataset.comments = JSON.stringify(comments);
      else el.removeAttribute('data-comments');
      renderBar(el);
      onChange?.();
    } else if (btn.classList.contains('proposal-comment')) {
      const bar = btn.closest('.proposal-bar');
      const open = bar.querySelector('.proposal-form input');
      if (open) { open.focus(); return; }
      const form = document.createElement('div');
      form.className = 'proposal-form';
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Comment…';
      const add = button('Add', 'proposal-add');
      const submit = () => {
        const text = input.value.trim();
        if (!text) { form.remove(); return; }
        const comments = readComments(el);
        comments.push({ text, at: new Date().toISOString() });
        el.dataset.comments = JSON.stringify(comments);
        renderBar(el);
        onChange?.();
      };
      add.addEventListener('click', (ev) => { ev.stopPropagation(); submit(); });
      input.addEventListener('keydown', (ev) => {
        ev.stopPropagation();
        if (ev.key === 'Enter') { ev.preventDefault(); submit(); }
        if (ev.key === 'Escape') form.remove();
      });
      form.append(input, add);
      bar.appendChild(form);
      input.focus();
    }
  });

  // Typing in the comment box is not an edit of the page.
  root.addEventListener('input', (e) => {
    if (e.target.closest?.('.proposal-form')) e.stopPropagation();
  }, true);
}
