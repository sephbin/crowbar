#!/usr/bin/env python3
"""Embed data/npcs/zealots.json into gm/tram-job.html so the page works offline and on GitHub Pages.

Usage: python3 tools/sync_gm.py
"""
import json, re, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
data = json.loads((root / "data/npcs/zealots.json").read_text(encoding="utf-8"))
page = root / "gm/tram-job.html"
html = page.read_text(encoding="utf-8")
blob = json.dumps(data, ensure_ascii=False, indent=1).replace("</", "<\\/")
new, n = re.subn(r'(<script id="npc-data" type="application/json">).*?(</script>)',
                 lambda m: m.group(1) + "\n" + blob + "\n" + m.group(2), html, flags=re.S)
if n != 1:
    raise SystemExit("npc-data block not found in gm/tram-job.html")
page.write_text(new, encoding="utf-8")
print(f"Embedded {len(data['npcs'])} NPC entries into {page.relative_to(root)}")
