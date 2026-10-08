import { mountToolbar } from './toolbar.js';
import { initClaudeWidget } from './claudeWidget.js';
import { initPageLinks } from './pageLinks.js';

let editorEl = null;
let onSaveCb = null;
let saveTimer = null;

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    onSaveCb?.(editorEl.innerHTML);
  }, 800);
}

export function createEditor(container, { onSave, links }) {
  onSaveCb = onSave;

  // Toolbar
  const toolbarEl = document.createElement('div');
  toolbarEl.id = 'format-toolbar';
  container.appendChild(toolbarEl);

  // Editable area
  editorEl = document.createElement('div');
  editorEl.id = 'html-editor';
  editorEl.contentEditable = 'true';
  editorEl.spellcheck = true;
  container.appendChild(editorEl);

  editorEl.addEventListener('input', scheduleSave);

  // Prevent default tab behaviour — insert spaces instead
  editorEl.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;');
    }
  });

  mountToolbar(toolbarEl, editorEl);
  initClaudeWidget(editorEl);
  if (links) initPageLinks(editorEl, links);

  return {
    setContent(html) {
      editorEl.innerHTML = html || '';
      editorEl.scrollTop = 0;
    },
    // Strip template blocks before returning — always re-rendered from meta
    getContent() {
      const clone = editorEl.cloneNode(true);
      clone.querySelectorAll('.char-card, .page-block, .rel-block, .connections-block').forEach(c => c.remove());
      return clone.innerHTML;
    },
    // Insert a rendered card/block at the top of the editor; removes any existing one first
    setCard(cardHTML) {
      editorEl.querySelectorAll('.char-card, .page-block').forEach(c => c.remove());
      if (!cardHTML) return null;
      const tmp = document.createElement('div');
      tmp.innerHTML = cardHTML;
      const card = tmp.firstElementChild;
      editorEl.insertBefore(card, editorEl.firstChild);
      return card;
    },
    // Insert the relationships block right after the template block, or at the top if none
    setRelationshipsBlock(el) {
      editorEl.querySelectorAll('.rel-block').forEach(b => b.remove());
      if (!el) return;
      const anchor = editorEl.querySelector('.char-card, .page-block');
      if (anchor) anchor.insertAdjacentElement('afterend', el);
      else editorEl.insertBefore(el, editorEl.firstChild);
    },
    // Insert the connections block after the relationships block (or after template card)
    setConnectionsBlock(el) {
      editorEl.querySelectorAll('.connections-block').forEach(b => b.remove());
      if (!el) return;
      const anchor = editorEl.querySelector('.rel-block') ?? editorEl.querySelector('.char-card, .page-block');
      if (anchor) anchor.insertAdjacentElement('afterend', el);
      else editorEl.insertBefore(el, editorEl.firstChild);
    },
    focus() {
      editorEl.focus();
    },
  };
}
