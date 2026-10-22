"""Turn the Stonetop individual playbook PDFs (two letter-landscape pages each) into a data pack the sheet page loads.

    python tools/extract_playbooks.py <folder or .zip of "Playbook - The X.pdf"> [out.json]

Needs PyMuPDF (pip install pymupdf). The output (pack/stonetop-pack.json) holds the playbook text, so it is gitignored:
send that one file to the players, who load it into the sheet page (it is kept in their browser).

All nine playbooks share one layout, so the extraction is by region, not by playbook:
  page 1: four columns (A story, B introductions, C title/blurb/background, D instinct/appearance/origin);
  page 2: stats band (drawn by the sheet itself), possessions (top right), then four columns of moves under "Moves".
Checkboxes, diamonds and circles are vector drawings, found by shape and put back into the text where they stood.
Text comes out as blocks: sec (heading), step (numbered), item (heading + body), p (paragraph); inline markup is
<b>, <i> and the tokens {box} {circ} {dia}; the sheet gives each token its own saved state.
"""
import sys, os, re, json, glob, zipfile, tempfile
import fitz

COLS = [(0, 198), (198, 418), (418, 594), (594, 800)]
PARA_GAP = 12.6          # baseline gap above which a new paragraph starts (body text is ~9.6 apart)
SEC_FONT = "Avara"


def col_of(x):
    for i, (a, b) in enumerate(COLS):
        if a <= x < b:
            return i
    return len(COLS) - 1


def straight(curve):
    """True when a bezier item is really a straight line (control points collinear with the ends)."""
    _, a, b, c, e = curve
    return all(abs((q.x - a.x) * (e.y - a.y) - (q.y - a.y) * (e.x - a.x)) < 0.05 for q in (b, c))


def markers(page):
    """Checkbox / circle / diamond drawings, by their path shape (they are all about 6pt across)."""
    out = []
    for d in page.get_drawings():
        r = d["rect"]
        f = d.get("fill")
        if f and max(f) < 0.25 and 4.4 <= r.width <= 5.6 and 4.4 <= r.height <= 5.6 and len(d["items"]) >= 15:
            out.append({"k": "num", "x0": r.x0, "x1": r.x1, "cy": (r.y0 + r.y1) / 2})      # numbered option bullet
            continue
        if not (4.8 <= r.width <= 6.4 and 4.8 <= r.height <= 6.4) or d.get("color") is None:
            continue
        ops = "".join(i[0] for i in d["items"])
        kind = {"llclllll": "box", "llllllll": "box", "clclclcl": "box", "cccc": "circ", "cccl": "dia", "cllc": "dia"}.get(ops)
        if ops == "cccc" and all(straight(i) for i in d["items"]):       # some diamonds are four "curves" whose control points lie on a line
            kind = "dia"
        if kind:
            out.append({"k": kind, "x0": r.x0, "x1": r.x1, "cy": (r.y0 + r.y1) / 2})
    return out


def lines_of(page):
    res = []
    for b in page.get_text("rawdict")["blocks"]:
        if b["type"]:
            continue
        for l in b["lines"]:
            chars = []
            for s in l["spans"]:
                bold = bool(s["flags"] & 16) or "Bold" in s["font"]
                ital = bool(s["flags"] & 2) or "Ital" in s["font"]
                sec = SEC_FONT in s["font"]
                zapf = "Zapf" in s["font"]
                for c in s["chars"]:
                    ch = c["c"]
                    if ch in "\t ":
                        ch = " "
                    chars.append({"c": "{ic}" if zapf and ch.strip() else ch, "x0": c["bbox"][0], "x1": c["bbox"][2],
                                  "b": bold, "i": ital, "sec": sec, "size": s["size"]})
            if not any(c["c"].strip() for c in chars):
                continue
            x0, y0, x1, y1 = l["bbox"]
            res.append({"x0": x0, "y0": y0, "y1": y1, "chars": chars})
    return res


