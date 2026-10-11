import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, statSync, readdirSync, mkdirSync, unlinkSync } from 'fs';
import cors from 'cors';
import vaultRoutes from './server/routes/vault.js';
import claudeRoutes from './server/routes/claude.js';
import projectRoutes from './server/routes/projects.js';
import { handle as annotations } from './annotate/store.mjs';
import { initVault, ensureWatcher, getProjectRoot, DEFAULT_PROJECT_ID } from './server/lib/vaultManager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3002;
const isProd = process.env.NODE_ENV === 'production';

const app = express();
// Page comments from annotate/annotate.js (any page, any origin). First, so its preflight answer (it adds the
// private-network header that browsers want from public pages calling localhost) wins over cors() below.
app.use('/api/annotations', (req, res, next) => annotations(req, res).then(done => { if (!done) next(); }, next));
app.use('/annotate', express.static(join(__dirname, 'annotate'), { setHeaders: res => res.set('Access-Control-Allow-Origin', '*') }));
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api/projects', projectRoutes);

// Everything else is scoped to one project, chosen by the client via header.
// No header means the default project (the pre-projects vault).
const projectScope = (req, res, next) => {
  const id = req.get('x-crowbar-project') || DEFAULT_PROJECT_ID;
  const root = getProjectRoot(id);
  if (!root) return res.status(404).json({ error: `Unknown project: ${id}` });
  req.vaultRoot = root;
  ensureWatcher(id, root, broadcast);
  next();
};

app.use('/api/vault', projectScope, vaultRoutes);
app.use('/api/claude', projectScope, claudeRoutes);

// Static prep pages (Ultima Thule sheets, GM screen, Bell Curve builder, local review pages under the gitignored
// bellcurve/rules/), e.g. /pages/bellcurve/rules/review.html. Vite proxies /pages in dev.
app.use('/pages', express.static(join(__dirname, 'ultima-thule')));

// Book-text review marks from rules/review.html, kept in the gitignored rules/ folder so Claude can read them.
// Entries are { v, note, at } (a removed mark is { at, del: true }); the newer `at` wins, so phone and desktop merge.
const MARKS = join(__dirname, 'ultima-thule', 'bellcurve', 'rules', 'review-marks.json');
const readMarks = () => { try { return JSON.parse(readFileSync(MARKS, 'utf8')); } catch { return {}; } };
app.get('/api/review-marks', (_req, res) => res.json(readMarks()));
app.put('/api/review-marks', (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return res.status(400).json({ error: 'expected an object' });
  const marks = readMarks();
  for (const [id, m] of Object.entries(req.body)) {
    if (m && typeof m.at === 'string' && (!marks[id] || marks[id].at < m.at)) marks[id] = m;
  }
  writeFileSync(MARKS, JSON.stringify(marks, null, 1));
  res.json(marks);
});

// Bell Curve characters saved from the builder's "save to server" button: ultima-thule/bellcurve/saved/<id>.json
// (gitignored: they are the player's own sheets). The id is a slug of the character's name.
const SAVED = join(__dirname, 'ultima-thule', 'bellcurve', 'saved');
const savedId = s => (/^[a-z0-9][a-z0-9-]{0,79}$/.test(String(s)) ? String(s) : null);
app.get('/api/bellcurve/characters', (_req, res) => {
  let files = [];
  try { files = readdirSync(SAVED).filter(f => f.endsWith('.json')); } catch { /* none saved yet */ }
  const list = files.map(f => {
    const p = join(SAVED, f);
    let name = f.replace(/\.json$/, ''), concept = '';
    try { const c = JSON.parse(readFileSync(p, 'utf8')); name = c.name || name; concept = c.concept || ''; } catch { /* unreadable file: listed by file name */ }
    return { id: f.replace(/\.json$/, ''), name, concept, updated: statSync(p).mtime.toISOString() };
  }).sort((a, b) => b.updated.localeCompare(a.updated));
  res.json(list);
});
app.get('/api/bellcurve/characters/:id', (req, res) => {
  const id = savedId(req.params.id); if (!id) return res.status(400).json({ error: 'bad id' });
  try { res.type('json').send(readFileSync(join(SAVED, id + '.json'), 'utf8')); } catch { res.status(404).json({ error: 'not found' }); }
});
app.put('/api/bellcurve/characters/:id', (req, res) => {
  const id = savedId(req.params.id); if (!id) return res.status(400).json({ error: 'bad id' });
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || req.body.format !== 'bellcurve-character') return res.status(400).json({ error: 'expected a bellcurve-character' });
  mkdirSync(SAVED, { recursive: true });
  writeFileSync(join(SAVED, id + '.json'), JSON.stringify(req.body, null, 2));
  res.json({ id, saved: new Date().toISOString() });
});
app.delete('/api/bellcurve/characters/:id', (req, res) => {
  const id = savedId(req.params.id); if (!id) return res.status(400).json({ error: 'bad id' });
  try { unlinkSync(join(SAVED, id + '.json')); res.json({ id, deleted: true }); } catch { res.status(404).json({ error: 'not found' }); }
});

