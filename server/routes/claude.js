import { Router } from 'express';
import { streamEdit, suggestFacetTags } from '../lib/claudeClient.js';
import { getFacetRegistry } from '../lib/vaultManager.js';

const router = Router();

router.post('/edit', (req, res) => {
  const { selectedText, instruction, context } = req.body;
  if (!selectedText || !instruction) {
    return res.status(400).json({ error: 'selectedText and instruction are required' });
  }
  streamEdit({ selectedText, instruction, context, res });
});

router.post('/autotag', async (req, res) => {
  const { meta, content } = req.body;
  if (!meta || content == null) {
    return res.status(400).json({ error: 'meta and content are required' });
  }
  try {
    const registry = getFacetRegistry(req.vaultRoot);
    const existing = new Set(meta.tags ?? []);
    const suggested = await suggestFacetTags({ meta, content, registry });
    res.json({ added: suggested.filter(t => !existing.has(t)) });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

export default router;
