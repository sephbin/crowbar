/* Stonetop character sheets: paper-style playbook pages in the browser.
   The playbook text is not in this repo: it comes from a pack file (stonetop-pack.json, built by tools/extract_playbooks.py)
   that each player loads once; it is kept in this browser's localStorage. Characters are kept there too, and can be
   exported to / imported from a file. */
(() => {
'use strict';

const PACK_KEY = 'stonetop.pack', CHARS_KEY = 'stonetop.chars';
const STATS = [['str', 'Strength', 'STR'], ['dex', 'Dexterity', 'DEX'], ['int', 'Intelligence', 'INT'],
               ['wis', 'Wisdom', 'WIS'], ['con', 'Constitution', 'CON'], ['cha', 'Charisma', 'CHA']];
const DEBS = [['weakened', ['str', 'dex']], ['dazed', ['int', 'wis']], ['miserable', ['con', 'cha']]];
const app = document.getElementById('app');
const roll = document.getElementById('roll');

// ---------- storage (falls back to memory when the browser refuses) ----------
const mem = {};
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return mem[k] ?? null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { mem[k] = v; } },
};
let pack = null, chars = {};
try { pack = JSON.parse(store.get(PACK_KEY) || 'null'); } catch { pack = null; }
try { chars = JSON.parse(store.get(CHARS_KEY) || '{}') || {}; } catch { chars = {}; }
let saveTimer = 0;
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => store.set(CHARS_KEY, JSON.stringify(chars)), 200); };
const touch = c => { c.updated = Date.now(); save(); };

// ---------- small helpers ----------
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'data') Object.assign(e.dataset, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
function setPath(o, p, v) { const ks = p.split('.'); const last = ks.pop(); ks.reduce((a, k) => (a[k] ??= {}), o)[last] = v; }
const pbOf = c => pack && pack.playbooks.find(p => p.id === c.playbook);
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);

