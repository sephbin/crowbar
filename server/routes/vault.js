import { Router } from 'express';
import { getTree, readFile, writeRaw, deleteFile } from '../lib/vaultManager.js';

// req.vaultRoot is set per request by the project middleware in server.js.
const router = Router();

router.get('/tree', async (req, res) => {
  try { res.json(await getTree(req.vaultRoot)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/file', (req, res) => {
  const { path } = req.query;
  if (!path) return res.status(400).json({ error: 'path required' });
  try { res.json({ content: readFile(req.vaultRoot, path) }); }
  catch (err) { res.status(404).json({ error: err.message }); }
});

// PUT /api/vault/file — save just the HTML content (meta managed client-side)
router.put('/file', (req, res) => {
  const { path, content } = req.body;
  if (!path) return res.status(400).json({ error: 'path required' });
  try { writeRaw(req.vaultRoot, path, content ?? ''); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/vault/raw — save a complete raw file (meta + content serialized client-side)
router.put('/raw', (req, res) => {
  const { path, raw } = req.body;
  if (!path) return res.status(400).json({ error: 'path required' });
  try { writeRaw(req.vaultRoot, path, raw ?? ''); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/file', (req, res) => {
  const { path } = req.query;
  if (!path) return res.status(400).json({ error: 'path required' });
  try { deleteFile(req.vaultRoot, path); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
