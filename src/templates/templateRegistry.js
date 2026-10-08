import { characterCardHTML } from './characterTemplate.js';

// Each template defines:
//   id          - unique key
//   label       - display name
//   icon        - emoji shown in sidebar + modal
//   desc        - short description shown in modal
//   defaultMeta - starting metadata values (type must be set)
//   metaFields  - ordered list of editable fields in the meta panel
//   blockHTML(meta)  - editable structured block injected at top of page (rendered from meta, not stored)
//   bodyHTML(meta)   - initial prose content below the block

function props(fields, meta) {
  return fields.map(([label, key]) => `<div class="pb-prop">
      <dt>${label}</dt><dd contenteditable="true" data-meta-key="${key}">${meta[key] ?? ''}</dd>
    </div>`).join('\n    ');
}

export const TEMPLATES = [
  {
    id: 'character',
    label: 'Character',
    icon: '🕵',
    desc: 'Player or non-player character with CoC stat block',
    defaultMeta: {
      type: 'character',
      name: '',
      tags: [],
      occupation: '',
      controller: 'NPC',
      location: '',
      role: 'neutral',
      status: 'alive',
      str: 50, con: 50, siz: 50, dex: 50,
      int: 50, pow: 50, app: 50, edu: 50, luk: 50,
      hp: 10, san: 50, mp: 10, mov: 8, build: 0, db: '0',
      skills: '',
      weapons: '',
    },
    metaFields: [
      { key: 'name',       label: 'Name',         inputType: 'text' },
      { key: 'controller', label: 'Controller',   inputType: 'text', placeholder: 'Player name or NPC' },
      { key: 'occupation', label: 'Occupation',   inputType: 'text', placeholder: 'e.g. Private Investigator' },
      { key: 'location',   label: 'Location',     inputType: 'text', placeholder: 'Where they are found' },
      { key: 'role',       label: 'Role',         inputType: 'select', options: ['neutral', 'ally', 'antagonist', 'unknown'] },
      { key: 'status',     label: 'Status',       inputType: 'select', options: ['alive', 'dead', 'missing', 'insane', 'unknown'] },
    ],
    blockHTML: (meta) => characterCardHTML(meta),
    bodyHTML(meta) {
      return `<h2>Description</h2>\n<p>Appearance, mannerisms, voice.</p>\n<h2>Background</h2>\n<p>History, motivations, secrets.</p>\n<h2>Notes</h2>\n<p></p>\n`;
    },
  },

  {
    id: 'location',
    label: 'Location',
    icon: '🏰',
    desc: 'A place in your world',
    defaultMeta: {
      type: 'location',
      name: '',
      tags: [],
      locationType: 'other',
      parentLocation: '',
      faction: '',
      danger: 'safe',
    },
    metaFields: [
      { key: 'name',           label: 'Name',          inputType: 'text' },
      { key: 'locationType',   label: 'Type',          inputType: 'select', options: ['city', 'town', 'village', 'tavern', 'inn', 'dungeon', 'ruins', 'wilderness', 'landmark', 'building', 'other'] },
      { key: 'parentLocation', label: 'Within',        inputType: 'text', placeholder: 'Parent location' },
      { key: 'faction',        label: 'Controlled by', inputType: 'text', placeholder: 'Ruling faction or NPC' },
      { key: 'danger',         label: 'Danger',        inputType: 'select', options: ['safe', 'low', 'moderate', 'high', 'deadly'] },
    ],
    blockHTML(meta) {
      return `<div class="page-block" contenteditable="false">
  <h1 class="pb-name" contenteditable="true" data-meta-key="name">${meta.name || 'New Location'}</h1>
  <dl class="pb-props">
    ${props([['Type', 'locationType'], ['Within', 'parentLocation'], ['Controlled by', 'faction'], ['Danger', 'danger']], meta)}
  </dl>
</div>`;
    },
    bodyHTML(meta) {
      return `<h2>Overview</h2>\n<p>What this place looks, smells, and feels like.</p>\n<h2>Key Features</h2>\n<ul><li>…</li></ul>\n<h2>Notable NPCs</h2>\n<p></p>\n<h2>Secrets</h2>\n<p></p>\n<h2>Notes</h2>\n<p></p>\n`;
    },
  },

  {
    id: 'faction',
    label: 'Faction',
    icon: '⚜',
    desc: 'Organisation, guild, cult, or group',
    defaultMeta: {
      type: 'faction',
      name: '',
      tags: [],
      factionType: 'other',
      leader: '',
      headquarters: '',
      disposition: 'neutral',
    },
    metaFields: [
      { key: 'name',         label: 'Name',        inputType: 'text' },
      { key: 'factionType',  label: 'Type',        inputType: 'select', options: ['guild', 'government', 'cult', 'criminal', 'military', 'religious', 'mercantile', 'noble house', 'other'] },
      { key: 'leader',       label: 'Leader',      inputType: 'text', placeholder: 'NPC name' },
      { key: 'headquarters', label: 'HQ',          inputType: 'text', placeholder: 'Location name' },
      { key: 'disposition',  label: 'Disposition', inputType: 'select', options: ['friendly', 'neutral', 'hostile', 'unknown'] },
    ],
    blockHTML(meta) {
      return `<div class="page-block" contenteditable="false">
  <h1 class="pb-name" contenteditable="true" data-meta-key="name">${meta.name || 'New Faction'}</h1>
  <dl class="pb-props">
    ${props([['Type', 'factionType'], ['Leader', 'leader'], ['HQ', 'headquarters'], ['Disposition', 'disposition']], meta)}
  </dl>
</div>`;
    },
    bodyHTML(meta) {
      return `<h2>Overview</h2>\n<p>Goals, methods, and public face.</p>\n<h2>Key Members</h2>\n<p></p>\n<h2>Relationships</h2>\n<p>Allies and enemies.</p>\n<h2>Resources</h2>\n<p>Wealth, territory, influence.</p>\n<h2>Notes</h2>\n<p></p>\n`;
    },
  },

  {
    id: 'artifact',
    label: 'Artifact / Item',
    icon: '💎',
    desc: 'Notable item, weapon, or relic',
    defaultMeta: {
      type: 'artifact',
      name: '',
      tags: [],
      rarity: 'rare',
      owner: '',
      location: '',
      attunement: false,
    },
    metaFields: [
      { key: 'name',       label: 'Name',       inputType: 'text' },
      { key: 'rarity',     label: 'Rarity',     inputType: 'select', options: ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'] },
      { key: 'owner',      label: 'Owner',      inputType: 'text', placeholder: 'NPC name' },
      { key: 'location',   label: 'Location',   inputType: 'text', placeholder: 'Where it is kept' },
      { key: 'attunement', label: 'Attunement', inputType: 'checkbox' },
    ],
    blockHTML(meta) {
      return `<div class="page-block" contenteditable="false">
  <h1 class="pb-name" contenteditable="true" data-meta-key="name">${meta.name || 'New Item'}</h1>
  <dl class="pb-props">
    ${props([['Rarity', 'rarity'], ['Owner', 'owner'], ['Location', 'location']], meta)}
    <div class="pb-prop"><dt>Attunement</dt><dd contenteditable="true" data-meta-key="attunement">${meta.attunement ? 'Yes' : 'No'}</dd></div>
  </dl>
</div>`;
    },
    bodyHTML(meta) {
      return `<h2>Description</h2>\n<p>Appearance and feel.</p>\n<h2>Properties</h2>\n<p>Abilities, charges, curses.</p>\n<h2>History</h2>\n<p>Origin and past owners.</p>\n<h2>Notes</h2>\n<p></p>\n`;
    },
  },

  {
    id: 'quest',
    label: 'Quest',
    icon: '📜',
    desc: 'Adventure hook or active quest',
    defaultMeta: {
      type: 'quest',
      name: '',
      tags: [],
      giver: '',
      location: '',
      status: 'active',
      reward: '',
    },
    metaFields: [
      { key: 'name',     label: 'Name',       inputType: 'text' },
      { key: 'giver',    label: 'Quest Giver', inputType: 'text', placeholder: 'NPC name' },
      { key: 'location', label: 'Location',   inputType: 'text' },
      { key: 'status',   label: 'Status',     inputType: 'select', options: ['active', 'complete', 'failed', 'planned'] },
      { key: 'reward',   label: 'Reward',     inputType: 'text', placeholder: 'Gold, items, reputation…' },
    ],
    blockHTML(meta) {
      return `<div class="page-block" contenteditable="false">
  <h1 class="pb-name" contenteditable="true" data-meta-key="name">${meta.name || 'New Quest'}</h1>
  <dl class="pb-props">
    ${props([['Giver', 'giver'], ['Location', 'location'], ['Status', 'status'], ['Reward', 'reward']], meta)}
  </dl>
</div>`;
    },
    bodyHTML(meta) {
      return `<h2>Hook</h2>\n<p>How the party got involved.</p>\n<h2>Objectives</h2>\n<ul><li>…</li></ul>\n<h2>Complications</h2>\n<p></p>\n<h2>Resolution</h2>\n<p></p>\n<h2>Notes</h2>\n<p></p>\n`;
    },
  },

  {
    id: 'session',
    label: 'Session',
    icon: '📅',
    desc: 'Session notes and recap',
    defaultMeta: {
      type: 'session',
      name: '',
      tags: [],
      sessionDate: '',
      location: '',
      players: '',
      status: 'planned',
    },
    metaFields: [
      { key: 'name',        label: 'Title',    inputType: 'text' },
      { key: 'sessionDate', label: 'Date',     inputType: 'text', placeholder: 'YYYY-MM-DD' },
      { key: 'location',    label: 'Location', inputType: 'text' },
      { key: 'players',     label: 'Players',  inputType: 'text', placeholder: 'Comma separated' },
      { key: 'status',      label: 'Status',   inputType: 'select', options: ['planned', 'played', 'cancelled'] },
    ],
    blockHTML(meta) {
      return `<div class="page-block" contenteditable="false">
  <h1 class="pb-name" contenteditable="true" data-meta-key="name">${meta.name || 'Session Notes'}</h1>
  <dl class="pb-props">
    ${props([['Date', 'sessionDate'], ['Location', 'location'], ['Players', 'players'], ['Status', 'status']], meta)}
  </dl>
</div>`;
    },
    bodyHTML(meta) {
      return `<h2>Summary</h2>\n<p>What happened.</p>\n<h2>Key Events</h2>\n<ul><li>…</li></ul>\n<h2>Decisions &amp; Consequences</h2>\n<p></p>\n<h2>Next Steps</h2>\n<p></p>\n`;
    },
  },

  {
    id: 'blank',
    label: 'Blank',
    icon: '📄',
    desc: 'Empty page',
    defaultMeta: { type: 'page', name: '', tags: [] },
    metaFields: [
      { key: 'name', label: 'Name', inputType: 'text' },
    ],
    blockHTML: null,
    bodyHTML(meta) {
      return `<h1>${meta.name || 'New Page'}</h1>\n<p></p>\n`;
    },
  },

  {
    id: 'canvas',
    label: 'Canvas',
    icon: '🗺',
    desc: 'Spatial canvas for organising pages visually',
    defaultMeta: {
      type: 'canvas',
      name: '',
      tags: [],
      canvasNodes: [],
      canvasEdges: [],
      canvasGroups: [],
    },
    metaFields: [
      { key: 'name', label: 'Name', inputType: 'text' },
    ],
    blockHTML: null,
    bodyHTML() { return ''; },
  },
];

export function getTemplate(id) {
  return TEMPLATES.find(t => t.id === id) ?? TEMPLATES.find(t => t.id === 'blank');
}

export function getTemplateForType(type) {
  return TEMPLATES.find(t => t.defaultMeta.type === type) ?? TEMPLATES.find(t => t.id === 'blank');
}

export const TYPE_ICONS = Object.fromEntries(
  TEMPLATES.map(t => [t.defaultMeta.type, t.icon])
);
