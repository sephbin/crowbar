const BUTTONS = [
  { label: 'B', title: 'Bold (Ctrl+B)', cmd: 'bold', class: 'fmt-bold' },
  { label: 'I', title: 'Italic (Ctrl+I)', cmd: 'italic', class: 'fmt-italic' },
  { label: 'U', title: 'Underline (Ctrl+U)', cmd: 'underline', class: 'fmt-underline' },
  { type: 'sep' },
  { label: 'H1', title: 'Heading 1', cmd: 'formatBlock', val: 'h1' },
  { label: 'H2', title: 'Heading 2', cmd: 'formatBlock', val: 'h2' },
  { label: 'H3', title: 'Heading 3', cmd: 'formatBlock', val: 'h3' },
  { label: 'P', title: 'Paragraph', cmd: 'formatBlock', val: 'p' },
  { type: 'sep' },
  { label: '≡', title: 'Bullet list', cmd: 'insertUnorderedList' },
  { label: '1.', title: 'Numbered list', cmd: 'insertOrderedList' },
  { label: '─', title: 'Horizontal rule', cmd: 'insertHorizontalRule' },
  { label: '❝', title: 'Blockquote', cmd: 'formatBlock', val: 'blockquote' },
  { type: 'sep' },
  { label: '↺', title: 'Undo (Ctrl+Z)', cmd: 'undo' },
  { label: '↻', title: 'Redo (Ctrl+Y)', cmd: 'redo' },
];

function execFormat(cmd, val) {
  document.execCommand(cmd, false, val ?? null);
}

export function mountToolbar(toolbarEl, editorEl) {
  BUTTONS.forEach((btn) => {
    if (btn.type === 'sep') {
      const sep = document.createElement('span');
      sep.className = 'toolbar-sep';
      toolbarEl.appendChild(sep);
      return;
    }

    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = btn.label;
    el.title = btn.title ?? '';
    if (btn.class) el.classList.add(btn.class);
    el.className = (el.className + ' toolbar-btn').trim();

    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      execFormat(btn.cmd, btn.val);
    });

    toolbarEl.appendChild(el);
  });
}
