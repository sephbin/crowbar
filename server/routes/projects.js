import { Router } from 'express';
import { listProjects, createProject, renameProject } from '../lib/vaultManager.js';

const router = Router();

router.get('/', (_req, res) => res.json(listProjects()));

router.post('/', (req, res) => {
  const name = req.body?.name?.trim();
  if (!name) return res.status(400).json({ error: 'name required' });
  try { res.json(createProject(name, req.body.path?.trim() || null)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

router.patch('/:id', (req, res) => {
  const name = req.body?.name?.trim();
  if (!name) return res.status(400).json({ error: 'name required' });
  try { res.json(renameProject(req.params.id, name)); }
  catch (err) { res.status(404).json({ error: err.message }); }
});

export default router;
