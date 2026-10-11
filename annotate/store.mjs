// File store and HTTP handler for page comments, shared by receiver.mjs (standalone) and the crowbar server.
// One JSON file per site (origin) in the annotations directory: { site, comments: { <id>: comment } }.
// Newer `updatedAt` wins, so a phone and a desktop merge; a delete is a tombstone ({ deleted: true }) until it is read back.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DIR = process.env.ANNOTATE_DIR || path.join(HERE, '..', 'annotations');

const slug = site => String(site).replace(/^[a-z]+:\/\//i, '').replace(/[^a-z0-9.-]+/gi, '_').slice(0, 120) || 'site';
const fileOf = (dir, site) => path.join(dir, `${slug(site)}.json`);

export function readSite(dir, site) {
  try { return JSON.parse(fs.readFileSync(fileOf(dir, site), 'utf8')); } catch { return { site, comments: {} }; }
}
export function listSites(dir) {
  try { return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))); } catch { return []; }
}
export function upsert(dir, comment) {
  const site = comment.page?.origin;
  if (!site) throw new Error('comment has no page.origin');
  const data = readSite(dir, site);
  data.site = site;
  const old = data.comments[comment.id];
  if (!old || old.updatedAt < comment.updatedAt) data.comments[comment.id] = comment;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fileOf(dir, site), JSON.stringify(data, null, 1));
  return data.comments[comment.id];
}
// the same comment from the receiver's side: resolve or reopen with a note (used by cli.mjs)
export function setStatus(dir, id, status, resolution) {
  for (const data of listSites(dir)) {
    const c = data.comments[id];
    if (c) return upsert(dir, { ...c, status, ...(resolution != null ? { resolution } : {}), updatedAt: new Date().toISOString() });
  }
  return null;
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const readBody = req => new Promise((resolve, reject) => {
  if (req.body !== undefined) return resolve(req.body);   // express already parsed it
  let n = 0; const chunks = [];
  req.on('data', c => { n += c.length; if (n > 1_000_000) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); } });
  req.on('error', reject);
});

// handle(req, res, { dir, key, base }): base is the URL prefix (e.g. /api/annotations). Returns false for a URL that isn't ours.
export async function handle(req, res, { dir = DEFAULT_DIR, key = process.env.ANNOTATE_KEY || '', base = '/api/annotations' } = {}) {
  const url = new URL(req.url, 'http://x');
  const full = (req.originalUrl ? new URL(req.originalUrl, 'http://x') : url).pathname;
  if (!full.startsWith(base)) return false;
  const rest = full.slice(base.length).replace(/^\/|\/$/g, '');
  const send = (code, body) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)); };
  // pages on https (or any other origin) calling a receiver on localhost or the LAN
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-annotate-key');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return true; }
  if (rest === 'ping') { send(200, { ok: true, auth: !!key }); return true; }
  if (key && req.headers['x-annotate-key'] !== key) { send(401, { error: 'bad key' }); return true; }
  try {
    if (req.method === 'GET' && rest === '') {
      const site = url.searchParams.get('site'), withDeleted = url.searchParams.get('deleted') === '1';
      const sites = site ? [readSite(dir, site)] : listSites(dir);
      const comments = sites.flatMap(s => Object.values(s.comments)).filter(c => withDeleted || !c.deleted);
      send(200, { comments });
      return true;
    }
    if (req.method === 'PUT' && ID.test(rest)) {
      const c = await readBody(req);
      if (!c || c.id !== rest || typeof c.text !== 'string' || typeof c.updatedAt !== 'string' || typeof c.page?.origin !== 'string') { send(400, { error: 'expected a comment with id, text, updatedAt and page.origin' }); return true; }
      send(200, upsert(dir, c));
      return true;
    }
    send(404, { error: 'not found' });
  } catch (e) { send(400, { error: String(e.message || e) }); }
  return true;
}
