import { mountToolbar } from './toolbar.js';
import { initClaudeWidget } from './claudeWidget.js';
import { initPageLinks } from './pageLinks.js';
import { initProposals, refreshProposals, stripProposalBars, toggleProposal } from './proposals.js';

let editorEl = null;
let onSaveCb = null;
let saveTimer = null;

// The page body without the blocks that are re-rendered from meta (and without proposal bars).
function currentContent() {
  const clone = editorEl.cloneNode(true);
  stripProposalBars(clone);
  clone.querySelectorAll('.block-stack, .char-card, .page-block, .rel-block, .connections-block').forEach(c => c.remove());
  return clone.innerHTML;
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    onSaveCb?.(currentContent());
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

  editorEl.addEventListener('input', () => { refreshProposals(editorEl); scheduleSave(); });
  initProposals(editorEl, () => editorEl.dispatchEvent(new Event('input', { bubbles: true })));

  // Prevent default tab behaviour — insert spaces instead
  editorEl.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;');
    }
  });

  mountToolbar(toolbarEl, editorEl, { propose: () => toggleProposal(editorEl) });
  initClaudeWidget(editorEl);
  if (links) initPageLinks(editorEl, links);

  return {
    setContent(html) {
      editorEl.innerHTML = html || '';
      refreshProposals(editorEl);
      editorEl.scrollTop = 0;
    },
    // Strip template blocks before returning — always re-rendered from meta
    getContent() {
      return currentContent();
    },
    // Insert a rendered card/block at the top of the editor; removes any existing one first
    setCard(cardHTML) {
      editorEl.querySelectorAll('.block-stack, .char-card, .page-block').forEach(c => c.remove());
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
      const anchor = editorEl.querySelector('.block-stack, .char-card, .page-block');
      if (anchor) anchor.insertAdjacentElement('afterend', el);
      else editorEl.insertBefore(el, editorEl.firstChild);
    },
    // Insert the connections block after the relationships block (or after template card)
    setConnectionsBlock(el) {
      editorEl.querySelectorAll('.connections-block').forEach(b => b.remove());
      if (!el) return;
      const anchor = editorEl.querySelector('.rel-block') ?? editorEl.querySelector('.block-stack, .char-card, .page-block');
      if (anchor) anchor.insertAdjacentElement('afterend', el);
      else editorEl.insertBefore(el, editorEl.firstChild);
    },
    focus() {
      editorEl.focus();
    },
  };
}
