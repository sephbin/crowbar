import json, sys
pack = json.load(open(sys.argv[1], encoding="utf-8"))["playbooks"]
p = next(x for x in pack if sys.argv[2].lower() in x["name"].lower())
def show(bs, ind=0):
    for b in bs:
        t = b["t"]
        if t == "item": print(" " * ind + "ITEM", b["mk"], b["head"]); show(b["body"], ind + 4)
        elif t == "sec": print(" " * ind + "SEC", b["title"], "|", b.get("note", ""))
        elif t == "step": print(" " * ind + "STEP", b["n"], b["html"])
        else: print(" " * ind + "P", b["html"])
for name in sys.argv[3:] or ("page1", "possessions", "moves"):
    for i, c in enumerate(p[name]):
        if c: print("=====", name, i); show(c)
