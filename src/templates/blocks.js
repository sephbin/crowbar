// Page blocks: the editable pieces that make up the structured header of a page.
// A page lists the blocks it wants in meta.blocks; without that, its template picks
// the default list for the vault's rules system. Blocks read and write plain meta keys
// (data-meta-key), so they can be mixed freely on any page.
//
//   id      - unique key stored in meta.blocks
//   label   - name shown in the block picker
//   kind    - 'card' (grouped into one bordered card) or 'doc' (document-style header)
//   fields  - meta fields the block edits, also listed in the meta panel
//   html(meta, ctx) - markup for the block (ctx.fallbackName names an untitled page)

export const SYSTEMS = [
  { id: 'coc',      label: 'Call of Cthulhu' },
  { id: 'stonetop', label: 'Stonetop' },
  { id: 'none',     label: 'No rules system' },
];

let system = 'coc';
export function getSystem() { return system; }
export function setSystem(id) { system = SYSTEMS.some(s => s.id === id) ? id : 'coc'; }

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const text = (f, tag = 'div', cls = '') => (meta) =>
  `<${tag} class="${cls}" contenteditable="true" data-meta-key="${f.key}" data-placeholder="${esc(f.placeholder ?? f.label)}">${esc(meta[f.key])}</${tag}>`;

// A row of labelled properties, shared by the location/faction/artifact/quest/session blocks.
function propsBlock(id, label, fields) {
  return {
    id, label, kind: 'doc', fields,
    html: (meta) => `<dl class="pb-props">
    ${fields.map(f => {
      const v = f.inputType === 'checkbox' ? (meta[f.key] ? 'Yes' : 'No') : esc(meta[f.key]);
      return `<div class="pb-prop"><dt>${f.label}</dt><dd contenteditable="true" data-meta-key="${f.key}">${v}</dd></div>`;
    }).join('\n    ')}
  </dl>`,
  };
}

const cell = (key, label, meta, def = '') =>
  `<div class="char-stat-cell"><span class="stat-value" contenteditable="true" data-meta-key="${key}">${esc(meta[key] ?? def)}</span><span class="stat-label">${label}</span></div>`;

const section = (title, key, meta, placeholder) =>
  `<div class="char-section"><div class="char-section-title">${title}</div><div class="char-trait-list" contenteditable="true" data-meta-key="${key}" data-placeholder="${esc(placeholder)}">${esc(meta[key])}</div></div>`;

const COC_ABILITIES = ['str', 'con', 'siz', 'dex', 'int', 'pow', 'app', 'edu', 'luk'];

