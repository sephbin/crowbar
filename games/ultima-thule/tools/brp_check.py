#!/usr/bin/env python3
"""Rules checker for BRP (Universal Game Engine) characters and NPCs.

Usage:
  python3 tools/brp_check.py data/pcs/*.json data/npcs/*.json

PC files ("type": "pc") are checked against full character-creation budgets.
NPC files ("type": "npc_group") are checked for derived values, weapon damage,
spell legality and power-point budgets. Page numbers refer to the printed book.
Exit code 1 if any ERROR is found.
"""
import json, math, sys

# ---- Rules data (see rules/RULES_DIGEST.md for sources) ----------------------
COST = {"STR": 1, "CON": 1, "SIZ": 1, "CHA": 1, "DEX": 3, "INT": 3, "POW": 3}   # p.17
POINT_BUY = {"Normal": 24, "Heroic": 36, "Epic": 48, "Superhuman": 60}          # p.17
PROF_POINTS = {"Normal": 250, "Heroic": 325, "Epic": 400, "Superhuman": 500}     # p.11
SKILL_CAP = {"Normal": 75, "Heroic": 90, "Epic": 101, "Superhuman": 10**6}       # p.11
AGE_POINTS = {"Normal": 20, "Heroic": 30, "Epic": 40, "Superhuman": 40}          # p.10
START_SPELLS = {"Normal": 4, "Heroic": 6, "Epic": 8, "Superhuman": 10}           # p.58

BASE = {  # pp.35-36; functions take characteristics
    "Appraise": 15, "Bargain": 5, "Brawl": 25, "Climb": 40, "Command": 5, "Craft": 5,
    "Disguise": 1, "Dodge": lambda c: c["DEX"] * 2, "Drive": 20, "Etiquette": 5,
    "Fast Talk": 5, "Fine Manipulation": 5, "First Aid": 30, "Gaming": lambda c: c["INT"] + c["POW"],
    "Grapple": 25, "Hide": 10, "Insight": 5, "Jump": 25, "Knowledge": 5,
    "Language (Own)": lambda c: c["INT"] * 5, "Language (Other)": 0, "Listen": 25,
    "Medicine": 5, "Navigate": 10, "Perform": 5, "Persuade": 15, "Pilot": 1, "Repair": 15,
    "Research": 25, "Ride": 5, "Science": 1, "Sense": 10, "Sleight of Hand": 5, "Spot": 25,
    "Status": 15, "Stealth": 10, "Swim": 25, "Teach": 10, "Technical": 5, "Throw": 25, "Track": 10,
    # weapon classes (Chapter Eight)
    "Club": 25, "Mace": 25, "Dagger": 25, "Staff": 25, "Crossbow": 25, "Missile": 15, "Thrown": 15,
}

WEAPONS = {  # name: (class, base, damage, attacks/round, range, add_dm) ; Chapter Eight
    "Fist": ("Brawl", 25, "1D3", "1", "Touch", "full"),
    "Club, Light": ("Club", 25, "1D6", "1", "Medium", "full"),
    "Club, Heavy": ("Club", 25, "1D8", "1", "Medium", "full"),
    "Mace, Light": ("Mace", 25, "1D6+2", "1", "Medium", "full"),
    "Knife": ("Dagger", 25, "1D3+1", "1", "Short", "full"),
    "Quarterstaff": ("Staff", 25, "1D8", "1", "Long", "full"),
    "Crossbow, Light": ("Crossbow", 25, "1D6+2", "1/2", "40 m", "none"),
    "Crossbow, Medium": ("Crossbow", 25, "2D4+2", "1/2", "50 m", "none"),
    "Crossbow, Heavy": ("Crossbow", 25, "2D6+2", "1/3", "55 m", "none"),
    "Crossbow, Repeating": ("Crossbow", 25, "1D6+2", "1", "60 m", "none"),
    "Knife, Throwing": ("Missile", 15, "1D4", "1", "20 m", "half"),
}
ARMOUR = {"Clothing, Heavy": 1, "Leather, Soft": 1, "Leather, Hard": 2, "Leather, Cuirbouilli": 3, "Chain": 7}