// ---------- playbook text: blocks -> DOM ----------
// html is only <b>, <i> and the tokens {box} {boxc} {circ} {pip} {dia}; anything else is text, never markup.
function mark(kind, ctx, c, group) {
  if (kind === 'pip') return h('span', { class: 'pip', 'aria-hidden': 'true', text: '✔' });
  if (/^n\d$/.test(kind)) return h('span', { class: 'nb', 'aria-hidden': 'true', text: kind.slice(1) });
  const key = ctx.prefix + '.' + ctx.n++;
  const on = c.checks[key] ?? (kind === 'boxc');
  const cls = kind === 'boxc' ? 'box' : kind;
  const e = h('input', { type: 'checkbox', class: 'mk ' + cls, data: group ? { key, group } : { key } });
  e.checked = on;
  return e;
}
// "Choose 1" groups: ticking one box in a group clears the others. A group is opened by a "(Choose 1)" / "Pick 1" heading
// or lead-in line and holds the boxes that follow it; "Choose 1 on each line" makes every line its own group.
const ONE = /\b(?:choose|pick) 1\b(?! (?:or|per|on each))/i, ROW = /choose 1 on each line/i;
const plainText = html => String(html).replace(/<[^>]+>|\{\w+\}/g, '');
const newGroup = ctx => `${ctx.prefix}g${ctx.g = (ctx.g || 0) + 1}`;
// group: { id, all } puts the first marker (or every marker, when all) of this text in that group
function markup(html, ctx, c, group) {
  const frag = document.createDocumentFragment();
  let cur = frag; const stack = []; let first = true;
  for (const part of String(html).split(/(<\/?[bi]>|\{(?:box|boxc|circ|pip|dia|n\d)\})/)) {
    if (!part) continue;
    let m;
    if ((m = /^<([bi])>$/.exec(part))) { const n = document.createElement(m[1]); cur.appendChild(n); stack.push(cur); cur = n; }
    else if (/^<\/[bi]>$/.test(part)) { if (stack.length) cur = stack.pop(); }
    else if ((m = /^\{(\w+)\}$/.exec(part))) {
      const isBox = /^(box|boxc|circ|dia)$/.test(m[1]);
      cur.appendChild(mark(m[1], ctx, c, group && isBox && (first || group.all) ? group.id : null));
      if (isBox) first = false;
    } else cur.appendChild(document.createTextNode(part));
  }
  return frag;
}
function blocks(list, ctx, c, opts = {}) {
  const out = [];
  let grp = null;                       // the open "choose 1" group id, 'row' for one group per line, or null
  for (const b of list) {
    if (b.t === 'sec') {
      grp = b.note && ONE.test(plainText(b.note)) ? newGroup(ctx) : null;
      out.push(h('h3', { class: 'sec' }, b.title, b.note ? [' ', h('small', null, markup(b.note, ctx, c))] : null));
    } else if (b.t === 'step') { grp = null; out.push(h('div', { class: 'step' }, h('b', { class: 'n', text: b.n }), h('div', null, markup(b.html, ctx, c)))); }
    else if (b.t === 'item') {
      const head = h('h4', { class: 'ih' });
      b.mk.forEach((k, i) => head.append(mark(k, ctx, c, grp && grp !== 'row' && i === 0 ? grp : null)));
      head.append(b.head);
      if (b.tail) head.append(h('span', { class: 'tail' }, b.tail.map(k => mark(k, ctx, c))));
      const need = /Requires level ([0-9]+)/i.exec(plainText((b.body[0] || {}).html || ''));
      out.push(h('div', { class: 'item', data: need ? { lvl: need[1] } : {} }, head, h('div', { class: 'ibody' }, blocks(b.body, ctx, c, opts))));
    } else {
      const lead = /^\{(?:box|boxc)\}/.test(b.html);
      let g = null;
      if (lead && grp) g = grp === 'row' ? { id: newGroup(ctx), all: true } : { id: grp };
      else if (!lead) { const t = plainText(b.html); grp = ROW.test(t) ? 'row' : ONE.test(t) ? newGroup(ctx) : null; }
      out.push(h('p', null, markup(b.html, ctx, c, g)));
    }
  }
  return out;
}
// opts.only picks columns by index (the keys keep the column's own number, so saved ticks do not move)
function columns(cols, region, c, opts) {
  const only = (opts && opts.only) || cols.map((_, i) => i);
  return h('div', { class: 'cols' + (opts && opts.two ? ' two' : '') }, only.map(i => h('div', { class: 'col' }, blocks(cols[i], { prefix: region + i, n: 0 }, c, opts))));
}
// Create and level-up show every option; play shows only what the character has: taken moves, chosen lines.
// A move that needs a level the character has not reached is dimmed ("locked") until it is.
function applyTaken(root, c) {
  const play = c.mode === 'play';
  const eff = (Number(c.level) || 1) + (c.mode === 'levelup' ? 1 : 0);
  root.querySelectorAll('.item').forEach(it => {
    const heads = [...it.querySelectorAll(':scope > .ih .mk')];
    const taken = !heads.length || heads.some(m => m.checked);
    it.classList.toggle('on', taken && heads.length > 0);
    it.classList.toggle('untaken', !taken);
    it.classList.toggle('hide', play && !taken);
    it.classList.toggle('locked', !taken && (Number(it.dataset.lvl) || 0) > eff);
  });
  root.querySelectorAll('.col p, .poss p').forEach(p => {
    if (p.closest('.item')) return;
    const mks = p.querySelectorAll('.mk');
    if (mks.length) p.classList.toggle('hide', play && ![...mks].some(m => m.checked));
  });
  const grid = root.querySelector('.movegrid');
  if (grid) root.querySelector('.empty-moves').hidden = !!grid.querySelector('.item:not(.hide)');
}