// Book text for the Bell Curve builder's rules tab: rules/library-with-text.json (gitignored, this machine only),
// indexed once and again whenever the file changes. GET /api/booktext?kind=skill|spell|trait|modifier|equipment&name=&spec=&ref=
// (spec is a skill's specialization or a modifier's notes). 404 when the file or the entry is missing.
const BOOKTEXT = join(__dirname, 'ultima-thule', 'bellcurve', 'rules', 'library-with-text.json');
let bookIx = null, bookStamp = 0;
function bookIndex() {
  const st = statSync(BOOKTEXT, { throwIfNoEntry: false });
  if (!st) return null;
  if (bookIx && st.mtimeMs === bookStamp) return bookIx;
  const L = JSON.parse(readFileSync(BOOKTEXT, 'utf8')), ix = new Map();
  const add = (kind, r, spec) => {
    for (const k of [`${kind}|${r.name}|${spec}|${r.ref || ''}`, `${kind}|${r.name}|${spec}|`, `${kind}|${r.name}||`].map(s => s.toLowerCase()))
      if (!ix.has(k)) ix.set(k, r);
  };
  for (const r of L.skills) add('skill', r, r.spec || '');
  for (const r of L.spells) add('spell', r, '');
  for (const r of L.traits) add('trait', r, '');
  for (const r of L.modifiers || []) add('modifier', r, r.notes || '');
  for (const r of L.equipment || []) add('equipment', r, '');
  bookIx = ix; bookStamp = st.mtimeMs;
  return ix;
}
app.get('/api/booktext', (req, res) => {
  const ix = bookIndex();
  if (!ix) return res.status(404).json({ error: 'no book text on this machine' });
  const { kind = '', name = '', spec = '', ref = '' } = req.query;
  const r = [`${kind}|${name}|${spec}|${ref}`, `${kind}|${name}|${spec}|`, `${kind}|${name}||`].map(k => ix.get(k.toLowerCase())).find(Boolean);
  if (!r) return res.status(404).json({ error: 'not found' });
  const pick = x => ({ text: x.text || null, textRef: x.textRef || null, how: x.how || '' });
  res.json({
    name: r.name, ref: r.ref || '', ...pick(r), categories: r.categories || [], rollMods: r.rollMods || [],
    supplements: (r.supplements || []).map(s => ({ book: s.book, ...pick(s) })),
    mods: (r.mods || []).filter(m => m.text).map(m => ({ name: m.name, adj: m.adj, group: m.group || '', ...pick(m) })),
  });
});

// Home page linking the vault editor and the prep pages. Vite proxies exactly "/" here in dev.
app.get('/', (_req, res) => res.sendFile(join(__dirname, 'home', 'index.html')));

// The vault editor lives under /vault (Vite builds it with base /vault/).
if (isProd) {
  app.use('/vault', express.static(join(__dirname, 'dist')));
  app.get('/vault/*', (_req, res) => res.sendFile(join(__dirname, 'dist', 'index.html')));
}

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

wss.on('connection', (ws) => {
  ws.on('error', console.error);
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(msg);
  });
}

initVault();

httpServer.listen(PORT, () => {
  console.log(`[crowbar] API server listening on http://localhost:${PORT}`);
  if (!isProd) console.log(`[crowbar] Open http://localhost:5174 (Vite dev server; the vault editor is at /vault/)`);
});
