#!/usr/bin/env python3
"""Wire sheets/race.js into the player sheets: load it, run the picker before the first render,
and replace numbers that a race can change (Move, spell limits, DEX rank) with live values. Safe to re-run.

Usage: python tools/add_race_picker.py sheets/*.html
"""
import sys, pathlib

CSS = """
/* Race picker */
.racelist{display:grid;gap:8px;margin-top:12px}
.raceopt{all:unset;cursor:pointer;display:grid;gap:2px;padding:12px 14px;border:1.5px solid var(--ink);border-radius:12px}
.raceopt b{font:400 20px/1.15 var(--display)}
.raceopt span{font:12px/1.4 var(--num);color:var(--muted)}
.raceopt:hover,.raceopt:focus-visible{border-color:var(--oxblood);box-shadow:0 0 0 1px var(--oxblood) inset}
"""
EDITS = [
    # load the picker and let it run before the first render
    ("<script>\nconst SK", '<script src="race.js"></script>\n<script>\nconst SK'),
    ("render(ONLY);\n</script>", "RacePicker.init(CH[0],SK[CH[0].key],()=>render(ONLY));\n</script>"),
    # race in the role line, live Move, lineage row
    ("el(\"div\",{class:\"role\"},`${ch.role}", "el(\"div\",{class:\"role\"},`${ch.race?ch.race+\" · \":\"\"}${ch.role}"),
    ('el("dt",{},"Move"),el("dd",{},"10"),',
     'el("dt",{},"Move"),el("dd",{},String(ch.move||10)),...(ch.raceNote?[el("dt",{},"Lineage"),el("dd",{},ch.raceNote)]:[]),'),
    # numbers that follow INT and DEX
    ('el("small",{},"max level 8 · memorises 8 spells")',
     'el("small",{},`max level ${Math.ceil(c.INT/2)} · memorises ${Math.ceil(c.INT/2)} spells`)'),
    ('"One spell per round. Each level delays the cast by 1 DEX rank (DEX 11).',
     '`One spell per round. Each level delays the cast by 1 DEX rank (DEX ${c.DEX}).'),
    ('Resistance rolls: 50% + (active − passive) × 5."));', 'Resistance rolls: 50% + (active − passive) × 5.`));'),
]

for f in map(pathlib.Path, sys.argv[1:]):
    s = f.read_text(encoding="utf-8")
    if 'src="race.js"' in s:
        print("already done", f.name); continue
    for old, new in EDITS:
        if old not in s:
            raise SystemExit(f"{f.name}: expected text not found: {old[:60]}")
        s = s.replace(old, new, 1)
    i = s.index("</style>")
    s = s[:i] + CSS + s[i:]
    f.write_text(s, encoding="utf-8", newline="\n")
    print("patched", f.name)
