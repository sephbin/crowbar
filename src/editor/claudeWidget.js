import { apiFetch } from '../data/project.js';
// Claude AI floating toolbar — works with native contenteditable selection
const toolbar = document.getElementById('claude-toolbar');
const input = document.getElementById('claude-input');
const submitBtn = document.getElementById('claude-submit');
const closeBtn = document.getElementById('claude-close');
const preview = document.getElementById('claude-selection-preview');
const status = document.getElementById('claude-status');
const modeAsk = document.getElementById('claude-mode-ask');
const modeNote = document.getElementById('claude-mode-note');

// 'ask'  - Claude CLI rewrites the selection now.
// 'note' - the selection is highlighted and a comment saved in the page for Claude to read in a later session.
let mode = 'ask';
try { if (localStorage.getItem('claude-widget-mode') === 'note') mode = 'note'; } catch {}

let savedRange = null;
let showTimer = null;
let streaming = false;

function showToolbar(range) {
  savedRange = range.cloneRange();
  const text = range.toString();
  preview.textContent = text.length > 80 ? text.slice(0, 80) + '…' : text;
  status.classList.add('hidden');
  status.textContent = '';

  const rect = range.getBoundingClientRect();
  toolbar.classList.remove('hidden');
  const tbRect = toolbar.getBoundingClientRect();

  let top = rect.top + window.scrollY - tbRect.height - 10;
  let left = rect.left + window.scrollX + rect.width / 2 - 210;
  if (left + 420 > window.innerWidth) left = window.innerWidth - 430;
  if (left < 8) left = 8;
  if (top < 8) top = rect.bottom + window.scrollY + 10;

  toolbar.style.top = `${top}px`;
  toolbar.style.left = `${left}px`;
}

function setMode(next) {
  mode = next;
  try { localStorage.setItem('claude-widget-mode', mode); } catch {}
  modeAsk.classList.toggle('active', mode === 'ask');
  modeNote.classList.toggle('active', mode === 'note');
  submitBtn.textContent = mode === 'ask' ? 'Ask' : 'Save note';
  input.placeholder = mode === 'ask'
    ? 'Instruct Claude… (e.g. make more intimidating)'
    : 'Note for Claude… (read in your next session)';
}

// Wraps every text node in the range in <mark class="claude-note">, so a note can span paragraphs.
function wrapRangeInNotes(range, note) {
  const container = range.commonAncestorContainer;
  const root = container.nodeType === 1 ? container : container.parentElement;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (range.intersectsNode(n) && n.nodeValue.trim()) nodes.push(n);
  }
  const group = Math.random().toString(36).slice(2, 8);
  const at = new Date().toISOString();
  let count = 0;
  nodes.forEach(n => {
    const start = n === range.startContainer ? range.startOffset : 0;
    const end = n === range.endContainer ? range.endOffset : n.nodeValue.length;
    if (end <= start) return;
    let target = n;
    if (end < n.nodeValue.length) n.splitText(end);
    if (start > 0) target = n.splitText(start);
    const mark = document.createElement('mark');
    mark.className = 'claude-note';
    mark.dataset.note = note;
    mark.dataset.status = 'open';
    mark.dataset.group = group;
    mark.dataset.at = at;
    target.replaceWith(mark);
    mark.appendChild(target);
    count++;
  });
  return count;
}

function submitNote() {
  const note = input.value.trim();
  if (!savedRange || !note) return;
  const count = wrapRangeInNotes(savedRange, note);
  window.getSelection().removeAllRanges();
  if (count) document.getElementById('html-editor')?.dispatchEvent(new Event('input', { bubbles: true }));
  hideToolbar();
}

function hideToolbar() {
  toolbar.classList.add('hidden');
  input.value = '';
  status.classList.add('hidden');
  savedRange = null;
}

