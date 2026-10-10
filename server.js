import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import cors from 'cors';
import vaultRoutes from './server/routes/vault.js';
import claudeRoutes from './server/routes/claude.js';
import projectRoutes from './server/routes/projects.js';
import { initVault, ensureWatcher, getProjectRoot, DEFAULT_PROJECT_ID } from './server/lib/vaultManager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3002;
const isProd = process.env.NODE_ENV === 'production';

const app = express();
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

if (isProd) {
  app.use(express.static(join(__dirname, 'dist')));
  app.get('*', (_req, res) => res.sendFile(join(__dirname, 'dist', 'index.html')));
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
  if (!isProd) console.log(`[crowbar] Open http://localhost:5174 (Vite dev server)`);
});