SPELLS = {  # name: PP per level ; pp.59-65 (full entries win over the p.59 summary)
    "Blast": 3, "Change": 1, "Conjure Elemental": 1, "Control": 3, "Countermagic": 1, "Dark": 1,
    "Diminish": 1, "Dispel": 1, "Dull": 1, "Enhance": 1, "Frost": 3, "Heal": 3,
    "Illusion": 1, "Invisibility": 1, "Lift": 1, "Light": 1, "Lightning": 3, "Perception": 1,
    "Protection": 1, "Resistance": 1, "Seal": 1, "Sharpen": 1, "Speak to Mind": 1, "Teleport": 1,
    "Unseal": 1, "Vision": 1, "Wall": 1, "Ward": 3,
    "Fire": 3,      # p.62 entry; the p.59 summary calls it "Flame"
    "Wounding": 3,  # p.65 entry; the p.59 summary calls it "Wound"
}
SPELL_ALIASES = {"Flame": "Fire", "Wound": "Wounding"}
MAGIC_PROFESSIONS = ("Wizard", "Occultist", "Priest", "Shaman")

def dm(total):  # p.20
    for lo, hi, v in [(2, 12, "-1D6"), (13, 16, "-1D4"), (17, 24, "none"), (25, 32, "+1D4"),
                      (33, 40, "+1D6"), (41, 56, "+2D6"), (57, 72, "+3D6")]:
        if lo <= total <= hi:
            return v
    return "+%dD6" % (3 + (total - 57) // 16)

def half_dm(v):
    return {"+1D4": "+1D2", "+1D6": "+1D3", "+2D6": "+1D6"}.get(v, v)

def rn(x):  # round normally (p.110)
    return math.floor(x + 0.5)

def tiers(v):
    fail = 100 - min(v, 100)
    return {"special": max(1, rn(v / 5)), "critical": max(1, rn(v / 20)),
            "fumble_from": 101 - max(1, rn(fail / 20))}

def base_for(name, c, overrides):
    if name in overrides:
        return overrides[name]
    if name in BASE:
        b = BASE[name]
        return b(c) if callable(b) else b
    root = name.split(" (")[0]
    if root in ("Melee Weapon", "Missile Weapon") and "(" in name:
        cls = name.split("(")[1].rstrip(")")
        if cls in BASE:
            return BASE[cls]
    if root in BASE:
        b = BASE[root]
        return b(c) if callable(b) else b
    return None

def derived(c):
    hp = math.ceil((c["CON"] + c["SIZ"]) / 2)
    return {"HP": hp, "MW": math.ceil(hp / 2), "DM": dm(c["STR"] + c["SIZ"]), "PP": c["POW"],
            "XP": math.ceil(c["INT"] / 2)}

class Report:
    def __init__(self, title):
        self.title, self.lines, self.errors = title, [], 0
    def ok(self, m): self.lines.append("  ok     " + m)
    def info(self, m): self.lines.append("  info   " + m)
    def warn(self, m): self.lines.append("  WARN   " + m)
    def err(self, m):
        self.errors += 1
        self.lines.append("  ERROR  " + m)
    def show(self):
        print("== " + self.title)
        print("\n".join(self.lines))
        print()

def check_weapon(r, w, skills, d, c=None):
    t = WEAPONS.get(w.get("table"))
    if not t:
        r.err(f"weapon '{w['name']}': table entry '{w.get('table')}' unknown; add it from Chapter Eight")
        return
    cls, base, dmg, att, rng, mode = t
    mod = {"full": d["DM"], "half": half_dm(d["DM"]), "none": "none"}[mode]
    full = dmg if mod == "none" else f"{dmg}{mod}"
    pct = skills.get(w["skill"])
    if pct is None and c is not None:
        pct = base_for(w["skill"], c, {})
    r.info(f"weapon {w['name']}: {pct}%, damage {full}, {att} attack(s)/round, range {rng}")
    wrote = w.get("damage_as_written")
    if wrote and wrote.replace(" ", "") != full.replace(" ", ""):
        r.err(f"weapon {w['name']}: written damage '{wrote}' should be '{full}'")

def check_pc(data, path):
    r = Report(f"PC {data['full']}  ({path})")
    check_build(r, data)
    return r

def check_build(r, data):
    """Full character-creation budget check. Shared by PCs and NPCs with a 'build'. Returns derived skills."""
    lvl = data["power_level"]; c = data["characteristics"]
    pts = sum((v - 10) * COST[k] for k, v in c.items())
    (r.ok if pts == POINT_BUY[lvl] else r.err)(f"characteristic points {pts}/{POINT_BUY[lvl]} ({lvl} point-buy, p.17)")
    for k, v in c.items():
        lo = 8 if k in ("SIZ", "INT") else 3
        if not lo <= v <= 21:
            r.err(f"{k} {v} outside {lo}-21")
    decades = (data["age"] - data["rolled_age"]) // 10
    want_age = decades * AGE_POINTS[lvl]
    (r.ok if data["age_bonus_points"] == want_age else r.err)(
        f"age bonus {data['age_bonus_points']} (age {data['age']}, rolled {data['rolled_age']}: {decades} full decades = {want_age}, p.10)")
    pers = data["personality_skills"]
    (r.ok if len(pers) == 13 and len(set(pers)) == 13 else r.err)(f"personality skills: {len(set(pers))} unique of 13")
    budget = PROF_POINTS[lvl] + data["age_bonus_points"]
    spent = sum(data["professional_points"].values())
    (r.ok if spent == budget else r.err)(f"professional points {spent}/{budget}")
    for k in data["professional_points"]:
        if k not in data["profession_skills"]:
            r.err(f"professional points on '{k}', which is not a {data['profession']} skill")
    pb = c["INT"] * 10; ps = sum(data["personal_points"].values())
    (r.ok if ps == pb else r.err)(f"personal points {ps}/{pb} (INT x10)")
    skills = {}
    ov = data.get("base_overrides", {})
    def add(k, v):
        if k not in skills:
            b = base_for(k, c, ov)
            if b is None:
                r.err(f"no base chance known for '{k}'"); b = 0
            skills[k] = b
        skills[k] += v
    for k in pers: add(k, 20)
    for k, v in data["professional_points"].items(): add(k, v)
    for k, v in data["personal_points"].items(): add(k, v)
    for s in data.get("spells", []): add(s, 0)  # spells start at INT x1 even with no points (p.58)
    cap = SKILL_CAP[lvl]
    over = {k: v for k, v in skills.items() if v > cap}
    (r.err if over else r.ok)(f"skills at or under {cap}%" + (f": over {over}" if over else ""))
    spells = data.get("spells", [])
    if spells:
        if data["profession"] not in MAGIC_PROFESSIONS:
            r.warn("spells on a non-magician profession; non-magicians know 1/4 INT spell levels (p.59)")
        (r.ok if len(spells) <= START_SPELLS[lvl] else r.err)(f"{len(spells)} starting spells (max {START_SPELLS[lvl]} at {lvl}, p.58)")
        for s in spells:
            if s in SPELL_ALIASES: r.err(f"spell '{s}' is printed as '{SPELL_ALIASES[s]}' in its full entry")
            elif s not in SPELLS: r.err(f"spell '{s}' is not in the BRP spell list")
            if ov.get(s) not in (None, c["INT"]): r.err(f"spell '{s}' base should be INT x1 = {c['INT']}")
        r.info(f"max spell level {math.ceil(c['INT'] / 2)}, memorises {math.ceil(c['INT'] / 2)}")
    pv = sorted(v for _, v in data.get("passions", []))
    (r.ok if pv == [60, 60, 80] else r.warn)(f"passions {pv} (RAW start: 80/60/60, p.215)")
    d = derived(c)
    r.info("derived " + ", ".join(f"{k} {v}" for k, v in d.items()))
    for w in data.get("weapons", []): check_weapon(r, w, skills, d, c)
    if data.get("armour"):
        a = data["armour"]; r.info(f"armour {a['name']} = {a['as']} AV {ARMOUR.get(a['as'], '?')}")
    r.info("skills: " + ", ".join(f"{k} {v}" for k, v in sorted(skills.items(), key=lambda x: -x[1])))
    for n in data.get("notes", []): r.info(n)
    return skills

def check_npc(n, group, path):
    r = Report(f"NPC {n['name']} x{n.get('count', 1)}  ({path})")
    c = n.get("characteristics")
    if not c:
        r.err("no characteristics; HP, DM and PP cannot be derived"); return r
    d = derived(c)
    r.info("derived " + ", ".join(f"{k} {v}" for k, v in d.items()))
    st = n.get("stated", {})
    for key, dk in (("hp", "HP"), ("pp", "PP"), ("dm", "DM"), ("mw", "MW")):
        if st.get(key) is not None:
            (r.ok if st[key] == d[dk] else r.err)(f"stated {dk} {st[key]} vs derived {d[dk]}")
    skills = dict(n.get("skills", {}))
    if n.get("build"):
        b = dict(n["build"], characteristics=c, full=n["name"],
                 spells=list(n.get("spells", {})), weapons=[])
        built = check_build(r, b)
        for k, v in built.items():
            if skills.get(k) != v:
                r.err(f"listed {k} {skills.get(k)}% but the build gives {v}%")
        for k in skills:
            if k not in built:
                b0 = base_for(k, c, {})
                if b0 != skills[k]:
                    r.err(f"listed {k} {skills[k]}% is not in the build and differs from its base {b0}%")
    for k, v in skills.items():
        b = base_for(k, c, {})
        if b is not None and v < b:
            r.warn(f"{k} {v}% is below its base {b}%")
        if k == "Dodge" and v != b:
            r.info(f"Dodge {v}% vs DEX x2 base {b}%: fine if trained, otherwise use {b}%")
    for w in n.get("weapons", []): check_weapon(r, w, skills, d, c)
    spells = n.get("spells", {})
    levels = 0
    for s, pct in spells.items():
        if s in SPELL_ALIASES: r.err(f"spell '{s}' is printed as '{SPELL_ALIASES[s]}' in its full entry")
        elif s not in SPELLS: r.err(f"spell '{s}' is not in the BRP spell list")
        else:
            if skills.get(s, pct) != pct: r.err(f"spell {s} listed at {pct}% but skills say {skills[s]}%")
            r.info(f"spell {s} {pct}%, {SPELLS[s]} PP per level, special {tiers(pct)['special']}, critical {tiers(pct)['critical']}")
        levels += 1
    if spells and not n.get("magician"):
        lim = c["INT"] // 4
        (r.ok if levels <= lim else r.err)(f"non-magician spell levels {levels}/{lim} (1/4 INT, p.59)")
    if n.get("magician"):
        r.info(f"max spell level {math.ceil(c['INT'] / 2)}; PP pool {d['PP']}")
    plan = n.get("pp_plan", [])
    if plan:
        for step in plan:
            sp, lv = step.get("spell"), step.get("level", 1)
            if sp in SPELLS and step["pp"] != SPELLS[sp] * lv:
                r.err(f"pp_plan '{step['what']}': {sp} {lv} costs {SPELLS[sp] * lv} PP, plan says {step['pp']}")
            if sp in SPELLS and lv > math.ceil(c["INT"] / 2):
                r.err(f"pp_plan '{step['what']}': level {lv} over max {math.ceil(c['INT'] / 2)} (1/2 INT, p.55)")
        total = sum(s["pp"] for s in plan)
        (r.ok if total < d["PP"] else r.err)(
            f"PP plan spends {total}/{d['PP']}" + (" (0 PP = unconscious, p.55)" if total >= d["PP"] else ""))
    for q in n.get("open_questions", []): r.warn("open: " + q)
    return r

def main(paths):
    errors = 0
    for p in paths:
        data = json.load(open(p))
        if data.get("type") == "pc":
            reps = [check_pc(data, p)]
        elif data.get("type") == "npc_group":
            if data.get("status"): print(f"## {p}: {data['status']}\n")
            reps = [check_npc(n, data, p) for n in data["npcs"]]
        else:
            print(f"skip {p}: unknown type"); continue
        for r in reps:
            r.show(); errors += r.errors
    print(f"{errors} error(s)")
    return 1 if errors else 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
