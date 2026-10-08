# crowbar

ttrpg management and tools

A local WYSIWYG markdown editor with Claude AI integration, built for managing TTRPG content (NPCs, locations, sessions, etc.).

## Features

- **Live preview** — markdown renders inline as you type (Obsidian-style)
- **NPC stat cards** — YAML frontmatter with `type: npc` renders as a styled stat block
- **Claude integration** — select any text, type an instruction, Claude rewrites it in-place with streaming
- **Multi-system** — flexible frontmatter, works with D&D 5e, Pathfinder 2e, or any custom system
- **Vault file browser** — sidebar with auto-refresh when files change externally

## Quick start

```bash
npm install
npm run dev
```

Then open **http://localhost:5174**.

By default your vault is at `~/crowbar-vault`. Change it by creating a `.env` file:

```
CROWBAR_VAULT_PATH=C:\Users\You\Documents\my-campaign
```

## NPC frontmatter

```yaml
---
type: npc
name: Valdris Ironmaw
system: d&d5e
race: Dwarf
class: Fighter
level: 5
hp: 52
ac: 18
speed: 30ft
str: 18
dex: 10
con: 16
int: 10
wis: 12
cha: 8
attacks:
  - { name: Battleaxe, bonus: "+7", damage: "1d8+4 slashing" }
traits:
  - Stonecunning
tags: [blacksmith, veteran]
---
```

When the cursor is outside the frontmatter block, it renders as a stat card. Click into it to edit the raw YAML.

## Production

```bash
npm run build
npm start
```
