import { fetchProjects, createProject, renameProject, getProjectId, switchProject } from '../data/project.js';

export async function mountProjectSwitcher(container) {
  const projects = await fetchProjects();
  let current = getProjectId();
  if (!projects.some(p => p.id === current)) current = projects[0].id; // stale id (project removed)

  container.innerHTML = `
    <select class="project-select" title="Switch project"></select>
    <button class="project-btn" data-act="rename" title="Rename project">✎</button>
    <button class="project-btn" data-act="new" title="New project">+</button>`;

  const select = container.querySelector('select');
  select.innerHTML = projects
    .map(p => `<option value="${p.id}">${p.name.replace(/</g, '&lt;')}</option>`)
    .join('');
  select.value = current;

  select.addEventListener('change', () => switchProject(select.value));

  container.querySelector('[data-act="new"]').addEventListener('click', async () => {
    const name = prompt('New project name:')?.trim();
    if (!name) return;
    try { switchProject((await createProject(name)).id); }
    catch (err) { alert(err.message); }
  });

  container.querySelector('[data-act="rename"]').addEventListener('click', async () => {
    const existing = projects.find(p => p.id === current);
    const name = prompt('Rename project:', existing.name)?.trim();
    if (!name || name === existing.name) return;
    try { await renameProject(current, name); location.reload(); }
    catch (err) { alert(err.message); }
  });
}