def attach_markers(lines, mks):
    """Put each marker into the line whose middle is nearest to it, as a char at the right place. A tick (ZapfDingbats 4)
    under a box means the box comes ticked ("boxc"); under a circle it is a drawn pip ("pip") and is not clickable.
    Markers left of a line's text (the indent is tabs, which have no width) match within 30pt, never across a column edge (a heading's
    right-hand circles at the foot of one column are not the first line of the next); a write-in box far
    from its label ("[ ] ____ (discuss with GM)") or marks at the right end of a heading (the Unstoppable circles) are
    matched in a second, looser pass that stays inside the column."""
    left_over = []
    for reach in (30, 130):
        for m in (mks if reach == 30 else left_over):
            best, bd = None, 99
            for ln in lines:
                if not (ln["y0"] - 2.5 <= m["cy"] <= ln["y1"] + 2.5):
                    continue
                right = max(c["x1"] for c in ln["chars"]) + (4 if reach == 30 else 200)
                if m["x0"] < ln["x0"] - reach or m["x0"] > right or col_of((m["x0"] + m["x1"]) / 2) != col_of(ln["x0"]):
                    continue
                d = abs((ln["y0"] + ln["y1"]) / 2 - m["cy"])
                if d < bd:
                    best, bd = ln, d
            if not best:
                if reach == 30:
                    left_over.append(m)
                continue
            chars, kind = best["chars"], m["k"]
            zap = [c for c in chars if c["c"] == "{ic}" and c["x1"] > m["x0"] - 1 and c["x0"] < m["x1"] + 1]
            if zap:
                kind = {"box": "boxc", "circ": "pip"}.get(kind, kind)
                for c in zap:
                    chars.remove(c)
            at = next((i for i, c in enumerate(chars) if c["c"].strip() and c["x0"] >= m["x0"] - 0.5), len(chars))
            chars.insert(at, {"c": "{" + kind + "}", "x0": m["x0"], "x1": m["x1"], "b": False, "i": False, "sec": False,
                              "size": 8, "mk": True})
    for ln in lines:
        for c in ln["chars"]:
            if c["c"] == "{ic}":
                c["c"] = "✔"
    return lines


def html_of(chars):
    out, b, i = [], False, False
    for c in chars:
        t = c["c"]
        if t.strip() == "" and not out:
            continue
        if t.strip() == "" or c.get("mk"):
            want_b, want_i = b, i      # spaces and markers sit inside whatever style is open
        else:
            want_b, want_i = c["b"], c["i"]
        if i and not want_i:
            out.append("</i>"); i = False
        if b and not want_b:
            if i:
                out.append("</i>"); i = False
            out.append("</b>"); b = False
        if want_b and not b:
            out.append("<b>"); b = True
        if want_i and not i:
            out.append("<i>"); i = True
        out.append(t)
    if i:
        out.append("</i>")
    if b:
        out.append("</b>")
    s = "".join(out)
    s = re.sub(r"­\s*(?=\S)", "", s)   # soft hyphens the book leaves mid-word ("Stone- top"); one ending a line is join()'s to resolve
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"<(b|i)>\s*</\1>", "", s)
    s = re.sub(r"\s*(\{(?:box|boxc|circ|pip|dia|num)\})\s*", r" \1 ", s).strip()
    return s


def plain(chars):
    return re.sub(r"\s+", " ", "".join(c["c"] for c in chars if not c.get("mk"))).strip()


def classify(ln):
    chars = ln["chars"]
    solid = [c for c in chars if c["c"].strip() and not c.get("mk")]
    lead = next((c for c in chars if c["c"].strip()), None)
    ln["lead_mk"] = bool(lead and lead.get("mk"))
    ln["lead_inline"] = bool(lead and lead.get("mk") and lead["c"] in ("{dia}", "{circ}", "{pip}"))      # a diamond or circle inside a sentence, not a list marker
    txt = plain(chars)
    ln["text"] = txt
    sec = [c for c in solid if c["sec"]]
    if sec and solid[0]["sec"]:
        ln["kind"] = "step" if len(sec) <= 2 and sec[0]["c"].isdigit() and sec[0]["size"] < 9.5 else "sec"
    elif solid and all(c["b"] for c in solid) and len(txt) >= 3 and txt.upper() == txt and re.search(r"[A-Z]{3}", txt):
        ln["kind"] = "head"
    else:
        ln["kind"] = "text"
    return ln


