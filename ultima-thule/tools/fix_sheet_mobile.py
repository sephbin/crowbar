#!/usr/bin/env python3
"""One-off mobile fix for the player sheets: proper document head with a viewport meta,
weapons table as stacked cards on phones, larger touch targets. Safe to re-run.

Usage: python tools/fix_sheet_mobile.py sheets/*.html
"""
import sys, pathlib

HEAD = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n')

MOBILE_CSS = """
/* Phones: weapons as cards, bigger touch targets */
@media (max-width:640px){
  .scroll{overflow-x:visible}
  .weap{min-width:0}
  .weap thead{display:none}
  .weap tbody{display:block}
  .weap tr{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px 10px;padding:10px 0;border-bottom:1px solid var(--rule)}
  .weap td{border:0;padding:0;min-width:0;overflow-wrap:anywhere}
  .weap td:first-child{grid-column:1/-1;font-weight:700}
  .weap td:first-child .sp{font-weight:400}
  .weap td:nth-child(n+2)::before{display:block;font:600 10px/1.3 var(--num);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
  .weap td:nth-child(2)::before{content:"skill"}
  .weap td:nth-child(3)::before{content:"damage"}
  .weap td:nth-child(4)::before{content:"range"}
  .weap td:nth-child(5)::before{content:"attacks"}
  .weap td:nth-child(6)::before{content:"hands"}
  .weap td:nth-child(7)::before{content:"hp"}
  .weap td:nth-child(8)::before{content:"parry"}
  .derived{grid-template-columns:repeat(2,1fr)}
  .chars td,.chars th{padding:6px 4px}
  .grades{grid-template-columns:repeat(3,1fr)}
  .grades .reg{grid-column:1/-1}
  dl.kv{grid-template-columns:minmax(0,auto) minmax(0,1fr)}
  dl.kv dd{overflow-wrap:anywhere}
  .rd{max-width:100%}
  .skillhead{flex-direction:column;align-items:stretch}
  .skillhead .bar{flex:none!important}
  nav.tabs{flex-wrap:wrap;overflow-x:visible}
}
@media (pointer:coarse){
  .sk{grid-template-columns:1fr auto 36px;padding:5px 0}
  .xp{width:32px;height:32px}
  .pip,body .pip{min-width:40px;width:40px;height:40px}
  nav.tabs button{padding:12px 12px;font-size:13px}
}
"""
MARK = "/* Phones: weapons as cards"

for f in map(pathlib.Path, sys.argv[1:]):
    s = f.read_text(encoding="utf-8").lstrip("﻿")
    if not s.lstrip().lower().startswith("<!doctype"):
        s = HEAD + s
        s = s.replace("</style>\n", "</style>\n</head>\n<body>\n", 1)
        s = s.rstrip() + "\n</body>\n</html>\n"
    if MARK in s:  # replace an earlier version of the block (it always sits last in the stylesheet)
        s = s[:s.index(MARK) - 1] + s[s.index("</style>"):]
    i = s.index("</style>")
    s = s[:i] + MOBILE_CSS + s[i:]
    f.write_text(s, encoding="utf-8", newline="\n")
    print("fixed", f.name)