// ---------- dice ----------
const d = n => 1 + Math.floor(Math.random() * n);
let mode = 'norm';          // norm | adv | dis, set from the roll bar
let history = [];
function debilityFor(c, key) { return DEBS.find(([name, ks]) => ks.includes(key) && c.deb[name]); }
function netMode(c, key) {
  const n = (mode === 'adv' ? 1 : mode === 'dis' ? -1 : 0) + (key && debilityFor(c, key) ? -1 : 0);
  return Math.sign(n);
}
function rollMove(c, key) {
  const mod = Number(c.stats[key]) || 0, net = netMode(c, key);
  const dice = Array.from({ length: net ? 3 : 2 }, () => d(6));
  let drop = -1;
  if (net) {
    const sorted = dice.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    drop = net > 0 ? sorted[0][1] : sorted[2][1];
  }
  const total = dice.reduce((s, v, i) => s + (i === drop ? 0 : v), 0) + mod;
  const name = STATS.find(s => s[0] === key)[2];
  const why = net > 0 ? 'advantage' : net < 0 ? 'disadvantage' : '';
  const tier = total >= 10 ? ['full', total >= 12 ? '12+' : '10+'] : total >= 7 ? ['part', '7–9'] : ['miss', '6−'];
  show({ label: `${name} ${mod >= 0 ? '+' : ''}${mod}`, why: why + (net < 0 && debilityFor(c, key) ? ` (${debilityFor(c, key)[0]})` : ''), dice, drop, total, tier });
}
function rollDamage(c, pb) {
  const sides = Number(/\d+/.exec(pb.die)[0]) || 6;
  const net = Math.sign((mode === 'adv' ? 1 : mode === 'dis' ? -1 : 0));
  const dice = Array.from({ length: net ? 2 : 1 }, () => d(sides));
  let drop = -1;
  if (net) drop = (dice[0] <= dice[1]) === (net > 0) ? 0 : 1;
  show({ label: `damage ${pb.die}`, why: net > 0 ? 'advantage' : net < 0 ? 'disadvantage' : '', dice, drop, total: dice.reduce((s, v, i) => s + (i === drop ? 0 : v), 0), tier: null, die: sides });
}
function show(r) {
  history.unshift(`${r.label}: ${r.total}`); history = history.slice(0, 6);
  const res = roll.querySelector('.res');
  res.replaceChildren(...[
    h('b', { class: 'hd', text: r.label }), r.why ? h('span', { class: 'note', text: r.why }) : null,
    ...r.dice.map((v, i) => h('span', { class: 'die6' + (i === r.drop ? ' drop' : ''), text: v })),
    h('span', { class: 'tot', text: r.total }),
    r.tier ? h('span', { class: 'out ' + r.tier[0], text: r.tier[1] }) : null].filter(Boolean));
  roll.querySelector('.hist').textContent = history.slice(1).join(' · ');
}
function buildRollBar() {
  roll.replaceChildren(
    h('div', { class: 'seg', role: 'group', 'aria-label': 'Roll with' }, [['dis', 'Disadvantage'], ['norm', 'Normal'], ['adv', 'Advantage']].map(([m, t]) =>
      h('button', { type: 'button', 'aria-pressed': String(mode === m), data: { mode: m }, text: t, onclick: e => {
        mode = m; roll.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
      } }))),
    h('div', { class: 'res', 'aria-live': 'polite' }, h('span', { class: 'note', text: 'Tap a stat name or the damage die to roll.' })),
    h('div', { class: 'hist', 'aria-hidden': 'true' }));
  roll.hidden = false;
}