def strip_tags(s):
    return re.sub(r"</?[bi]>", "", s)


def join(a, b):
    bare = strip_tags(a)
    if bare.endswith("­"):        # a word the book broke at the line end ("Chron- icle") goes back together
        a = re.sub("­((?:</[bi]>)*)$", r"\1", a)
        return a + b if re.match(r"(<[^>]+>)*[a-z]", b) else a + " " + b
    w = re.search(r"(\w{4,})$", bare)
    if w and re.match(r"(<[^>]+>)*" + re.escape(w.group(1)) + r"[.,;:]", b):      # the book prints "honest / honest." once
        return re.sub(re.escape(w.group(1)) + r"((?:</[bi]>)*)$", lambda m: m.group(1), a).rstrip() + " " + b
    if re.search(r"[A-Za-z]-$", bare) and re.match(r"(<[^>]+>)*[a-z]", b) and not re.search(r"(hand|to|self|well|ne’er|do|half|ill)-$", bare):
        return re.sub(r"-((</[bi]>)*)$", r"\1", a) + b
    if re.search(r"(self|well|ne’er|do|half|ill)-$", bare) and re.match(r"(<[^>]+>)*[a-z]", b):      # a compound split at its hyphen
        return a + b
    return a + " " + b


def blocks_of(lines):
    """One column's lines, top to bottom, into blocks."""
    blocks, cur, prev, nth = [], None, None, 0
    for ln in lines:
        k = ln["kind"]
        gap = ln["y0"] - prev["y0"] if prev else 99
        if k == "sec":
            title = strip_tags(html_of([c for c in ln["chars"] if c["sec"]]))
            note = html_of([c for c in ln["chars"] if not c["sec"]])
            if blocks and blocks[-1]["t"] == "sec" and gap <= 16 and not note and not blocks[-1].get("note"):
                blocks[-1]["title"] += " " + title
            else:
                blocks.append({"t": "sec", "title": title, **({"note": note} if note else {})})
            cur = None
        elif k == "step":
            n = "".join(c["c"] for c in ln["chars"] if c["sec"]).strip()
            cur = {"t": "step", "n": int(n), "html": html_of([c for c in ln["chars"] if not c["sec"]])}
            blocks.append(cur)
        elif k == "head":
            first = next(i for i, c in enumerate(ln["chars"]) if c["c"].strip() and not c.get("mk"))
            kinds = lambda cs: [c["c"][1:-1] for c in cs if c.get("mk")]
            item = {"t": "item", "mk": kinds(ln["chars"][:first]),
                    "head": strip_tags(html_of([c for c in ln["chars"] if not c.get("mk")])), "body": []}
            if kinds(ln["chars"][first:]):
                item["tail"] = kinds(ln["chars"][first:])      # e.g. the five Death's Door circles after UNSTOPPABLE
            blocks.append(item)
            cur = None
        else:
            html = html_of(ln["chars"])
            runs_on = ln["lead_inline"] and cur is not None and not re.search(r"[.?!:]\s*(</[bi]>)*$", cur["html"])
            if cur is not None and gap <= PARA_GAP and (not ln["lead_mk"] or runs_on):
                cur["html"] = join(cur["html"], html)
            else:
                if html.startswith("{num}"):
                    nth += 1
                    html = "{n%d}" % nth + html[5:]
                else:
                    nth = 0
                cur = {"t": "p", "html": html}
                owner = blocks[-1] if blocks and blocks[-1]["t"] == "item" else None
                (owner["body"] if owner else blocks).append(cur)
        prev = ln
    for b in blocks:
        for x in (b["body"] if b["t"] == "item" else []) + [b]:
            if "html" in x:
                x["html"] = x["html"].replace("­", "")
    for k, b in enumerate(blocks):
        if b["t"] != "item":
            continue
        # circles on their own line after a move's text belong at the end of a heading ("UP WITH PEOPLE OO|O"); the line
        # sorts just above that heading, so one with a divider in it goes to the move that follows
        keep = []
        for x in b["body"]:
            h = x.get("html", "")
            if h and re.fullmatch(r"(\{circ\} *|\| *)+", h) and "{circ}" in h:
                to = blocks[k + 1] if "|" in h and k + 1 < len(blocks) and blocks[k + 1]["t"] == "item" else b
                to.setdefault("tail", []).extend("bar" if t == "|" else "circ" for t in re.findall(r"\{circ\}|\|", h))
            else:
                keep.append(x)
        b["body"] = keep
    return blocks


