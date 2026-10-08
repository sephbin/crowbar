import { getTemplateForType } from '../templates/templateRegistry.js';

export function renderConnectionsBlock(currentPath, allPages, { onNavigate }) {
  const edgePages = allPages.filter(p =>
    Array.isArray(p.meta?.connects) && p.meta.connects.includes(currentPath)
  );

  const block = document.createElement('div');
  block.className = 'connections-block';

  const title = document.createElement('div');
  title.className = 'rel-block-title';
  title.textContent = 'Connections';
  block.appendChild(title);

  if (!edgePages.length) {
    const empty = document.createElement('div');
    empty.className = 'rel-empty';
    empty.textContent = 'No pages connected to this one yet.';
    block.appendChild(empty);
    return block;
  }

  const list = document.createElement('div');
  list.className = 'rel-list';

  for (const page of edgePages) {
    const tmpl = getTemplateForType(page.meta?.type);
    const others = (page.meta.connects ?? []).filter(p => p !== currentPath);
    const otherNames = others.map(p => {
      const found = allPages.find(pg => pg.path === p);
      return found?.meta?.name || p.split('/').pop().replace(/\.(html|md)$/, '');
    });

    const row = document.createElement('div');
    row.className = 'rel-row connections-row';

    const icon = document.createElement('span');
    icon.className = 'rel-arrow';
    icon.textContent = tmpl?.icon ?? '🔗';
    row.appendChild(icon);

    const link = document.createElement('button');
    link.className = 'rel-target-link';
    link.textContent = page.meta?.name || page.path;
    link.addEventListener('click', () => onNavigate(page.path));
    row.appendChild(link);

    if (otherNames.length) {
      const via = document.createElement('span');
      via.className = 'connections-via';
      via.textContent = `→ ${otherNames.join(', ')}`;
      row.appendChild(via);
    }

    list.appendChild(row);
  }

  block.appendChild(list);
  return block;
}