async function submitEdit() {
  if (mode === 'note') { submitNote(); return; }
  if (!savedRange || streaming) return;
  const instruction = input.value.trim();
  if (!instruction) return;

  const selectedText = savedRange.toString();
  if (!selectedText) return;

  // Gather context: text before/after the selection in the editor
  const editorEl = document.getElementById('html-editor');
  const fullText = editorEl.innerText;
  const selStart = fullText.indexOf(selectedText);
  const ctxBefore = selStart > 0 ? fullText.slice(Math.max(0, selStart - 500), selStart) : '';
  const ctxAfter = fullText.slice(selStart + selectedText.length, selStart + selectedText.length + 500);
  const context = ctxBefore + ctxAfter;

  streaming = true;
  submitBtn.disabled = true;
  status.textContent = 'Claude is writing…';
  status.classList.remove('hidden');

  // Delete selected content; we'll stream the replacement in
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(savedRange);
  savedRange.deleteContents();

  // Insert a placeholder span we can write into
  const span = document.createElement('span');
  span.id = 'claude-stream-target';
  savedRange.insertNode(span);

  let accumulated = '';

  try {
    const res = await apiFetch('/api/claude/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedText, instruction, context }),
    });

    if (!res.ok) {
      const err = await res.json();
      status.textContent = `Error: ${err.error}`;
      span.replaceWith(document.createTextNode(selectedText)); // restore on error
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') break;
        try {
          const { text, error } = JSON.parse(payload);
          if (error) {
            status.textContent = `Error: ${error}`;
            break;
          }
          if (text) {
            accumulated += text;
            // Update span text content as Claude streams
            const target = document.getElementById('claude-stream-target');
            if (target) target.textContent = accumulated;
          }
        } catch {}
      }
    }

    // Unwrap the span — replace with a plain text node
    const target = document.getElementById('claude-stream-target');
    if (target) target.replaceWith(document.createTextNode(accumulated));

    // Trigger save
    document.getElementById('html-editor')?.dispatchEvent(new Event('input'));

    status.textContent = 'Done';
    setTimeout(hideToolbar, 800);
  } catch (err) {
    status.textContent = `Error: ${err.message}`;
    const target = document.getElementById('claude-stream-target');
    if (target) target.replaceWith(document.createTextNode(selectedText));
  } finally {
    streaming = false;
    submitBtn.disabled = false;
  }
}

modeAsk.addEventListener('click', () => setMode('ask'));
modeNote.addEventListener('click', () => setMode('note'));
setMode(mode);

submitBtn.addEventListener('click', submitEdit);
input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitEdit(); });
closeBtn.addEventListener('click', hideToolbar);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideToolbar(); });

export function initClaudeWidget(_editorEl) {
  document.addEventListener('selectionchange', () => {
    clearTimeout(showTimer);
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      // Don't hide if focus is inside the toolbar (user clicked in to type)
      if (!toolbar.classList.contains('hidden') && !streaming && !toolbar.contains(document.activeElement)) hideToolbar();
      return;
    }

    // Only trigger inside the editor
    const anchor = sel.anchorNode;
    const editor = document.getElementById('html-editor');
    if (!editor || !editor.contains(anchor)) return;

    showTimer = setTimeout(() => {
      const range = sel.getRangeAt(0);
      showToolbar(range);
    }, 250);
  });
}

// ── Existing notes: click a highlighted passage to read, edit or delete the note ──
let popover = null;

function closePopover() { popover?.remove(); popover = null; }

function groupMarks(mark) {
  const editor = document.getElementById('html-editor');
  const g = mark.dataset.group;
  return g ? [...editor.querySelectorAll('mark.claude-note')].filter(m => m.dataset.group === g) : [mark];
}

function openNotePopover(mark) {
  closePopover();
  const marks = groupMarks(mark);
  const changed = () => document.getElementById('html-editor')?.dispatchEvent(new Event('input', { bubbles: true }));

  popover = document.createElement('div');
  popover.className = 'claude-note-popover';

  const head = document.createElement('div');
  head.className = 'cnp-status';
  head.textContent = mark.dataset.status === 'done' ? 'Answered by Claude' : 'Waiting for Claude';
  popover.appendChild(head);

  const field = document.createElement('textarea');
  field.className = 'cnp-text';
  field.value = mark.dataset.note || '';
  field.rows = 3;
  popover.appendChild(field);

  if (mark.dataset.reply) {
    const reply = document.createElement('div');
    reply.className = 'cnp-reply';
    reply.textContent = mark.dataset.reply;
    popover.appendChild(reply);
  }

  const row = document.createElement('div');
  row.className = 'cnp-row';
  const add = (label, fn) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', fn);
    row.appendChild(b);
  };
  add('Save', () => {
    marks.forEach(m => { m.dataset.note = field.value.trim(); m.dataset.status = 'open'; });
    changed(); closePopover();
  });
  add('Delete', () => {
    marks.forEach(m => m.replaceWith(...m.childNodes));
    changed(); closePopover();
  });
  add('Close', closePopover);
  popover.appendChild(row);

  document.body.appendChild(popover);
  const rect = mark.getBoundingClientRect();
  const width = Math.min(320, window.innerWidth - 16);
  popover.style.width = `${width}px`;
  popover.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
  const below = rect.bottom + 8 + popover.offsetHeight < window.innerHeight;
  popover.style.top = `${below ? rect.bottom + 8 : Math.max(8, rect.top - popover.offsetHeight - 8)}px`;
}

document.addEventListener('click', (e) => {
  const mark = e.target.closest?.('mark.claude-note');
  if (mark && document.getElementById('html-editor')?.contains(mark)) {
    openNotePopover(mark);
  } else if (popover && !popover.contains(e.target)) {
    closePopover();
  }
});
