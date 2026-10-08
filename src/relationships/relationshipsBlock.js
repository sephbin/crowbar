import { createPage, updatePageRelationships, uid } from '../data/vaultApi.js';
import { TEMPLATES, TYPE_ICONS } from '../templates/templateRegistry.js';

function displayName(page) {
  return page.meta?.name || page.name.replace(/\.(html|md)$/, '');
}

function relRow({ direction, labelText, targetName, onLabelChange, onNavigate, onRemove }) {
  const li = document.createElement('li');
  li.className = `rel-row rel-${direction}`;

  const arrow = document.createElement('span');
  arrow.className = 'rel-arrow';
  arrow.textContent = direction === 'out' ? '→' : '←';
  li.appendChild(arrow);

  const labelEl = document.createElement('span');
  labelEl.className = 'rel-label-input';
  labelEl.contentEditable = 'true';
  labelEl.textContent = labelText || '';
  labelEl.addEventListener('blur', () => onLabelChange(labelEl.textContent.trim()));
  labelEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); labelEl.blur(); }
  });
  li.appendChild(labelEl);

  const targetBtn = document.createElement('button');
  targetBtn.type = 'button';
  targetBtn.className = 'rel-target-link';
  targetBtn.textContent = targetName;
  targetBtn.addEventListener('click', onNavigate);
  li.appendChild(targetBtn);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'rel-remove-btn';
  removeBtn.title = 'Remove relationship';
  removeBtn.textContent = '✕';
  removeBtn.addEventListener('click', onRemove);
  li.appendChild(removeBtn);

  return li;
}

function buildAddForm(meta, currentPath, allPages, onChanged) {
  const wrap = document.createElement('div');
  wrap.className = 'rel-add-form';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'rel-add-input';
  input.placeholder = 'Add relationship… type a name';
  input.autocomplete = 'off';
  wrap.appendChild(input);

  const suggestions = document.createElement('div');
  suggestions.className = 'rel-suggestions hidden';
  wrap.appendChild(suggestions);

  const labelsForm = document.createElement('div');
  labelsForm.className = 'rel-add-labels hidden';
  labelsForm.innerHTML = `
    <input class="rel-forward-label" type="text" placeholder="they are my…" autocomplete="off" />
    <span class="rel-add-sep">/</span>
    <input class="rel-reverse-label" type="text" placeholder="I am their…" autocomplete="off" />
    <button class="rel-add-confirm" type="button">Add</button>
  `;
  wrap.appendChild(labelsForm);

  const fwdInput = labelsForm.querySelector('.rel-forward-label');
  const revInput = labelsForm.querySelector('.rel-reverse-label');
  const confirmBtn = labelsForm.querySelector('.rel-add-confirm');

  let pendingTarget = null;

  function closeSuggestions() {
    suggestions.classList.add('hidden');
    suggestions.innerHTML = '';
  }

  function openLabelsForm(name) {
    closeSuggestions();
    input.value = name;
    input.disabled = true;
    labelsForm.classList.remove('hidden');
    fwdInput.focus();
  }

  function resetForm() {
    pendingTarget = null;
    input.value = '';
    input.disabled = false;
    fwdInput.value = '';
    revInput.value = '';
    labelsForm.classList.add('hidden');
    closeSuggestions();
  }

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    closeSuggestions();
    if (!q) return;
    suggestions.classList.remove('hidden');

    allPages
      .filter(p => p.path !== currentPath && p.meta?.type === 'character')
      .filter(p => displayName(p).toLowerCase().includes(q))
      .slice(0, 8)
      .forEach(p => {
        const item = document.createElement('div');
        item.className = 'rel-suggestion';
        item.textContent = `${TYPE_ICONS[p.meta?.type] ?? ''} ${displayName(p)}`.trim();
        item.addEventListener('click', () => {
          pendingTarget = { path: p.path, name: displayName(p), isNew: false };
          openLabelsForm(displayName(p));
        });
        suggestions.appendChild(item);
      });

    const typed = input.value.trim();
    const charTemplate = TEMPLATES.find(t => t.id === 'character');
    if (charTemplate) {
      const item = document.createElement('div');
      item.className = 'rel-suggestion rel-suggestion-new';
      item.textContent = `${charTemplate.icon} Create new ${charTemplate.label}: "${typed}"`;
      item.addEventListener('click', () => {
        pendingTarget = { path: null, name: typed, isNew: true, templateId: charTemplate.id };
        openLabelsForm(typed);
      });
      suggestions.appendChild(item);
    }
  });

  confirmBtn.addEventListener('click', async () => {
    if (!pendingTarget) return;
    const label = fwdInput.value.trim();
    const reverseLabel = revInput.value.trim();
    if (!label && !reverseLabel) return;

    let targetPath = pendingTarget.path;
    if (pendingTarget.isNew) {
      const created = await createPage(pendingTarget.templateId, pendingTarget.name);
      targetPath = created.path;
    }

    meta.relationships = [...(meta.relationships ?? []), { id: uid(), target: targetPath, label, reverseLabel }];
    resetForm();
    onChanged?.();
  });

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) closeSuggestions();
  });

  return wrap;
}

export function renderRelationshipsBlock(meta, currentPath, allPages, { onNavigate, onChanged }) {
  const block = document.createElement('div');
  block.className = 'rel-block';
  block.contentEditable = 'false';

  const title = document.createElement('div');
  title.className = 'rel-block-title';
  title.textContent = 'Relationships';
  block.appendChild(title);

  const list = document.createElement('ul');
  list.className = 'rel-list';
  block.appendChild(list);

  const pageByPath = new Map(allPages.map(p => [p.path, p]));
  const outbound = meta.relationships ?? [];

  outbound.forEach(rel => {
    const target = pageByPath.get(rel.target);
    const targetName = target ? displayName(target) : rel.target;
    list.appendChild(relRow({
      direction: 'out',
      labelText: rel.label,
      targetName,
      onLabelChange: (val) => {
        rel.label = val;
        onChanged?.();
      },
      onNavigate: () => onNavigate?.(rel.target),
      onRemove: () => {
        meta.relationships = outbound.filter(r => r.id !== rel.id);
        onChanged?.();
      },
    }));
  });

  allPages.filter(p => p.meta?.type === 'character').forEach(p => {
    if (p.path === currentPath) return;
    (p.meta?.relationships ?? []).forEach(rel => {
      if (rel.target !== currentPath) return;
      list.appendChild(relRow({
        direction: 'in',
        labelText: rel.reverseLabel,
        targetName: displayName(p),
        onLabelChange: (val) => {
          updatePageRelationships(p.path, rels => rels.map(r => r.id === rel.id ? { ...r, reverseLabel: val } : r))
            .then(() => onChanged?.());
        },
        onNavigate: () => onNavigate?.(p.path),
        onRemove: () => {
          updatePageRelationships(p.path, rels => rels.filter(r => r.id !== rel.id))
            .then(() => onChanged?.());
        },
      }));
    });
  });

  if (!list.children.length) {
    const empty = document.createElement('div');
    empty.className = 'rel-empty';
    empty.textContent = 'No relationships yet.';
    block.insertBefore(empty, list);
  }

  block.appendChild(buildAddForm(meta, currentPath, allPages, onChanged));

  return block;
}
