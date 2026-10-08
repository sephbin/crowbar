import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
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