export const BLOCKS = [
  {
    id: 'title', label: 'Title', kind: 'doc',
    fields: [{ key: 'name', label: 'Name', inputType: 'text' }],
    html: (meta, ctx) => `<h1 class="pb-name" contenteditable="true" data-meta-key="name">${esc(meta.name || ctx.fallbackName)}</h1>`,
  },
  {
    id: 'identity', label: 'Character header', kind: 'card',
    fields: [
      { key: 'name', label: 'Name', inputType: 'text' },
      { key: 'occupation', label: 'Occupation', inputType: 'text', placeholder: 'Role or occupation' },
      { key: 'controller', label: 'Controller', inputType: 'text', placeholder: 'Player name or NPC' },
    ],
    html: (meta, ctx) => `<div class="char-header">
    <div class="char-header-main">
      <div class="char-name" contenteditable="true" data-meta-key="name">${esc(meta.name || ctx.fallbackName)}</div>
      <div class="char-subline" contenteditable="true" data-meta-key="occupation" data-placeholder="Role or occupation">${esc(meta.occupation)}</div>
    </div>
    <div class="char-controller" contenteditable="true" data-meta-key="controller">${esc(meta.controller ?? 'NPC')}</div>
  </div>`,
  },

  // ── Call of Cthulhu ──
  {
    id: 'coc-stats', label: 'Call of Cthulhu stats', kind: 'card',
    fields: [],
    html: (meta) => `<div class="char-stats-row">
    ${cell('hp', 'HP', meta, 10)}${cell('san', 'SAN', meta, 50)}${cell('mp', 'MP', meta, 10)}${cell('mov', 'MOV', meta, 8)}${cell('build', 'Build', meta, 0)}${cell('db', 'DB', meta, '0')}
  </div>
  <div class="char-abilities">
    ${COC_ABILITIES.map(k => `<div class="char-ability"><span class="ability-label">${k.toUpperCase()}</span><span class="ability-score" contenteditable="true" data-meta-key="${k}">${esc(meta[k] ?? 50)}</span></div>`).join('\n    ')}
  </div>
  <div class="char-section"><div class="char-section-title">Key Skills</div><div class="char-trait-list" contenteditable="true" data-meta-key="skills" data-placeholder="Spot Hidden 50%, Listen 40%…">${esc(meta.skills)}</div></div>
  <div class="char-section"><div class="char-section-title">Weapons</div><div class="char-attack-list" contenteditable="true" data-meta-key="weapons" data-placeholder="Fist  25%  1d3+DB">${esc(meta.weapons)}</div></div>`,
  },

  // ── Stonetop ──
  {
    id: 'st-combat', label: 'Stonetop: tags and combat', kind: 'card',
    fields: [
      { key: 'stTags', label: 'Tags', inputType: 'text', placeholder: 'e.g. group, hardy, observant' },
      { key: 'hp', label: 'HP', inputType: 'text' },
      { key: 'armor', label: 'Armor', inputType: 'text' },
      { key: 'damage', label: 'Damage', inputType: 'text', placeholder: 'e.g. hatchet 1d6 (hand)' },
    ],
    html: (meta) => `<div class="char-stats-row">
    ${cell('hp', 'HP', meta)}${cell('armor', 'Armor', meta)}
    <div class="char-stat-cell char-stat-wide"><span class="stat-value" contenteditable="true" data-meta-key="damage" data-placeholder="1d6">${esc(meta.damage)}</span><span class="stat-label">Damage</span></div>
  </div>
  ${section('Tags', 'stTags', meta, 'e.g. group, hardy, observant')}`,
  },
  {
    id: 'st-motive', label: 'Stonetop: instinct and cost', kind: 'card',
    fields: [
      { key: 'instinct', label: 'Instinct', inputType: 'text', placeholder: 'to ...' },
      { key: 'cost', label: 'Cost', inputType: 'text', placeholder: 'What keeps a follower following' },
      { key: 'loyalty', label: 'Loyalty', inputType: 'text' },
    ],
    html: (meta) => `${section('Instinct', 'instinct', meta, 'to ...')}
  ${section('Cost (followers)', 'cost', meta, 'coin, respect, affection ...')}
  ${section('Loyalty', 'loyalty', meta, '0')}`,
  },
  {
    id: 'st-threat', label: 'Stonetop: threat', kind: 'card',
    fields: [
      { key: 'threatType', label: 'Threat type', inputType: 'select', options: ['', 'Affliction', 'Beast', 'Institution', 'MacGuffin', 'Magical entity', 'Rabble', 'Villain', 'Wildcard'] },
      { key: 'instinct', label: 'Instinct', inputType: 'text', placeholder: 'to ...' },
      { key: 'impendingDoom', label: 'Impending doom', inputType: 'text' },
    ],
    html: (meta) => `${section('Threat type', 'threatType', meta, 'Affliction, Beast, Institution, MacGuffin, Magical entity, Rabble, Villain, Wildcard')}
  ${section('Instinct', 'instinct', meta, 'to ...')}
  ${section('Impending doom', 'impendingDoom', meta, 'What happens if nobody stops it')}`,
  },

  // ── Property rows for the other page types ──
  propsBlock('props-location', 'Location details', [
    { key: 'locationType',   label: 'Type',          inputType: 'select', options: ['city', 'town', 'village', 'tavern', 'inn', 'dungeon', 'ruins', 'wilderness', 'landmark', 'building', 'other'] },
    { key: 'parentLocation', label: 'Within',        inputType: 'text', placeholder: 'Parent location' },
    { key: 'faction',        label: 'Controlled by', inputType: 'text', placeholder: 'Ruling faction or NPC' },
    { key: 'danger',         label: 'Danger',        inputType: 'select', options: ['safe', 'low', 'moderate', 'high', 'deadly'] },
  ]),
  propsBlock('props-faction', 'Faction details', [
    { key: 'factionType',  label: 'Type',        inputType: 'select', options: ['guild', 'government', 'cult', 'criminal', 'military', 'religious', 'mercantile', 'noble house', 'other'] },
    { key: 'leader',       label: 'Leader',      inputType: 'text', placeholder: 'NPC name' },
    { key: 'headquarters', label: 'HQ',          inputType: 'text', placeholder: 'Location name' },
    { key: 'disposition',  label: 'Disposition', inputType: 'select', options: ['friendly', 'neutral', 'hostile', 'unknown'] },
  ]),
  propsBlock('props-artifact', 'Item details', [
    { key: 'rarity',     label: 'Rarity',     inputType: 'select', options: ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'] },
    { key: 'owner',      label: 'Owner',      inputType: 'text', placeholder: 'NPC name' },
    { key: 'location',   label: 'Location',   inputType: 'text', placeholder: 'Where it is kept' },
    { key: 'attunement', label: 'Attunement', inputType: 'checkbox' },
  ]),
  propsBlock('props-quest', 'Quest details', [
    { key: 'giver',    label: 'Giver',    inputType: 'text', placeholder: 'NPC name' },
    { key: 'location', label: 'Location', inputType: 'text' },
    { key: 'status',   label: 'Status',   inputType: 'select', options: ['active', 'complete', 'failed', 'planned'] },
    { key: 'reward',   label: 'Reward',   inputType: 'text', placeholder: 'Gold, items, reputation…' },
  ]),
  propsBlock('props-session', 'Session details', [
    { key: 'sessionDate', label: 'Date',     inputType: 'text', placeholder: 'YYYY-MM-DD' },
    { key: 'location',    label: 'Location', inputType: 'text' },
    { key: 'players',     label: 'Players',  inputType: 'text', placeholder: 'Comma separated' },
    { key: 'status',      label: 'Status',   inputType: 'select', options: ['planned', 'played', 'cancelled'] },
  ]),
];

export const COC_KEYS = ['hp', 'san', 'mp', 'mov', 'build', 'db', 'skills', 'weapons', ...COC_ABILITIES];

export function getBlock(id) { return BLOCKS.find(b => b.id === id); }

// Renders blocks in order. Consecutive blocks of one kind share a container:
// card blocks sit inside one bordered card, doc blocks form a document header.
export function renderBlocks(ids, meta, ctx = {}) {
  const blocks = ids.map(getBlock).filter(Boolean);
  if (!blocks.length) return null;
  const groups = [];
  for (const b of blocks) {
    const last = groups[groups.length - 1];
    if (last && last.kind === b.kind) last.parts.push(b.html(meta, ctx));
    else groups.push({ kind: b.kind, parts: [b.html(meta, ctx)] });
  }
  const body = groups.map(g => `<div class="${g.kind === 'card' ? 'char-card' : 'page-block'}" contenteditable="false">\n  ${g.parts.join('\n  ')}\n</div>`).join('\n');
  return `<div class="block-stack" contenteditable="false">\n${body}\n</div>`;
}