def parse_page(page, y_from, y_to, x_from=0, title=''):
    lines = [classify(l) for l in attach_markers(lines_of(page), markers(page))
             if y_from <= l["y0"] < y_to and l["x0"] >= x_from - 1]
    cols = [[] for _ in COLS]
    for l in lines:
        if l["kind"] == "sec" and l["text"].startswith("Moves"):
            continue
        cols[col_of(l["x0"])].append(l)
    out = [blocks_of(sorted(c, key=lambda l: (l["y0"], l["x0"]))) for c in cols]
    for col in out:      # the page title and the "I am called..." box are the sheet's own name field
        col[:] = [b for b in col if not (b["t"] == "sec" and b["title"] == title)
                  and not (b["t"] == "p" and b["html"].startswith("I am called"))]
    return out


def playbook(path):
    d = fitz.open(path)
    p1, p2 = d[0], d[1]
    title = next(l for l in lines_of(p1) if l["chars"][0]["size"] > 20)
    pname = plain(title["chars"])
    L2 = [classify(l) for l in attach_markers(lines_of(p2), markers(p2))]
    sec = lambda start: next((l for l in L2 if l["kind"] == "sec" and l["text"].startswith(start)), None)
    moves_l = sec("Moves")
    t2 = p2.get_text()
    return {
        "id": re.sub(r"[^a-z]+", "-", pname.lower()).strip("-"),
        "name": pname,
        "die": (re.search(r"\n(d\d+)\n", t2) or [None, "d6"])[1],
        "hpMax": int((re.search(r"HP \(max (\d+)\)", t2) or [None, 18])[1]),
        "statsNote": re.sub(r"^Stats\s*", "", sec("Stats")["text"]),
        "movesNote": re.sub(r"^Moves\s*", "", moves_l["text"]),
        "possNote": re.sub(r"^Special possessions\s*", "", (sec("Special possessions") or {"text": ""})["text"]),
        "page1": parse_page(p1, 0, 999, title=pname),
        "possessions": parse_page(p2, 0, moves_l["y0"] - 3, 420),
        "moves": parse_page(p2, moves_l["y0"] - 3, 999),
    }


def main():
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "..", "pack", "stonetop-pack.json")
    if src.lower().endswith(".zip"):
        tmp = tempfile.mkdtemp(prefix="stonetop-")
        zipfile.ZipFile(src).extractall(tmp)
        src = tmp
    files = sorted(f for f in glob.glob(os.path.join(src, "**", "Playbook - *.pdf"), recursive=True) if "__MACOSX" not in f)
    pbs = [playbook(f) for f in files]
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    json.dump({"format": "stonetop-pack", "version": 1, "playbooks": pbs}, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{len(pbs)} playbooks -> {out}")
    n = lambda cols: sum(len(c) for c in cols)
    for p in pbs:
        print(f"  {p['name']:18} {p['die']:4} hp{p['hpMax']:3}  page1 {n(p['page1']):3}  poss {n(p['possessions']):3}  moves {n(p['moves']):3}")


if __name__ == "__main__":
    main()
