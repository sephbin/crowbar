---
name: brp-check
description: Check BRP (Basic Roleplaying) characters, NPCs, weapons and spells against the rulebook for the Ultima Thule campaign. Use when building or reviewing pregens, NPCs or stat blocks.
---

# BRP rules check

All paths are relative to `ultima-thule/`; run commands from there.

1. Make sure the rulebook text exists: if `rules/pages/` is empty, run `python tools/extract_rules.py`. If the PDF is missing, ask Andrew to copy it to `rules/BRP_Core_Rulebook.pdf`.
2. Put the character or NPC in a JSON file under `data/` using the existing files as the schema (`data/pcs/*.json` for PCs, `data/npcs/zealots.json` for NPC groups).
3. Run `python tools/brp_check.py <files>`. Fix every ERROR. Read every WARN and either resolve it or record the ruling in the file's `behaviour` or `notes`.
4. For anything the script doesn't cover, grep `rules/pages/` and quote the page number in your answer. Never state a rule from memory. Flame is printed as Fire (p.62); Control costs 3 PP per level (p.60). Known traps from earlier sessions: this edition uses CHA (not APP); there is no Stun spell; Knowledge is not the casting skill (each spell is its own skill); Fate points are spent from power points; Dispel cannot reliably banish a high-POW daemon.
5. If a weapon, armour or spell is missing from the tables in `tools/brp_check.py`, add it from Chapter Eight (weapons and armour) or pp.59-64 (spells) and note the page in a comment.
6. For NPCs facing Heroic PCs, compare their key skills and damage with the party's (Vesna crossbow 85, Oskar Dodge 80, Imre Blast 75) and say whether the fight is a speed bump, a threat or a TPK risk. The bestiary is built for Normal campaigns; raise threat with numbers, gear or armour (p.246).
7. If a PC changes, update the matching sheet in `sheets/` (its data is embedded in the file) and run `node tools/sheet_smoke.js sheets/*.html`.
8. Player sheets must not contain plot hooks or spoilers.
