"""Add playbook inserts (Stonetop_Playbook_inserts.pdf) to the pack. So far only the Lightbearer's Invocations
(page 1, right half). Run it after extract_playbooks.py, which rewrites the pack from scratch.

    python tools/extract_inserts.py <Stonetop_Playbook_inserts.pdf> [pack.json]

Each insert is {id, playbook, title, note, intro: [blocks], cols: [[blocks], [blocks]]}, in the same block format as the
playbooks; the sheet shows it under the moves of that playbook, with a box per entry to tick the ones the character knows.
"""
import sys, os, re, json
import fitz
sys.path.insert(0, os.path.dirname(__file__))
import extract_playbooks as X

_classify = X.classify


def classify(ln):
    """A heading may end in an italic aside: "BLINDING LIGHT (ongoing)"."""
    ln = _classify(ln)
    if ln["kind"] == "text":
        solid = [c for c in ln["chars"] if c["c"].strip() and not c.get("mk")]
        cut = next((i for i, c in enumerate(solid) if c["c"] == "("), None)
        head = solid[:cut] if cut else []
        txt = "".join(c["c"] for c in head)
        if head and all(c["b"] for c in head) and txt.upper() == txt and re.search(r"[A-Z]{3}", txt) and ln["text"].endswith(")"):
            ln["kind"] = "head"
    return ln


X.classify = classify


def invocations(page):
    cols = X.parse_page(page, 0, 999, 410)
    left, right = cols[2], cols[3]
    head = left[0]
    intro = []
    while len(left) > 1 and left[1]["t"] == "p":
        intro.append(left.pop(1))
    left.pop(0)
    return {"id": "invocations", "playbook": "the-lightbearer", "title": head["title"], "note": head.get("note", ""),
            "intro": intro, "cols": [left, right]}


def main():
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "..", "pack", "stonetop-pack.json")
    pack = json.load(open(out, encoding="utf-8"))
    d = fitz.open(src)
    ins = [invocations(d[0])]
    pack["inserts"] = ins
    json.dump(pack, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    for i in ins:
        n = sum(1 for c in i["cols"] for b in c if b["t"] == "item")
        print(f"  {i['title']} ({i['playbook']}): {n} entries -> {out}")


if __name__ == "__main__":
    main()
