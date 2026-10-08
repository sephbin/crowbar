import { getTemplateForType } from '../templates/templateRegistry.js';

let currentMeta = {};
let onChangeCb = null;
let onSuggestTagsCb = null;
const panel = document.getElementById('meta-panel');
const fieldsContainer = document.getElementById('meta-fields');
const tagsContainer = document.getElementById('meta-tag-chips');
const tagInput = document.getElementById('meta-tag-input');
const suggestBtn = document.getElementById('btn-suggest-tags');
const suggestStatus = document.getElementById('suggest-tags-status');

export function openMetaPanel(meta, onChange, onSuggestTags) {
  currentMeta = { ...meta };
  onChangeCb = onChange;
  onSuggestTagsCb = onSuggestTags;
  renderPanel();
  panel.classList.remove('hidden');
  document.getElementById('app').classList.add('meta-open');
}

export function closeMetaPanel() {
  panel.classList.add('hidden');
  document.getElementById('app').classList.remove('meta-open');
}

export function updatePanelMeta(meta) {
  currentMeta = { ...meta };
  renderPanel();
}

function save() {
  onChangeCb?.(currentMeta);
}

function renderPanel() {
  const tmpl = getTemplateForType(currentMeta.type);

  // Type badge
  document.getElementById('meta-type-badge').textContent = tmpl ? `${tmpl.icon} ${tmpl.label}` : currentMeta.type || 'Page';

  // Fields
  fieldsContainer.innerHTML = '';
  const fields = tmpl?.metaFields ?? [{ key: 'name', label: 'Name', inputType: 'text' }];

  fields.forEach(field => {
    const row = document.createElement('div');
    row.className = 'meta-field-row';

    const label = document.createElement('label');
    label.className = 'meta-field-label';
    label.textContent = field.label;
    row.appendChild(label);

    let input;
    if (field.inputType === 'select') {
      input = document.createElement('select');
      input.className = 'meta-field-input';
      field.options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        if (currentMeta[field.key] === opt) o.selected = true;
        input.appendChild(o);
      });
      input.addEventListener('change', () => {
        currentMeta[field.key] = input.value;
        save();
      });
    } else if (field.inputType === 'checkbox') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'meta-field-checkbox';
      input.checked = !!currentMeta[field.key];
      input.addEventListener('change', () => {
        currentMeta[field.key] = input.checked;
        save();
      });
    } else {
      input = document.createElement('input');
      input.type = 'text';
      input.className = 'meta-field-input';
      input.value = currentMeta[field.key] ?? '';
      input.placeholder = field.placeholder ?? '';
      input.addEventListener('input', () => {
        currentMeta[field.key] = input.value;
        save();
      });
    }

    row.appendChild(input);
    fieldsContainer.appendChild(row);
  });

  // Connects chips (shown when this page is used as an edge in the canvas)
  renderConnects();

  // Tags
  renderTags();
}

function renderConnects() {
  const connects = currentMeta.connects;
  // Only render the section if connects is present
  if (!Array.isArray(connects) || !connects.length) return;

  const section = document.createElement('div');
  section.className = 'meta-connects-section';

  const lbl = document.createElement('div');
  lbl.className = 'meta-field-label';
  lbl.textContent = 'Connects';
  section.appendChild(lbl);

  const chips = document.createElement('div');
  chips.className = 'meta-connects-chips';

  connects.forEach((path, i) => {
    const chip = document.createElement('span');
    chip.className = 'meta-connects-chip';
    chip.textContent = path.split('/').pop().replace(/\.(html|md)$/, '');
    const rm = document.createElement('button');
    rm.className = 'meta-connects-rm';
    rm.title = 'Remove connection';
    rm.textContent = '×';
    rm.addEventListener('click', () => {
      currentMeta.connects = connects.filter((_, j) => j !== i);
      save();
      renderPanel();
    });
    chip.appendChild(rm);
    chips.appendChild(chip);
  });

  section.appendChild(chips);

  const addBtn = document.createElement('button');
  addBtn.className = 'meta-connects-add';
  addBtn.textContent = '+ Add connection';
  addBtn.addEventListener('click', () => {
    const path = prompt('Page path to connect:');
    if (path?.trim()) {
      currentMeta.connects = [...(currentMeta.connects ?? []), path.trim()];
      save();
      renderPanel();
    }
  });
  section.appendChild(addBtn);

  fieldsContainer.appendChild(section);
}

function renderTags() {
  tagsContainer.innerHTML = '';
  const tags = Array.isArray(currentMeta.tags) ? currentMeta.tags : [];

  tags.forEach(tag => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.innerHTML = `${tag} <button class="tag-remove" data-tag="${tag}">×</button>`;
    chip.querySelector('.tag-remove').addEventListener('click', () => {
      currentMeta.tags = (currentMeta.tags ?? []).filter(t => t !== tag);
      save();
      renderTags();
    });
    tagsContainer.appendChild(chip);
  });
}

function addTag(raw) {
  const tag = raw.trim().toLowerCase().replace(/\s+/g, '-');
  if (!tag) return;
  if (!Array.isArray(currentMeta.tags)) currentMeta.tags = [];
  if (!currentMeta.tags.includes(tag)) {
    currentMeta.tags = [...currentMeta.tags, tag];
    save();
    renderTags();
  }
}

if (tagInput) {
  tagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(tagInput.value);
      tagInput.value = '';
    }
    if (e.key === 'Backspace' && !tagInput.value && currentMeta.tags?.length) {
      currentMeta.tags = currentMeta.tags.slice(0, -1);
      save();
      renderTags();
    }
  });
}

document.getElementById('meta-panel-close')?.addEventListener('click', closeMetaPanel);

suggestBtn?.addEventListener('click', async () => {
  if (!onSuggestTagsCb) return;

  suggestBtn.disabled = true;
  suggestStatus.textContent = 'Asking Claude…';
  suggestStatus.classList.remove('hidden', 'error');

  try {
    const added = await onSuggestTagsCb();
    if (!added?.length) {
      suggestStatus.textContent = 'No new tags suggested.';
    } else {
      currentMeta.tags = [...(currentMeta.tags ?? []), ...added];
      save();
      renderTags();
      suggestStatus.textContent = `Added: ${added.join(', ')}`;
    }
  } catch (err) {
    suggestStatus.textContent = err.message;
    suggestStatus.classList.add('error');
  } finally {
    suggestBtn.disabled = false;
    setTimeout(() => suggestStatus.classList.add('hidden'), 4000);
  }
});
