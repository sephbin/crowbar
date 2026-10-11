#!/usr/bin/env python3
"""Extract the BRP rulebook PDF into one text file per page for grepping.

Usage: python3 tools/extract_rules.py [rules/BRP_Core_Rulebook.pdf]
Writes rules/pages/pdf-NNN_book-MMM.txt (book page = PDF page - 5) and rules/brp_all.txt.
Needs pdftotext (poppler-utils): brew install poppler / apt install poppler-utils.
"""
import os, subprocess, sys
pdf = sys.argv[1] if len(sys.argv) > 1 else "rules/BRP_Core_Rulebook.pdf"
if not os.path.exists(pdf):
    sys.exit(f"Missing {pdf}. Copy the BRP Core Rulebook PDF there first.")
os.makedirs("rules/pages", exist_ok=True)
subprocess.run(["pdftotext", pdf, "rules/brp_all.txt"], check=True)
pages = open("rules/brp_all.txt", encoding="utf-8", errors="replace").read().split("\f")
for i, text in enumerate(pages, start=1):
    if text.strip():
        open(f"rules/pages/pdf-{i:03d}_book-{i-5:03d}.txt", "w", encoding="utf-8").write(text)
print(f"Wrote {len(pages)} pages to rules/pages/")
