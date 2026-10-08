import { TEMPLATES } from '../templates/templateRegistry.js';

let modal = null;
let selectedTemplate = null;
let onCreateCb = null;

function buildModal() {
  modal = document.createElement('div');
  modal.id = 'new-page-modal';
  modal.className = 'modal-overlay hidden';
  modal.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <span>New Page</span>
        <button class="modal-close-btn" id="modal-close">✕</button>
      </div>
      <div class="template-grid" id="template-grid"></div>
      <div class="modal-footer">
        <input id="modal-name-input" type="text" placeholder="Page name…" autocomplete="off" />
        <button id="modal-create-btn" disabled>Create</button>
      </div>
    </div>
  `;

  const grid = modal.querySelector('#template-grid');
  TEMPLATES.forEach(tmpl => {
    const card = document.createElement('button');
    card.className = 'template-card';
    card.dataset.id = tmpl.id;
    card.innerHTML = `
      <span class="tmpl-icon">${tmpl.icon}</span>
      <span class="tmpl-label">${tmpl.label}</span>
      <span class="tmpl-desc">${tmpl.desc}</span>
    `;
    card.addEventListener('click', () => selectTemplate(tmpl, card));
    grid.appendChild(card);
  });

  modal.querySelector('#modal-close').addEventListener('click', hide);
  modal.addEventListener('click', (e) => { if (e.target === modal) hide(); });

  const nameInput = modal.querySelector('#modal-name-input');
  const createBtn = modal.querySelector('#modal-create-btn');

  nameInput.addEventListener('input', () => {
    createBtn.disabled = !nameInput.value.trim() || !selectedTemplate;
  });

  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !createBtn.disabled) createBtn.click();
    if (e.key === 'Escape') hide();
  });

  createBtn.addEventListener('click', () => {
    if (!selectedTemplate || !nameInput.value.trim()) return;
    onCreateCb?.(selectedTemplate, nameInput.value.trim());
    hide();
  });

  document.body.appendChild(modal);
}

function selectTemplate(tmpl, cardEl) {
  selectedTemplate = tmpl;
  modal.querySelectorAll('.template-card').forEach(c => c.classList.remove('selected'));
  cardEl.classList.add('selected');
  const createBtn = modal.querySelector('#modal-create-btn');
  const nameInput = modal.querySelector('#modal-name-input');
  createBtn.disabled = !nameInput.value.trim();
  nameInput.focus();
}

export function showNewPageModal(onCreate, { initialName = '' } = {}) {
  if (!modal) buildModal();
  onCreateCb = onCreate;
  selectedTemplate = null;
  const nameInput = modal.querySelector('#modal-name-input');
  const createBtn = modal.querySelector('#modal-create-btn');
  nameInput.value = initialName;
  createBtn.disabled = true;
  modal.querySelectorAll('.template-card').forEach(c => c.classList.remove('selected'));
  modal.classList.remove('hidden');
  nameInput.focus();
  if (initialName) nameInput.select();
}

function hide() {
  modal?.classList.add('hidden');
}