// ---------- pages ----------
function header(c, pb, tab) {
  return h('div', { class: 'hdrow' },
    h('h2', { class: 'hd', text: pb.name }),
    h('label', { class: 'field', style: 'flex:1 1 200px' }, h('span', null, 'I am called…'), h('input', { class: 'in', data: { bind: 'name' }, value: c.name, placeholder: 'name' })),
    h('label', { class: 'field', style: 'flex:0 1 150px' }, h('span', null, 'Pronouns'), h('input', { class: 'in', data: { bind: 'pronouns' }, value: c.pronouns || '' })));
}
// Stat cards: the playbook's scores ("+2, +1, +1, +0, +0, -1") as cards to drag onto the six stats, each used once.
// Touch has no drag, so a card can also be tapped, then the stat. c.assign maps stat -> card number.
let picked = null;
const scoreCards = pb => ((/scores?:\s*([^.]*)\./i.exec(pb.statsNote || '') || [])[1] || '').replace(/−/g, '-').match(/[+-]\d/g) || [];
function setStat(c, k, v) { c.stats[k] = v; const i = app.querySelector(`[data-bind="stats.${k}"]`); if (i) i.value = v; touch(c); }
function assignCard(c, k, idx) {
  for (const o of Object.keys(c.assign)) if (c.assign[o] === idx) { delete c.assign[o]; setStat(c, o, 0); }
  c.assign[k] = idx;
  setStat(c, k, Number(scoreCards(pbOf(c))[idx]));
  picked = null; drawCards(c);
}
// move a placed card to another stat; a card already there swaps back to where this one came from
function moveCard(c, from, to) {
  const cards = scoreCards(pbOf(c)), a = c.assign[from], b = c.assign[to];
  delete c.assign[from]; c.assign[to] = a; setStat(c, to, Number(cards[a]));
  if (b != null) { c.assign[from] = b; setStat(c, from, Number(cards[b])); } else setStat(c, from, 0);
  drawCards(c);
}
function unassign(c, k) { if (c.assign[k] == null) return; delete c.assign[k]; drawCards(c); }
function drawCards(c) {
  const tray = app.querySelector('.cards'); if (!tray) return;
  const cards = scoreCards(pbOf(c)), used = new Set(Object.values(c.assign));
  tray.replaceChildren(...[h('span', { class: 'lbl' }, 'Stat cards'),
    ...cards.map((v, i) => h('button', { type: 'button', class: 'card' + (used.has(i) ? ' used' : '') + (picked === i ? ' sel' : ''),       'aria-pressed': String(picked === i), 'aria-label': `Score ${v}${used.has(i) ? ' (placed)' : ''}`, data: { i }, text: v })),
    h('span', { class: 'note' }, used.size >= cards.length ? 'all placed' : picked != null ? 'now tap a stat' : 'drag a card onto a stat, or tap a card then a stat'),
    used.size ? h('button', { type: 'button', class: 'btn small', data: { resetcards: '1' }, text: 'Reset' }) : null].filter(Boolean));
  app.querySelectorAll('.stat').forEach(s => { s.classList.toggle('has', c.assign[s.dataset.stat] != null); s.classList.toggle('target', picked != null); });
}
function statBlock(c, pb) {
  const M = c.mode, edit = M === 'levelup';
  const grid = h('div', { class: 'statgrid' }, STATS.map(([k, full, ab]) => h('div', { class: 'stat', data: { stat: k } },
    M === 'play' ? h('button', { type: 'button', class: 'nm', title: `Roll ${ab}`, data: { roll: k }, text: full }) : h('span', { class: 'nm', text: full }),
    h('div', { class: 'v' },
      edit ? h('button', { type: 'button', 'aria-label': `${full} down`, data: { step: k, d: '-1' }, text: '−' }) : null,
      h('input', { type: 'number', min: '-3', max: '4', inputmode: 'numeric', 'aria-label': full, readonly: !edit, tabindex: edit ? null : '-1', data: { bind: 'stats.' + k, num: '1' }, value: c.stats[k] }),
      edit ? h('button', { type: 'button', 'aria-label': `${full} up`, data: { step: k, d: '1' }, text: '+' }) : null),
    h('div', { class: 'ab' }, `(${ab})`, M === 'create' ? h('button', { type: 'button', class: 'ret', title: 'Return the card', 'aria-label': `Return ${full} card`, data: { ret: k }, text: '↩' }) : null))));
  const debs = M === 'play' ? h('div', { class: 'debs' }, DEBS.map(([name, ks]) => h('label', { title: ks.join(' & ').toUpperCase() },
    h('input', { type: 'checkbox', class: 'mk box', data: { bind: 'deb.' + name } }), name))) : null;
  if (debs) debs.querySelectorAll('input').forEach(i => { i.checked = !!getPath(c, i.dataset.bind); });
  const vit = (nm, body) => h('div', { class: 'vit' }, h('span', { class: 'nm' }, nm), body);
  const num = (path, extra) => h('input', { type: 'number', inputmode: 'numeric', 'aria-label': path, data: { bind: path, num: '1' }, value: getPath(c, path), ...extra });
  const step = (label, attr, txt) => h('button', { type: 'button', class: 'step2', 'aria-label': label, data: attr, text: txt });
  const items = [vit('Damage', M === 'play' ? h('button', { type: 'button', class: 'die', title: 'Roll damage', data: { dmg: '1' }, text: pb.die }) : h('div', { class: 'dv', text: pb.die }))];
  items.push(M === 'play'
    ? vit(h('span', null, 'HP ', h('small', null, '(max)')), h('div', { class: 'hp' }, step('HP down', { hp: '-1' }, '−'), num('hp'),
        h('span', { class: 'sl', text: '/' }), num('hpMax', { readonly: true, 'aria-label': 'max HP' }), step('HP up', { hp: '1' }, '+')))
    : vit('Max HP', num('hpMax', { 'aria-label': 'max HP' })));
  items.push(vit('Armor', num('armor')));
  if (M === 'play') items.push(vit('XP', h('div', { class: 'hp' }, step('XP down', { xp: '-1' }, '−'), num('xp'), step('XP up', { xp: '1' }, '+'))));
  if (M === 'levelup') items.push(vit('XP', num('xp')));
  if (M !== 'create') items.push(vit('Level', M === 'levelup'
    ? h('div', null, num('level'), h('button', { type: 'button', class: 'btn small', data: { lvlup: '1' }, text: 'Level up' }))
    : num('level', { readonly: true })));
  const vitals = h('div', { class: 'vitals n' + items.length }, items);
  const hint = M === 'levelup'
    ? h('p', { class: 'note' }, 'Raise a stat with + (Improved Stat), tick the moves you take (dimmed ones need a higher level), then press Level up.') : null;
  const sec = h('h3', { class: 'sec' }, 'Stats ', h('small', null, M === 'create' ? pb.statsNote.split(' When')[0] : ''));
  const tray = M === 'create' && scoreCards(pb).length ? h('div', { class: 'cards noprint' }) : null;
  return h('div', null, sec, tray, grid, debs, hint, vitals);
}
function playPage(c, pb) {
  const M = c.mode;
  const page = h('div', { class: 'page mode-' + M }, header(c, pb));
  const poss = h('div', { class: 'poss' },
    h('div', { class: 'grid2' }, pb.possessions.map((col, i) => col.length ? h('div', null, blocks(col, { prefix: 'ps' + i, n: 0 }, c)) : null)));
  page.append(h('div', { class: 'band' }, statBlock(c, pb), poss));
  page.append(h('div', { class: 'moves-head' }, h('h3', { class: 'sec' }, 'Moves ', h('small', null, M === 'play' ? '' : pb.movesNote))));
  if (M === 'play') {
    // taken moves only, as cards that pack down the page; the keys are the same as in the other modes
    const cards = pb.moves.flatMap((col, i) => blocks(col, { prefix: 'mv' + i, n: 0 }, c).filter(e => e.classList.contains('item')));
    page.append(h('div', { class: 'movegrid' }, cards),
      h('p', { class: 'note empty-moves', hidden: true }, 'No moves taken yet. Switch to Create or Level up to choose some.'));
  } else page.append(columns(pb.moves, 'mv', c));
  return page;
}
// The paper is printed and folded like a book: the right half of page 1 comes first (the playbook itself), then page 2,
// then the left half of page 1 last (the story prompts and the introductions).
function startPage(c, pb) {
  const page = h('div', { class: 'page' }, header(c, pb));
  page.append(columns(pb.page1, 'p1', c, { two: true, only: [2, 3] }));
  return page;
}
function storyPage(c, pb) {
  const page = h('div', { class: 'page' }, header(c, pb));
  page.append(columns(pb.page1, 'p1', c, { two: true, only: [0, 1] }));
  page.append(h('label', { class: 'field', style: 'margin-top:14px' }, h('span', null, 'Notes from character creation'),
    h('textarea', { class: 'in', data: { bind: 'createNotes' } }, c.createNotes || '')));
  return page;
}
function listEditor(c, path, fields, blank, addText) {
  const wrap = h('div');
  const draw = () => {
    const rows = getPath(c, path);
    wrap.replaceChildren(h('div', { class: 'list' }, rows.map((r, i) => h('div', { class: 'li' + (fields.length > 2 ? ' fol' : '') },
      fields.map(([k, ph, num]) => h('input', { class: 'in', type: num ? 'number' : 'text', placeholder: ph, 'aria-label': ph, value: r[k] ?? '',
        oninput: e => { r[k] = num ? Number(e.target.value) : e.target.value; touch(c); } })),
      h('button', { type: 'button', class: 'x', 'aria-label': 'Remove', text: '×', onclick: () => { rows.splice(i, 1); touch(c); draw(); } }))),
    ), h('button', { type: 'button', class: 'btn small', text: addText, onclick: () => { rows.push({ ...blank }); touch(c); draw(); wrap.querySelector('.li:last-child input')?.focus(); } }));
  };
  draw();
  return wrap;
}
function gearPage(c, pb) {
  const page = h('div', { class: 'page' }, header(c, pb));
  const load = () => (c.gear || []).reduce((s, g) => s + (Number(g.load) || 0), 0);
  page.append(h('div', { class: 'cols', style: 'grid-template-columns:repeat(auto-fit,minmax(280px,1fr))' },
    h('div', { class: 'col' }, h('h3', { class: 'sec' }, 'Gear ', h('small', null, 'name, load')), listEditor(c, 'gear', [['name', 'item'], ['load', 'load', true]], { name: '', load: 1 }, '+ item')),
    h('div', { class: 'col' }, h('h3', { class: 'sec' }, 'Followers ', h('small', null, 'name, HP, armor')), listEditor(c, 'followers', [['name', 'name'], ['hp', 'HP', true], ['armor', 'arm', true]], { name: '', hp: 3, armor: 0 }, '+ follower')),
    h('div', { class: 'col' }, h('h3', { class: 'sec' }, 'Notes'), h('textarea', { class: 'in', style: 'min-height:220px', data: { bind: 'notes' } }, c.notes || ''))));
  return page;
}

