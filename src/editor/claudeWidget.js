import { apiFetch } from '../data/project.js';
// Claude AI floating toolbar — works with native contenteditable selection
const toolbar = document.getElementById('claude-toolbar');
const input = document.getElementById('claude-input');
const submitBtn = document.getElementById('claude-submit');
const closeBtn = document.getElementById('claude-close');
const preview = document.getElementById('claude-selection-preview');
const status = document.getElementById('claude-status');

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

function hideToolbar() {
  toolbar.classList.add('hidden');
  input.value = '';
  status.classList.add('hidden');
  savedRange = null;
}

async function submitEdit() {
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
