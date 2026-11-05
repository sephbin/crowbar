"""Add the moves every PC has (Book I, "The moves", pp. 70-85: basic, special, follower, expedition, homefront...) to the
pack as `moves`: [{group, items: [blocks]}]. Run it after extract_playbooks.py, which rewrites the pack from scratch.

    python tools/extract_moves.py <Book I 1-up PDF> [pack.json]

Each move is printed in a ruled box, two columns to a page; the text inside a box is parsed with the playbook extractor,
so the blocks are in the same format. Group headings are the 12pt Avara lines between the boxes.
"""
import sys, os, re, json
import fitz
sys.path.insert(0, os.path.dirname(__file__))
import extract_playbooks as X
import extract_inserts          # noqa: F401  (headings with an aside: "PERSUADE (vs. NPCs)")

FIRST, LAST = 70, 85          # printed page numbers = PDF page index + 1


def markers(page):
    """The playbook markers, plus the book's list bullets, which are a little taller than the playbooks' (5.7pt)."""
    out = X.markers(page)
    for d in page.get_drawings():
        r, f = d["rect"], d.get("fill")
        if f and max(f) < 0.25 and 4.4 <= r.width <= 6 and 5.6 < r.height <= 6 and len(d["items"]) >= 15:
            out.append({"k": "num", "x0": r.x0, "x1": r.x1, "cy": (r.y0 + r.y1) / 2})
    return out


def tidy(blocks):
    """Stat options ("... +STR to power through ... +DEX to ...") run together in the text: one paragraph each."""
    for b in blocks:
        if b["t"] != "item":
            continue
        body = []
        for x in b["body"]:
            parts = re.split(r" (?=\.\.\. \+[A-Z]{3})", x.get("html", "")) if x["t"] == "p" else [None]
            body += [x] if len(parts) < 2 else [{"t": "p", "html": t} for t in parts]
        b["body"] = body
    return blocks


def page_moves(page):
    seen, boxes = set(), []
    for d in page.get_drawings():
        r = d["rect"]
        k = tuple(round(v) for v in r)
        if r.width > 100 and r.height > 30 and k not in seen:
            seen.add(k); boxes.append(r)
    lines = [X.classify(l) for l in X.attach_markers(X.lines_of(page), markers(page))]
    heads = []
    for b in page.get_text("dict")["blocks"]:
        for ln in b.get("lines", []):
            s = ln["spans"][0]
            if "Avara" in s["font"] and 11 <= s["size"] <= 14:
                heads.append({"x0": ln["bbox"][0], "y0": ln["bbox"][1], "group": "".join(x["text"] for x in ln["spans"]).strip()})
    found, used = [], set()
    boxes.sort(key=lambda r: -r.width * r.height)       # a box drawn inside another (or twice) gets no lines of its own
    heads = [hd for hd in heads if not any(r.x0 <= hd["x0"] <= r.x1 and r.y0 <= hd["y0"] <= r.y1 for r in boxes)]
    for r in boxes:
        inside = [l for l in lines if r.x0 - 1 <= l["x0"] <= r.x1 and r.y0 - 1 <= l["y0"] <= r.y1 and id(l) not in used]
        used.update(id(l) for l in inside)
        mid = (r.x0 + r.x1) / 2
        half = (lambda l: l["x0"] >= mid - 4) if r.width > 250 else (lambda l: False)     # a full-width box has two columns of its own
        bl = tidy(X.blocks_of(sorted(inside, key=lambda l: (half(l), l["y0"], l["x0"]))))
        if bl and bl[0]["t"] == "sec":       # a box with a heading of its own ("Seasonal gains") is a move-like card
            bl = [{"t": "item", "mk": [], "head": bl[0]["title"].upper(), "body": bl[1:]}]
        if bl:
            found.append({"x0": r.x0, "y0": r.y0, "blocks": bl})
    found += heads
    found.sort(key=lambda f: (X.col_of(f["x0"]), f["y0"]))
    return found


def dedouble(s):
    s = s.strip()
    w = s.split()
    n = len(w) // 2
    return " ".join(w[:n]) if len(w) % 2 == 0 and w[:n] == w[n:] else s


def main():
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "..", "pack", "stonetop-pack.json")
    pack = json.load(open(out, encoding="utf-8"))
    d = fitz.open(src)
    groups, cur = [], None
    for i in range(FIRST - 1, LAST):
        for f in page_moves(d[i]):
            if "group" in f:
                cur = {"group": f["group"], "items": []}
                groups.append(cur)
            elif cur is not None:
                cur["items"].extend(f["blocks"])
    for g in groups:
        for b in g["items"]:
            if b["t"] == "item":
                b["head"] = dedouble(b["head"])     # a heading the book prints twice, one over the other
    pack["moves"] = [g for g in groups if g["items"]]
    json.dump(pack, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    for g in groups:
        print(f"  {g['group']}: " + ", ".join(b.get("head", "?" + b["t"]) for b in g["items"] if b["t"] == "item"))


if __name__ == "__main__":
    main()
