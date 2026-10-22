"""Add the major arcana (Book II, appendix D: a front and a back page for each) to the data pack.

    python tools/extract_arcana.py <Book II 1-up PDF> [pack.json]

Needs PyMuPDF. Reads each arcanum into { id, name, tags, front: [blocks], back: [blocks] } under pack["arcana"],
using the playbook extractor's block format (sec, item, p; <b>, <i> and the tokens {box} {circ} {dia}).
Run it after extract_playbooks.py, which writes the pack from scratch.
"""
import sys, os, re, json
import fitz
import extract_playbooks as ep

ep.COLS = [(0, 10000)]          # appendix pages are one column
HEADER = "appendix d : major arcana"
BODY = (62, 548)                # between the running header and the front/back footer


def lines_of(page):
    """Like the playbook extractor's, but a ZapfDingbats 'l' is a circle to mark."""
    res = []
    for b in page.get_text("rawdict")["blocks"]:
        if b["type"]:
            continue
        for l in b["lines"]:
            chars = []
            for s in l["spans"]:
                bold = bool(s["flags"] & 16) or "Bold" in s["font"]
                ital = bool(s["flags"] & 2) or "Ital" in s["font"]
                sec, zapf = ep.SEC_FONT in s["font"], "Zapf" in s["font"]
                for c in s["chars"]:
                    ch = " " if c["c"] in "\t " else c["c"]
                    ch = ("{pip}" if ch == "l" else "{ic}") if zapf and ch.strip() else ch
                    chars.append({"c": ch, "x0": c["bbox"][0], "x1": c["bbox"][2], "b": bold, "i": ital, "sec": sec,
                                  "size": s["size"], **({"mk": True} if ch == "{pip}" else {})})
            if any(c["c"].strip() for c in chars):
                x0, y0, x1, y1 = l["bbox"]
                res.append({"x0": x0, "y0": y0, "y1": y1, "chars": chars})
    return res


def page_blocks(page):
    lines = [l for l in lines_of(page) if BODY[0] <= l["y0"] <= BODY[1]]
    mks = [m for m in ep.markers(page) if BODY[0] <= m["cy"] <= BODY[1]]
    lines = [ep.classify(l) for l in ep.attach_markers(lines, mks)]
    return ep.blocks_of(sorted(lines, key=lambda l: (l["y0"], l["x0"])))


def arcanum(front, back):
    fb, bb = page_blocks(front), page_blocks(back)
    name = fb.pop(0)["title"]
    tags = fb.pop(0)["html"]                 # "{dia} {dia} , reach, magical": a diamond for each point of load, then the tags
    load = tags.count("{dia}")
    tags = re.sub(r"</?[bi]>|\{dia\}", "", tags).strip().lstrip(",").strip()
    tags, *lead = re.split(r"(?<=magical)\s+(?=[A-Z])", tags, 1)      # a description that wrapped up into the tag line
    if lead:
        fb.insert(0, {"t": "p", "html": lead[0]})
    return {"id": re.sub(r"[^a-z]+", "-", name.lower()).strip("-"), "name": name, "load": load,
            "tags": re.sub(r"\s*,\s*", ", ", tags), "front": fb, "back": bb}


def main():
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "..", "pack", "stonetop-pack.json")
    d = fitz.open(src)
    pages = [p for p in d if HEADER in p.get_text()]
    arcana = [arcanum(f, b) for f, b in zip(pages[0::2], pages[1::2])]
    pack = json.load(open(out, encoding="utf-8"))
    pack["arcana"] = arcana
    json.dump(pack, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{len(arcana)} major arcana -> {out}")
    for a in arcana:
        print(f"  {a['name']:32} load {a['load']}  {a['tags']}")


if __name__ == "__main__":
    main()
