#!/usr/bin/env node
// Read and close page comments from the annotations directory (for Claude agents and for you).
//   node annotate/cli.mjs sites
//   node annotate/cli.mjs list [--site <text in the origin>] [--all] [--json]    open comments as markdown (--all adds resolved)
//   node annotate/cli.mjs resolve <id> [--note "what was changed"]
//   node annotate/cli.mjs reopen <id>
// The directory is ANNOTATE_DIR, or ./annotations next to this folder.
import path from 'node:path';
import { listSites, setStatus, DEFAULT_DIR } from './store.mjs';

const args = process.argv.slice(2), cmd = args[0];
const flag = n => args.includes(`--${n}`);
const val = n => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };
const dir = path.resolve(val('dir') || DEFAULT_DIR);

if (cmd === 'sites') {
  for (const s of listSites(dir)) {
    const all = Object.values(s.comments).filter(c => !c.deleted);
    console.log(`${s.site}  ${all.filter(c => c.status === 'open').length} open, ${all.filter(c => c.status === 'resolved').length} resolved`);
  }
} else if (cmd === 'list') {
  const site = val('site'), out = [];
  for (const s of listSites(dir)) {
    if (site && !s.site.includes(site)) continue;
    for (const c of Object.values(s.comments)) if (!c.deleted && (flag('all') || c.status === 'open')) out.push(c);
  }
  out.sort((a, b) => (a.page.url + a.createdAt).localeCompare(b.page.url + b.createdAt));
  if (flag('json')) console.log(JSON.stringify(out, null, 2));
  else if (!out.length) console.log('No open comments.');
  else {
    const md = s => String(s).replace(/\n/g, ' ');
    console.log(`# Page comments: ${out.length}\n`);
    let page = null;
    for (const c of out) {
      if (c.page.url !== page) { page = c.page.url; console.log(`## ${c.page.title || c.page.path}\n${page}${c.page.project ? `  (${c.page.project})` : ''}\n`); }
      const t = c.target;
      console.log(`### ${c.id} [${c.type}]${c.status === 'resolved' ? ' (resolved)' : ''} ${md(c.text)}`);
      console.log(`- Element: \`${t.tag}\`${t.label ? ` aria-label "${md(t.label)}"` : ''}${t.text ? `, text "${md(t.text.slice(0, 100))}"` : ''}`);
      console.log(`- Selector: \`${t.selector}\``);
      if (t.quote) console.log(`- Selected text: "${md(t.quote)}"`);
      console.log(`- HTML: \`${md(t.html)}\``);
      console.log(`- Viewport ${c.env?.viewport?.w}×${c.env?.viewport?.h}${c.author ? `, from ${c.author}` : ''}, ${c.createdAt.slice(0, 16).replace('T', ' ')}`);
      if (c.resolution) console.log(`- Resolution: ${md(c.resolution)}`);
      console.log('');
    }
  }
} else if (cmd === 'resolve' || cmd === 'reopen') {
  const id = args[1];
  if (!id) { console.error(`usage: cli.mjs ${cmd} <id>${cmd === 'resolve' ? ' [--note "..."]' : ''}`); process.exit(2); }
  const c = setStatus(dir, id, cmd === 'resolve' ? 'resolved' : 'open', cmd === 'resolve' ? (val('note') || '') : '');
  if (!c) { console.error(`no comment ${id}`); process.exit(1); }
  console.log(`${id} ${c.status}`);
} else {
  console.error('commands: sites | list [--site s] [--all] [--json] | resolve <id> [--note n] | reopen <id>');
  process.exit(2);
}