// ---------- views ----------
function bar(...kids) {
  return h('div', { class: 'bar' }, h('a', { class: 'brand', href: '#/', text: 'Stonetop' }), ...kids);
}
function download(name, obj) {
  const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' })), download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const slug = s => (s || 'character').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'character';

function newChar(pb) {
  return { format: 'stonetop-character', version: 1, id: uid(), playbook: pb.id, name: '', pronouns: '',
    mode: 'create', stats: { str: 0, dex: 0, int: 0, wis: 0, con: 0, cha: 0 }, assign: {}, deb: {}, hp: pb.hpMax, hpMax: pb.hpMax, armor: 0, xp: 0, level: 1,
    checks: {}, gear: [], followers: [], notes: '', createNotes: '', ui: {}, updated: Date.now() };
}
function normalise(c) {
  c.stats ??= {}; for (const [k] of STATS) c.stats[k] ??= 0;
  c.assign ??= {};
  c.mode ??= (Object.keys(c.assign).length || Object.values(c.stats).some(v => v)) ? 'play' : 'create';
  c.deb ??= {}; c.checks ??= {}; c.gear ??= []; c.followers ??= []; c.ui ??= {};
  return c;
}

let message = '';
function ingest(text) {
  let j; try { j = JSON.parse(text); } catch { return 'That file is not JSON.'; }
  if (j.format === 'stonetop-pack' && Array.isArray(j.playbooks)) {
    pack = j; store.set(PACK_KEY, JSON.stringify(j));
    return `Loaded ${j.playbooks.length} playbooks.`;
  }
  if (j.format === 'stonetop-character' && j.playbook) {
    if (chars[j.id]) j.id = uid();
    chars[j.id] = normalise(j); touch(chars[j.id]);
    return `Imported ${j.name || 'a character'}.`;
  }
  return 'That file is neither a Stonetop pack nor a Stonetop character.';
}
function fileLoader(label) {
  const input = h('input', { type: 'file', accept: '.json,application/json', multiple: true, hidden: true, onchange: async e => {
    const msgs = [];
    for (const f of e.target.files) msgs.push(ingest(await f.text()));
    message = msgs.join(' '); route();
  } });
  return [h('button', { type: 'button', class: 'btn primary', text: label, onclick: () => input.click() }), input];
}

function home() {
  document.title = 'Stonetop';
  roll.hidden = true;
  const ids = Object.keys(chars).sort((a, b) => (chars[b].updated || 0) - (chars[a].updated || 0));
  const w = h('div', { class: 'wrap' }, h('h1', { class: 'hd', text: 'Stonetop' }), h('p', { class: 'sub', text: 'Character sheets for the table, laid out like the paper playbooks.' }));
  if (message) w.append(h('p', { class: 'note', role: 'status', text: message }));
  if (!pack) {
    const drop = h('div', { class: 'drop' }, h('p', null, h('b', null, 'Load the playbook pack first.')),
      h('p', { class: 'note', text: 'Your GM sends you one file, stonetop-pack.json. Load it here once: it is kept in this browser, so it works offline afterwards. The pack never leaves your device.' }),
      h('div', { class: 'row', style: 'justify-content:center' }, fileLoader('Choose pack file…')));
    ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', async e => { const msgs = []; for (const f of e.dataTransfer.files) msgs.push(ingest(await f.text())); message = msgs.join(' '); route(); });
    w.append(drop);
  } else {
    const sel = h('select', { class: 'in', 'aria-label': 'Playbook', style: 'width:auto;min-width:12em' }, pack.playbooks.map(p => h('option', { value: p.id, text: p.name })));
    w.append(h('h2', { class: 'lbl hd', text: 'New character' }), h('div', { class: 'row' }, sel,
      h('button', { type: 'button', class: 'btn primary', text: 'Start', onclick: () => {
        const c = newChar(pack.playbooks.find(p => p.id === sel.value)); chars[c.id] = c; touch(c); location.hash = `#/c/${c.id}/start`;
      } })));
    w.append(h('h2', { class: 'lbl hd', text: 'Your characters' }));
    if (!ids.length) w.append(h('p', { class: 'note', text: 'None yet.' }));
    for (const id of ids) {
      const c = chars[id], pb = pbOf(c);
      w.append(h('div', { class: 'card' },
        h('a', { href: `#/c/${id}`, style: 'text-decoration:none;color:inherit;display:block' }, h('b', { text: c.name || '(unnamed)' }),
          h('span', { text: `${pb ? pb.name : c.playbook} · level ${c.level} · HP ${c.hp}/${c.hpMax}` })),
        h('div', { class: 'row', style: 'margin-top:8px' },
          h('button', { type: 'button', class: 'btn small', text: 'Export', onclick: () => download(`stonetop-${slug(c.name)}.json`, c) }),
          h('button', { type: 'button', class: 'btn small danger', text: 'Delete', onclick: () => { if (confirm(`Delete ${c.name || 'this character'}? Export it first if you might want it back.`)) { delete chars[id]; save(); route(); } } }))));
    }
    w.append(h('h2', { class: 'lbl hd', text: 'Files' }), h('div', { class: 'row' }, fileLoader('Import character or pack…'),
      h('span', { class: 'note', text: `${pack.playbooks.length} playbooks loaded.` })));
  }
  app.replaceChildren(w);
}

function sheet(id, tab) {
  const c = chars[id];
  if (!c) { message = 'That character is not in this browser.'; location.hash = '#/'; return; }
  const pb = pbOf(c);
  if (!pack || !pb) { message = 'Load the playbook pack to open this character.'; location.hash = '#/'; return; }
  if (tab === 'create') tab = 'start';
  tab = ['start', 'play', 'story', 'gear'].includes(tab) ? tab : 'play';
  document.title = `${c.name || pb.name} · Stonetop`;
  const tabs = [['start', 'Playbook'], ['play', 'Sheet'], ['story', 'Story'], ['gear', 'Gear & notes']].map(([t, n]) =>
    h('a', { class: 'tab', href: `#/c/${id}/${t}`, 'aria-current': t === tab ? 'page' : null, text: n }));
  const page = { start: startPage, play: playPage, story: storyPage, gear: gearPage }[tab](c, pb);
  // turn the page: the tabs in order, with a button at the foot of the page like the corner of a physical sheet
  const order = ['start', 'play', 'story', 'gear'], at = order.indexOf(tab);
  const label = Object.fromEntries([['start', 'Playbook'], ['play', 'Sheet'], ['story', 'Story'], ['gear', 'Gear & notes']]);
  page.append(h('div', { class: 'turn noprint' },
    at > 0 ? h('a', { class: 'btn', href: `#/c/${id}/${order[at - 1]}`, text: `← ${label[order[at - 1]]}` }) : h('span'),
    at < order.length - 1 ? h('a', { class: 'btn primary', href: `#/c/${id}/${order[at + 1]}`, text: `${label[order[at + 1]]} →` }) : null));
  app.replaceChildren(
    bar(h('div', { class: 'seg modeseg', role: 'group', 'aria-label': 'Mode' }, [['create', 'Create'], ['play', 'Play'], ['levelup', 'Level up']].map(([m, t]) =>
        h('button', { type: 'button', 'aria-pressed': String(c.mode === m), data: { setmode: m }, text: t }))),
      ...tabs, h('button', { type: 'button', class: 'btn', text: 'Print', onclick: () => print() }),
      h('button', { type: 'button', class: 'btn', text: 'Export', onclick: () => download(`stonetop-${slug(c.name)}.json`, c) })),
    page);
  refresh(c);
  if (c.mode === 'play') buildRollBar(); else { roll.hidden = true; roll.replaceChildren(); }
}
function refresh(c) {
  app.querySelectorAll('.stat').forEach(s => s.classList.toggle('dis', !!debilityFor(c, s.dataset.stat)));
  applyTaken(app, c); drawCards(c);
}

// ---------- events (one set, delegated) ----------
app.addEventListener('input', e => {
  const t = e.target, path = t.dataset && t.dataset.bind;
  if (!path) return;
  const c = chars[currentId()]; if (!c) return;
  setPath(c, path, t.dataset.num ? (t.value === '' ? 0 : Number(t.value)) : t.value);
  touch(c);
  if (path.startsWith('stats.')) unassign(c, path.slice(6));       // a hand-typed score is no longer a card's
  if (path === 'hpMax' && c.mode !== 'play') { c.hp = c.hpMax; const i = app.querySelector('[data-bind="hp"]'); if (i) i.value = c.hp; }
});
app.addEventListener('change', e => {
  const t = e.target, c = chars[currentId()]; if (!c) return;
  if (t.dataset.bind && t.type === 'checkbox') { setPath(c, t.dataset.bind, t.checked); touch(c); refresh(c); }
  else if (t.classList.contains('mk') && t.dataset.key) {
    c.checks[t.dataset.key] = t.checked;
    if (t.checked && t.dataset.group) {           // "choose 1": clear the rest of the group
      app.querySelectorAll('.mk[data-group]').forEach(o => { if (o !== t && o.dataset.group === t.dataset.group && o.checked) { o.checked = false; c.checks[o.dataset.key] = false; } });
    }
    touch(c); applyTaken(app, c);
  }
});
app.addEventListener('click', e => {
  const c = chars[currentId()]; if (!c) return;
  if (swallow) { swallow = false; return; }
  const card = e.target.closest('.card');
  if (card) { const i = Number(card.dataset.i); picked = picked === i ? null : i; drawCards(c); return; }
  const slot = e.target.closest('.stat');
  if (picked != null && slot) { assignCard(c, slot.dataset.stat, picked); return; }
  const b = e.target.closest('button'); if (!b) return;
  const pb = pbOf(c), ds = b.dataset;
  const setNum = (path, v) => { setPath(c, path, v); const i = app.querySelector(`[data-bind="${path}"]`); if (i) i.value = v; touch(c); };
  if (ds.setmode) { c.mode = ds.setmode; touch(c); route(); }
  else if (ds.xp) setNum('xp', Math.max(0, (Number(c.xp) || 0) + Number(ds.xp)));
  else if (ds.lvlup) { setNum('level', (Number(c.level) || 1) + 1); setNum('xp', 0); applyTaken(app, c); }
  else if (ds.resetcards) { for (const k of Object.keys(c.assign)) setStat(c, k, 0); c.assign = {}; picked = null; drawCards(c); }
  else if (ds.ret) { setStat(c, ds.ret, 0); unassign(c, ds.ret); }
  else if (ds.roll) rollMove(c, ds.roll);
  else if (ds.dmg) rollDamage(c, pb);
  else if (ds.step) { setNum('stats.' + ds.step, Math.max(-3, Math.min(4, (Number(c.stats[ds.step]) || 0) + Number(ds.d)))); unassign(c, ds.step); }
  else if (ds.hp) setNum('hp', Math.max(0, Math.min(Number(c.hpMax) || 99, (Number(c.hp) || 0) + Number(ds.hp))));
  else if (ds.show) { c.ui.takenOnly = ds.show === 'taken'; touch(c); b.parentElement.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); applyTaken(app, c); }
});

