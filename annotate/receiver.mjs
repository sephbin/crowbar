#!/usr/bin/env node
// Standalone receiver for annotate.js comments, with no dependencies: use it for a project that doesn't run the crowbar server.
//   node annotate/receiver.mjs [--port 4317] [--dir ./annotations]        (ANNOTATE_KEY=secret to require a key)
// It also serves annotate.js itself at /annotate.js, so a page can load everything from one origin.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle, DEFAULT_DIR } from './store.mjs';

const arg = (name, d) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : d; };
const port = +arg('port', process.env.PORT || 4317), dir = path.resolve(arg('dir', DEFAULT_DIR));
const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'annotate.js');

http.createServer(async (req, res) => {
  if (await handle(req, res, { dir })) return;
  if (req.url.split('?')[0] === '/annotate.js') {
    res.writeHead(200, { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' });
    return res.end(fs.readFileSync(script));
  }
  res.writeHead(404).end('not found');
}).listen(port, () => console.log(`annotate receiver on http://localhost:${port}  (comments in ${dir}${process.env.ANNOTATE_KEY ? ', key required' : ''})`));