// Dragging a stat card with a pointer (mouse, pen or finger). A short press is a tap: the click handler selects the card.
let drag = null, swallow = false;
const slotAt = e => { const el = document.elementFromPoint(e.clientX, e.clientY); return el && el.closest('.stat'); };
app.addEventListener('pointerdown', e => {
  if (e.button || !e.target.closest) return;
  const c = chars[currentId()];
  const card = e.target.closest('.card');
  if (card && !card.classList.contains('used')) { drag = { idx: Number(card.dataset.i), from: null, label: card.textContent, x: e.clientX, y: e.clientY, ghost: null }; return; }
  const stat = c && c.mode === 'create' && !e.target.closest('button') && e.target.closest('.stat.has');   // a placed card can be picked up again
  if (stat) { const idx = c.assign[stat.dataset.stat]; drag = { idx, from: stat.dataset.stat, label: scoreCards(pbOf(c))[idx], x: e.clientX, y: e.clientY, ghost: null }; }
});
addEventListener('pointermove', e => {
  if (!drag) return;
  if (!drag.ghost) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
    drag.ghost = h('div', { class: 'card ghost', text: drag.label }); document.body.append(drag.ghost); picked = null;
  }
  drag.ghost.style.left = e.clientX + 'px'; drag.ghost.style.top = e.clientY + 'px';
  const over = slotAt(e);
  app.querySelectorAll('.stat.over').forEach(s => { if (s !== over) s.classList.remove('over'); });
  if (over) over.classList.add('over');
});
function endDrag(e, drop) {
  if (!drag) return;
  const d = drag; drag = null;
  if (!d.ghost) return;
  d.ghost.remove(); swallow = true; setTimeout(() => { swallow = false; }, 120);
  const slot = drop && slotAt(e), c = chars[currentId()];
  app.querySelectorAll('.stat.over').forEach(s => s.classList.remove('over'));
  if (!slot || !c) return;
  if (d.from === null) assignCard(c, slot.dataset.stat, d.idx);
  else if (slot.dataset.stat !== d.from) moveCard(c, d.from, slot.dataset.stat);
}
addEventListener('pointerup', e => endDrag(e, true));
addEventListener('pointercancel', e => endDrag(e, false));

// ---------- routing ----------
function currentId() { const m = /^#\/c\/([^/]+)/.exec(location.hash); return m ? m[1] : null; }
function route() {
  const m = /^#\/c\/([^/]+)(?:\/(\w+))?/.exec(location.hash);
  if (m) sheet(m[1], m[2]); else home();
  if (!m) message = '';
  window.scrollTo(0, 0);
}
addEventListener('hashchange', route);
for (const c of Object.values(chars)) normalise(c);

// A pack served next to this page (the GM's machine, or a private host) is picked up without a file dialog.
(async () => {
  if (!pack) {
    try {
      const r = await fetch('pack/stonetop-pack.json', { cache: 'no-cache' });
      if (r.ok) { const j = await r.json(); if (j.format === 'stonetop-pack') { pack = j; store.set(PACK_KEY, JSON.stringify(j)); } }
    } catch { /* no pack here: the player loads one */ }
  }
  route();
})();
})();
