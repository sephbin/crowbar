/* Bell Curve GURPS engine. Shared by the builder (browser, classic <script>) and the
   tools (Node, side-effect import). Sets globalThis.BC.

   Everything here is rules: the 3d6 curve and its d100 presentation, GURPS costs x10,
   the GCS trait-cost algorithm, features, prerequisites, weapons and injury.
   compute(character, library) is the one entry point that turns a character JSON
   into levels, percentages, points and a list of issues. */
(function (G) {
"use strict";

// ---------------------------------------------------------------- 3d6 curve
const CUM = [1, 4, 10, 20, 35, 56, 81, 108, 135, 160, 181, 196, 206, 212, 215, 216]; // P(3d6<=k)*216, k=3..18
const PMF = [1, 3, 6, 10, 15, 21, 25, 27, 27, 25, 21, 15, 10, 6, 3, 1];
const cdfInt = k => k < 3 ? 0 : k >= 18 ? 1 : CUM[k - 3] / 216;
// continuous CDF: linear between integer levels, so fractional levels sit between them
const cdf = x => { const f = Math.floor(x); return cdfInt(f) + (cdfInt(f + 1) - cdfInt(f)) * (x - f); };
// probability -> 3d6-equivalent value (piecewise-linear inverse of cdf)
const inv = p => {
  if (p <= 0) return 2;
  for (let k = 2; k < 18; k++) { const a = cdfInt(k), b = cdfInt(k + 1); if (p <= b) return k + (p - a) / (b - a); }
  return 18;
};
// displayed success %: curve up to level 18 (=100%), then +10% per level. 3-4 always succeed.
const succPct = L => L >= 18 ? Math.round(100 + (L - 18) * 10) : Math.min(99, Math.round(100 * Math.max(cdfInt(4), cdf(L))));
const critS = L => L >= 16 ? 6 : L >= 15 ? 5 : 4;
const critF = L => Math.min(L <= 15 ? 17 : 18, Math.max(L + 10, 3));
// d100 bands: crit success 01..cs, fumble cfStart..00
const bands = L => {
  const cs = Math.max(1, Math.round(100 * cdf(critS(L))));
  const cfStart = Math.min(100, 101 - Math.max(1, Math.round(100 * (1 - cdf(critF(L) - 1)))));
  return { cs, cfStart };
};
// resolve a d100 roll r against effective level L
function resolve(L, r) {
  const pct = succPct(L), b = bands(L), v = inv((r - 0.5) / 100);
  let verdict;
  if (r <= b.cs) verdict = "critical success";
  else if (r <= pct) verdict = "success";
  else if (r >= b.cfStart && pct < 100) verdict = "critical failure";
  else verdict = "failure";
  // mos: whole-number margin for rules that use it (contests, spell effects). A success is 0 or more, a failure -1 or less.
  const win = verdict.endsWith("success"), m = L - v;
  return { verdict, win, pct, bands: b, equiv: v, margin: m, mos: win ? Math.max(0, Math.round(m)) : Math.min(-1, Math.round(m)) };
}
const f1 = x => x == null || !isFinite(x) ? "—" : (Math.round(x * 10) / 10).toFixed(Math.abs(x - Math.round(x)) < 0.05 ? 0 : 1);

// ---------------------------------------------------------------- tables
// cost per level, x10 (B15-B17). Speed: 5 GURPS points per 0.25 = 200 per 1.0.
const ATTR_COST = { ST: 100, DX: 200, IQ: 200, HT: 100, Will: 50, Per: 50, HP: 20, FP: 30, Speed: 200, Move: 50 };
const ATTR_KEYS = Object.keys(ATTR_COST);
const ATTR_REF = { ST: "B14", DX: "B15", IQ: "B15", HT: "B15", Will: "B16", Per: "B16", HP: "B16", FP: "B16", Speed: "B17", Move: "B17" };
const FEATURE_ATTR = { st: "ST", dx: "DX", iq: "IQ", ht: "HT", will: "Will", per: "Per", hp: "HP", fp: "FP", basic_speed: "Speed", basic_move: "Move" };
const DIFF_BASE = { E: 0, A: -1, H: -2, VH: -3, W: -3 };
const DEFAULT_PEN = { E: -4, A: -5, H: -6, VH: null, W: null };
const DIFF_NAME = { E: "easy", A: "average", H: "hard", VH: "very hard", W: "wildcard" };

// skill points (x10) -> level relative to the controlling attribute
function relLevel(p, d) {
  const b = DIFF_BASE[d];
  if (p <= 0) return DEFAULT_PEN[d];
  if (p < 10) { const df = DEFAULT_PEN[d]; return df == null ? null : df + (b - df) * p / 10; }
  if (p < 20) return b + (p - 10) / 10;
  if (p < 40) return b + 1 + (p - 20) / 20;
  return b + 2 + (p - 40) / 40;
}

// ST -> damage dice, Basic Set progression (ported from GCS progression.BasicSet, B16)
function thrust(st) {
  st = Math.max(1, Math.floor(st));
  if (st < 19) return { n: 1, add: -(6 - Math.floor((st - 1) / 2)) };
  let v = st - 11;
  if (st > 50) { v--; if (st > 79) v -= 1 + Math.floor((st - 80) / 5); }
  return { n: Math.floor(v / 8) + 1, add: Math.floor((v % 8) / 2) - 1 };
}
function swing(st) {
  st = Math.max(1, Math.floor(st));
  if (st < 10) return { n: 1, add: -(5 - Math.floor((st - 1) / 2)) };
  if (st < 28) { const s = st - 9; return { n: Math.floor(s / 4) + 1, add: (s % 4) - 1 }; }
  let v = st;
  if (st > 40) v -= Math.floor((st - 40) / 5);
  if (st > 59) v++;
  v += 9;
  return { n: Math.floor(v / 8) + 1, add: Math.floor((v % 8) / 2) - 1 };
}
const diceTxt = d => `${d.n}d${d.add ? (d.add > 0 ? "+" : "") + d.add : ""}`;
function parseDice(s) {
  s = String(s ?? "").trim();
  if (!s) return { n: 0, add: 0 };
  const m = s.match(/^(\d+)d(?:6)?\s*([+-]\s*\d+)?$/i);
  if (m) return { n: +m[1], add: +(m[2] || "0").replace(/\s/g, "") };
  const k = s.match(/^([+-]?\d+)$/);
  if (k) return { n: 0, add: +k[1] };
  return null;
}

// Hit locations (B398-B400): penalty, multipliers by damage type (null = cannot target), extra DR.
const LOCS = [
  { name: "torso", pen: 0, mult: { imp: 2, "pi-": 0.5, pi: 1, cut: 1.5, cr: 1 }, dr: 0 },
  { name: "vitals", pen: -3, mult: { imp: 3, "pi-": 3, pi: 3, cut: null, cr: null }, dr: 0 },
  { name: "neck", pen: -5, mult: { imp: 2, "pi-": 0.5, pi: 1, cut: 2, cr: 1.5 }, dr: 0 },
  { name: "skull", pen: -7, mult: { imp: 4, "pi-": 4, pi: 4, cut: 4, cr: 4 }, dr: 2 },
  { name: "eye", pen: -9, mult: { imp: 4, "pi-": 4, pi: 4, cut: null, cr: null }, dr: 0 },
  { name: "arm/leg", pen: -2, mult: { imp: 1, "pi-": 0.5, pi: 1, cut: 1.5, cr: 1 }, dr: 0 },
  { name: "hand", pen: -4, mult: { imp: 1, "pi-": 0.5, pi: 1, cut: 1.5, cr: 1 }, dr: 0 },
  { name: "foot", pen: -4, mult: { imp: 1, "pi-": 0.5, pi: 1, cut: 1.5, cr: 1 }, dr: 0 },   // B399: as for a hand
];
// armour locations (GCS) to the roller's hit locations; face and groin have no roller location
const DR_LOC = { torso: ["torso", "vitals"], vitals: ["vitals"], skull: ["skull"], neck: ["neck"], eye: ["eye"], arm: ["arm/leg"], leg: ["arm/leg"], hand: ["hand"], foot: ["foot"], all: LOCS.map(l => l.name) };
const HEAD_LOCS = new Set(["skull", "eye"]);
const TYPE_NAME = { imp: "impaling", "pi-": "small piercing", pi: "piercing", cut: "cutting", cr: "crushing" };
// Damage types outside the five in the table use x1 and are flagged in the roller.
const locMult = (loc, type) => (type in loc.mult) ? loc.mult[type] : 1;
const typeKnown = type => type in TYPE_NAME;

const GRADES = { "-9": "impossible", "-8": "dangerous", "-7": "desperate", "-6": "very hard", "-5": "daunting", "-4": "hard", "-3": "tricky", "-2": "very unfavourable", "-1": "unfavourable", "0": "average", "1": "favourable", "2": "very favourable", "3": "straightforward", "4": "easy", "5": "simple", "6": "very easy", "7": "routine", "8": "trivial", "9": "guaranteed" };

// injury: (max(min, dice+add) - DR) x mult, floored, at least 1 if anything got through; extra dice added after
function injuryOne(sum, add, type, mult, dr, ex) {
  const dmg = Math.max(type === "cr" ? 0 : 1, sum + add), pen = Math.max(0, dmg - dr);
  return { v: (pen > 0 ? Math.max(1, Math.floor(pen * mult)) : 0) + ex, dmg };
}
function injuryDist(d, type, mult, dr, extra) {
  let tot = 0, cnt = 0, lo = Infinity, hi = 0;
  const rec = (k, sum, ex) => {
    if (k === d.n + extra) { const { v } = injuryOne(sum, d.add, type, mult, dr, ex); tot += v; cnt++; lo = Math.min(lo, v); hi = Math.max(hi, v); return; }
    for (let f = 1; f <= 6; f++) k < d.n ? rec(k + 1, sum + f, ex) : rec(k + 1, sum, ex + f);
  };
  rec(0, 0, 0);
  return { avg: tot / cnt, lo, hi };
}
function rollInjury(d, type, mult, dr, extra, rnd = Math.random) {
  let sum = 0, ex = 0;
  for (let i = 0; i < d.n; i++) sum += 1 + Math.floor(rnd() * 6);
  for (let i = 0; i < extra; i++) ex += 1 + Math.floor(rnd() * 6);
  const r = injuryOne(sum, d.add, type, mult, dr, ex);
  return { v: r.v, dmg: r.dmg, ex, mult, dr };
}

// ---------------------------------------------------------------- trait costs (GCS AdjustedPoints)
const CR_MULT = { 0: 2.5, 6: 2, 7: 1.83, 8: 1.67, 9: 1.5, 10: 1.33, 11: 1.17, 12: 1, 13: 0.83, 14: 0.67, 15: 0.5 };
const FR_MULT = { 6: 0.5, 9: 1, 12: 2, 15: 3, 18: 4 };  // 18 stands for "constantly"
// Costs are stored x10, so GURPS "round fractions up" becomes "round up to the next 10".
const roundUp10 = v => Math.ceil(v / 10 - 1e-9) * 10;

function parseAdj(adj) {
  const s = String(adj ?? "").trim();
  if (!s) return { kind: "add", amount: 0 };
  if (/^x/i.test(s)) {
    const body = s.slice(1);
    if (body.endsWith("%")) return { kind: "pmult", amount: parseFloat(body) };
    const frac = /^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(body);   // "x1/3" (Resistant, +3 to HT rolls)
    return { kind: "mult", amount: frac ? +frac[1] / +frac[2] : parseFloat(body) };
  }
  if (s.endsWith("%")) return { kind: "pct", amount: parseFloat(s) };
  return { kind: "add", amount: parseFloat(s) };
}
const modLabel = m => `${m.name} (${m.adj})`;

// pick modifiers for an instance; returns {mods, errors, warns}
// A modifier is a string ("Surge", "Armor Divisor (50%)") or an object {name, notes?, levels?, adj?}. The trait's own
// mods are tried first, then the general enhancements and limitations (lib.modifiers, B101-B117). "notes" picks a
// general variant ("Limited Use", notes "Once per day"); "levels" multiplies a per-level value (Area Effect 2 = 4 yd);
// "adj" sets a value by hand for the variable ones (Cone width, Contact Agent with Area Effect) and is reported.
const generalLabel = m => m.notes ? `${m.name} (${m.notes})` : m.name;
function selectMods(rec, inst, general = []) {
  const all = rec.mods || [], out = [], errors = [], warns = [];
  for (const m of all) if (m.on) out.push(m);
  for (const want of inst.modifiers || []) {
    const o = typeof want === "string" ? { name: want } : { ...want };
    const w = lc(o.name), label = o.notes ? `${o.name} (${o.notes})` : o.name;
    let hits = all.filter(m => lc(modLabel(m)) === w);
    if (!hits.length) hits = all.filter(m => lc(m.name) === w);
    if (hits.length) {
      const costs = new Set(hits.map(h => h.adj));
      if (costs.size > 1) { errors.push(`modifier "${o.name}" is ambiguous: ${hits.map(modLabel).join(", ")}`); continue; }
      const m = o.levels != null || o.adj != null ? { ...hits[0], ...(o.levels != null ? { levels: o.levels } : {}), ...(o.adj != null ? { adj: o.adj } : {}) } : hits[0];
      if (o.adj != null && o.adj !== hits[0].adj) warns.push(`modifier ${o.name}: value set by hand to ${o.adj} (library ${hits[0].adj})`);
      if (!out.includes(m)) out.push(m);
      continue;
    }
    // "Sense-Based" finds "Sense-Based (senses)"; notes match from the start ("15 seconds" picks that Takes Recharge);
    // an adj equal to one variant's value picks that variant
    hits = general.filter(m => lc(m.name) === w || lc(m.name.replace(/\s*\([^)]*\)$/, "")) === w || lc(generalLabel(m)) === w || lc(modLabel(m)) === w);
    if (o.notes) hits = hits.some(m => lc(m.notes) === lc(o.notes)) ? hits.filter(m => lc(m.notes) === lc(o.notes)) : hits.filter(m => lc(m.notes).startsWith(lc(o.notes)));
    if (o.adj != null && hits.some(h => h.adj === String(o.adj).replace(/^\+/, ""))) { hits = hits.filter(h => h.adj === String(o.adj).replace(/^\+/, "")); delete o.adj; }
    if (!hits.length && o.adj == null) { errors.push(`modifier "${label}" is not in the library entry or the general enhancements and limitations`); continue; }
    if (new Set(hits.map(h => h.adj)).size > 1 && o.adj == null) {
      errors.push(`modifier "${label}" has several values; add "notes": ${hits.map(h => `"${h.notes || ""}" (${h.adj})`).join(", ")}`); continue;
    }
    const base = hits[0] || { name: o.name, kind: String(o.adj).startsWith("-") ? "limitation" : "enhancement", ref: "" };
    const m = { ...base, general: true, levels: o.levels ?? base.levels ?? 1, ...(o.adj != null ? { adj: o.adj } : {}) };
    if (o.adj != null && o.adj !== base.adj) warns.push(`modifier ${label}: value set by hand to ${o.adj}${base.adj != null ? ` (library ${base.adj})` : ""}${base.ref ? `; check ${base.ref}` : ""}`);
    out.push(m);
  }
  warns.push(...modRules(out));
  return { mods: out, errors, warns };
}

// combination rules for the general modifiers, from their entries on B102-B116
const MOD_RULES = [
  ["aura", { needs: [["melee attack, reach c"]], ref: "B102", why: "Aura must be taken with Melee Attack (Reach C)" }],
  ["emanation", { needs: [["area effect"]], excludes: ["melee attack"], ref: "B112", why: "Emanation needs Area Effect and is incompatible with Melee Attack" }],
  ["persistent", { needs: [["area effect"]], ref: "B107", why: "Persistent needs Area Effect" }],
  ["drifting", { needs: [["persistent", "delay", "fixed delay", "variable delay", "triggered delay"]], ref: "B105", why: "Drifting needs Delay or Persistent" }],
  ["selective area", { needs: [["area effect", "cone"]], ref: "B108", why: "Selective Area needs Area Effect or Cone" }],
  ["respiratory agent", { needs: [["area effect", "cone", "jet"]], ref: "B108", why: "Respiratory Agent needs Area Effect, Cone or Jet" }],
  ["onset", { needs: [["blood agent", "contact agent", "follow-up", "malediction", "respiratory agent"]], ref: "B113", why: "Onset must be stacked with Blood Agent, Contact Agent, Follow-Up, Malediction or Respiratory Agent" }],
  ["exposure time", { needs: [["aura", "persistent"]], ref: "B113", why: "Exposure Time needs Aura or Persistent" }],
  ["cone", { excludes: ["area effect", "aura", "jet", "rapid fire", "emanation", "melee attack"], ref: "B103", why: "Cone cannot be combined with Area Effect, Aura, Jet, Melee Attack, Rapid Fire or Emanation" }],
];
const PENETRATION = ["blood agent", "contact agent", "follow-up", "respiratory agent"];
function modRules(mods) {
  const names = mods.map(m => lc(m.name).replace(/\s*\([^)]*\)$/, ""));
  const has = n => names.some(x => x === n || x.startsWith(n + ","));
  const out = [];
  for (const [n, r] of MOD_RULES) {
    if (!has(n)) continue;
    if ((r.needs || []).some(any => !any.some(has)) || r.excludes?.some(has)) out.push(`${r.why} [${r.ref}]`);
  }
  const pen = PENETRATION.filter(has);
  if (pen.length > 1) out.push(`only one penetration modifier allowed, found ${pen.join(", ")} [B108]`);
  // with Area Effect or Cone these two become enhancements (B110, B111); the library lists only the limitation for Contact Agent
  for (const [n, v, ref] of [["contact agent", "+150%", "B111"], ["blood agent", "+100%", "B110"]]) {
    const m = mods.find(x => lc(x.name) === n);
    if (m && parseFloat(m.adj) < 0 && (has("area effect") || has("cone"))) out.push(`${m.name} with Area Effect or Cone is a ${v} enhancement, not ${m.adj} [${ref}]`);
  }
  return out;
}

function traitCost(rec, inst, general = []) {
  const canLevel = !!rec.canLevel;
  let base = rec.base || 0;
  let ppl = canLevel ? (rec.perLevel || 0) : 0;
  const levels = canLevel ? (inst.levels ?? 1) : 0;
  let baseEnh = 0, baseLim = 0, levelEnh = 0, levelLim = 0;
  const cr = inst.cr ?? rec.cr, fr = inst.frequency ?? rec.fr;
  let mult = (cr != null ? (CR_MULT[cr] ?? 1) : 1) * (fr != null ? (FR_MULT[fr] ?? 1) : 1);
  const { mods, errors, warns } = selectMods(rec, inst, general);
  for (const m of mods) {
    const a = parseAdj(m.adj), lv = m.levels || 1, affects = m.affects || "total";
    if (a.kind === "add") { if (affects === "levels_only") { if (canLevel) ppl += a.amount * lv; } else base += a.amount * lv; }
    else if (a.kind === "pct") {
      const v = a.amount * lv;
      if (affects !== "levels_only") { if (v < 0) baseLim += v; else baseEnh += v; }
      if (affects !== "base_only") { if (v < 0) levelLim += v; else levelEnh += v; }
    }
    else if (a.kind === "pmult") mult *= a.amount / 100;
    else if (a.kind === "mult") mult *= a.amount;
  }
  let pts = base;
  const leveled = ppl * levels;
  if (baseEnh || baseLim || levelEnh || levelLim) {
    const baseMod = Math.max(-80, baseEnh + baseLim), levelMod = Math.max(-80, levelEnh + levelLim);
    if (baseMod === levelMod) pts = (base + leveled) * (1 + baseMod / 100);
    else pts = base * (1 + baseMod / 100) + leveled * (1 + levelMod / 100);
  } else pts = base + leveled;
  const v = pts * mult;
  return { cost: rec.roundDown ? Math.floor(v / 10 + 1e-9) * 10 : roundUp10(v), mods, errors, warns };
}

// ---------------------------------------------------------------- matching helpers
const lc = s => String(s ?? "").toLowerCase().trim();
function strCmp(c, v) {
  if (!c) return true;
  const q = lc(c.qualifier), s = lc(v);
  switch (c.compare) {
    case undefined: case "any": return true;
    case "is": return s === q;
    case "is_not": return s !== q;
    case "contains": return s.includes(q);
    case "does_not_contain": return !s.includes(q);
    case "starts_with": return s.startsWith(q);
    case "does_not_start_with": return !s.startsWith(q);
    case "ends_with": return s.endsWith(q);
    case "does_not_end_with": return !s.endsWith(q);
    default: return true;
  }
}
function numCmp(c, v) {
  if (!c) return true;
  const q = +c.qualifier;
  switch (c.compare) {
    case undefined: case "any": return true;
    case "is": return v === q;
    case "is_not": return v !== q;
    case "at_least": return v >= q;
    case "at_most": return v <= q;
    default: return true;
  }
}
const cmpTxt = c => !c || c.compare === "any" ? "" : `${(c.compare || "").replace(/_/g, " ")} ${c.qualifier}`;

// "Thrown Weapon (Knife)" -> {name, spec}
function splitSpec(name, spec) {
  if (spec) return { name: String(name).trim(), spec: String(spec).trim() };
  const m = String(name).match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  return m ? { name: m[1].trim(), spec: m[2].trim() } : { name: String(name).trim(), spec: "" };
}
const fullName = (n, s) => s ? `${n} (${s})` : n;

// ---------------------------------------------------------------- library index
function indexLibrary(lib) {
  if (lib._ix) return lib._ix;
  const by = (arr, key) => { const m = new Map(); for (const r of arr || []) { const k = key(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return m; };
  const ix = {
    skills: by(lib.skills, r => lc(r.name)),
    traits: by(lib.traits, r => lc(r.name)),
    spells: by(lib.spells, r => lc(r.name)),
    equipment: by(lib.equipment, r => lc(r.name)),
    templates: by(lib.templates, r => lc(r.name)),
  };
  Object.defineProperty(lib, "_ix", { value: ix, enumerable: false });
  return ix;
}
function findSkill(lib, name, spec) {
  const ix = indexLibrary(lib), rows = ix.skills.get(lc(name)) || [];
  if (!rows.length) return { rec: null, why: "not in library" };
  if (spec) {
    const exact = rows.find(r => lc(r.spec) === lc(spec));
    if (exact) return { rec: exact };
    const open = rows.find(r => r.spec && r.spec.startsWith("@"));
    if (open) return { rec: open, open: true };
    const plain = rows.find(r => !r.spec);
    if (plain) return { rec: plain, why: plain ? `takes no specialization; "${spec}" kept as a note` : null, note: true };
    return { rec: null, why: `no "${spec}" specialization; library has ${rows.map(r => r.spec).join(", ")}` };
  }
  const plain = rows.find(r => !r.spec);
  if (plain) return { rec: plain };
  return { rec: null, why: `needs a specialization (${rows.filter(r => !r.spec.startsWith("@")).slice(0, 8).map(r => r.spec).join(", ")}${rows.length > 8 ? ", …" : ""})` };
}
const findOne = (map, name) => (map.get(lc(name)) || [])[0] || null;
// a trait instance's record: by name, or by page where the name has two ("Vow" with "ref": "B165" is the quirk)
const findTrait = (ix, inst) => { const c = ix.traits.get(lc(inst.name)) || []; return (inst.ref && c.find(r => String(r.ref || "").split(",").map(x => x.trim()).includes(inst.ref))) || c[0] || null; };

// ---------------------------------------------------------------- prerequisites
function checkPrereq(p, st) {
  // returns {ok, missing:[text]}
  if (!p) return { ok: true, missing: [] };
  if (p.type === "prereq_list") {
    // a list that applies only at some TLs (Research: Computer Operation at TL8+, literacy at TL4-); skipped when the
    // campaign TL isn't set
    if (p.when_tl && p.when_tl.compare !== "any" && (st.tl == null || !numCmp(p.when_tl, st.tl))) return { ok: true, missing: [] };
    const res = (p.prereqs || []).map(x => checkPrereq(x, st));
    if (!res.length) return { ok: true, missing: [] };
    if (p.all !== false) { const bad = res.filter(r => !r.ok); return { ok: !bad.length, missing: bad.flatMap(r => r.missing) }; }
    if (res.some(r => r.ok)) return { ok: true, missing: [] };
    return { ok: false, missing: [`one of: ${res.map(r => r.missing.join(" and ")).join(" | ")}`] };
  }
  const has = p.has !== false;
  let ok, label;
  switch (p.type) {
    case "trait_prereq": {
      const hit = st.traits.find(t => strCmp(p.name, t.name) && numCmp(p.level, t.levels ?? 0) && strCmp(p.notes, t.notes || ""));
      ok = !!hit;
      // everyone speaks and writes a native language for free (B23-B24); it's only on the sheet when languages are recorded
      if (!ok && has && /^language/i.test(p.name?.qualifier || "") && !st.traits.some(t => /^language/i.test(t.name))) ok = true;
      label = `trait ${p.name?.qualifier}${p.level && p.level.compare !== "any" ? " level " + cmpTxt(p.level) : ""}${p.notes && p.notes.compare !== "any" ? ` (notes ${cmpTxt(p.notes)})` : ""}`;
      break;
    }
    case "skill_prereq": {
      const hit = st.skills.find(s => s.level != null && s.points > 0 && strCmp(p.name, s.name) && strCmp(p.specialization, s.spec || "") && numCmp(p.level, s.level));
      ok = !!hit;
      label = `skill ${p.name?.qualifier}${p.specialization ? ` (${p.specialization.qualifier})` : ""}${p.level && p.level.compare !== "any" ? " at " + cmpTxt(p.level) : ""}`;
      break;
    }
    case "spell_prereq": {
      const known = st.spells.filter(s => s.points >= 10);
      const qty = p.quantity || { compare: "at_least", qualifier: 1 };
      let n;
      switch (p.sub_type) {
        case "name": n = known.filter(s => strCmp(p.qualifier, s.name)).length; label = `spell ${p.qualifier?.qualifier}`; break;
        case "college": n = known.filter(s => (s.college || []).some(c => strCmp(p.qualifier, c))).length; label = `${qty.qualifier} ${p.qualifier?.qualifier} spell(s)`; break;
        case "college_count": n = new Set(known.flatMap(s => s.college || [])).size; label = `spells from ${qty.qualifier} colleges`; break;
        case "tag": n = known.filter(s => (s.tags || []).some(c => strCmp(p.qualifier, c))).length; label = `${qty.qualifier} ${p.qualifier?.qualifier} spell(s)`; break;
        default: n = known.length; label = `${qty.qualifier} spell(s)`;
      }
      ok = numCmp(qty, n);
      break;
    }
    case "attribute_prereq": {
      const key = FEATURE_ATTR[p.which] || p.which;
      let v = st.attrs[key] ?? 0;
      if (p.combined_with) v += st.attrs[FEATURE_ATTR[p.combined_with] || p.combined_with] ?? 0;
      ok = numCmp(p.qualifier, v);
      label = `${key}${p.combined_with ? "+" + (FEATURE_ATTR[p.combined_with] || p.combined_with) : ""} ${cmpTxt(p.qualifier)}`;
      break;
    }
    default:
      return { ok: true, missing: [], unchecked: `${p.type} not checked` };
  }
  const pass = has ? ok : !ok;
  return { ok: pass, missing: pass ? [] : [(has ? "" : "not ") + label] };
}

// ---------------------------------------------------------------- weapons
const NATURAL = lib => (lib.natural || []);
function weaponModes(item, rec, st) {
  // returns mode descriptors with damage dice resolved
  const out = [];
  for (const w of rec.weapons || []) {
    const ratedST = item.st ?? rec.ratedST ?? null;
    const dmgST = ratedST ?? st.ST;
    let dice = { n: 0, add: 0 };
    if (w.dmg.st === "thr" || w.dmg.st === "thr_leveled") dice = thrust(dmgST);
    else if (w.dmg.st === "sw" || w.dmg.st === "sw_leveled") dice = swing(dmgST);
    const b = parseDice(w.dmg.base);
    const bad = b == null;
    if (b) { dice = { n: dice.n + b.n, add: dice.add + b.add }; }
    // a trait's damage per level (Innate Attack "1d" a level), and "+1 per die" (Strikers, Claws; B88), which the
    // Striker limitation Weak removes
    if (w.dmg.leveled) { const l = parseDice(w.dmg.leveled), n = item.levels || 1; if (l) dice = { n: dice.n + l.n * n, add: dice.add + l.add * n }; }
    if (w.dmg.perDie && !item.noPerDie) dice = { n: dice.n, add: dice.add + w.dmg.perDie * dice.n };
    // item quality (B274: a fine blade +1 cutting and impaling damage, very fine +2) and gear such as boots (+1 kick)
    const q = item.qual || {};
    if (q.dmg && /^(cut|imp)$/.test(w.dmg.type)) dice = { n: dice.n, add: dice.add + q.dmg };
    const ub = item.usageBonus?.(w.usage) || 0;
    if (ub) dice = { n: dice.n, add: dice.add + ub };
    const melee = !!w.reach && !w.range;
    let acc = w.acc, range = w.range;
    if (q.acc && acc != null && acc !== "" && !isNaN(parseInt(acc, 10)) && (q.accAll || range)) acc = String(parseInt(acc, 10) + q.acc) + String(acc).replace(/^[+-]?\d+/, "");
    if (q.range && range) range = String(range).replace(/(x?)(\d+(?:\.\d+)?)/g, (_, x, n) => x + String(Math.round(+n * q.range * 10) / 10));
    out.push({ usage: w.usage || (melee ? "melee" : "ranged"), dice, type: w.dmg.type, melee, reach: w.reach, range, parry: w.parry, block: w.block,
      acc, strength: w.strength, ratedST, defaults: w.defaults || [], dmgText: w.dmgText, unparsed: bad ? w.dmg.base : null });
  }
  return out;
}

// ---------------------------------------------------------------- equipment: weight, encumbrance, money, quality
const TL_WEALTH = [250, 500, 750, 1000, 2000, 5000, 10000, 15000, 20000, 30000, 50000, 75000, 100000];   // B27, TL0-TL12+
const WEALTH_MULT = { "dead broke": 0, poor: 0.2, struggling: 0.5, "average wealth": 1, "comfortable wealth": 2, wealthy: 5, "very wealthy": 20, "filthy rich": 100 };   // B25
const ENC = [   // B17: weight up to bl x Basic Lift; Move x move; Dodge minus the level
  { name: "None", bl: 1, move: 1 }, { name: "Light", bl: 2, move: 0.8 }, { name: "Medium", bl: 3, move: 0.6 },
  { name: "Heavy", bl: 6, move: 0.4 }, { name: "Extra-Heavy", bl: 10, move: 0.2 }];
const lbs = w => { const m = /^\s*(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+))?\s*(lbs?|oz)?\b/i.exec(String(w ?? "")); if (!m) return 0; const v = +m[1] / (m[2] ? +m[2] : 1); return /^oz/i.test(m[3] || "") ? v / 16 : v; };
const basicLift = st => { const b = st * st / 5; return b >= 10 ? Math.round(b) : b; };   // B15: ST x ST / 5, rounded once 10 or more
const tlNum = t => { const m = /^\d+/.exec(String(t ?? "")); return m ? +m[0] : null; };
const SWORD_SKILLS = /^(broadsword|force sword|jitte\/sai|knife|shortsword|two-handed sword|main-gauche|rapier|saber|smallsword)$/i;   // swords and fencing weapons, B208-B209
const FENCING_SKILLS = /^(main-gauche|rapier|saber|smallsword)$/i;   // B208
const POWERSTONE = /^(\d+) pt powerstone$/i;   // M20
// the skills an item is used with at no penalty decide its quality rules
function itemClass(rec) {
  const tags = rec.tags || [];
  if (/^M\d/.test(rec.ref || "")) return "magic";   // Powerstones, potions and other Magic items have no quality grades
  if (tags.includes("Shield")) return "shield";
  if (rec.dr?.length) return "armour";
  if (tags.some(t => /^AmmoType:(Arrow|Bolt)$/.test(t))) return "melee";   // B277: arrows and bolts use melee quality
  if (!rec.weapons?.length) return "gear";
  const skills = rec.weapons.flatMap(w => (w.defaults || []).filter(d => d.type === "skill" && !d.modifier).map(d => d.name?.qualifier || ""));
  if (skills.some(s => /^(guns|beam weapons|gunner|liquid projector)/i.test(s))) return "firearm";
  if (skills.some(s => /^(bow|crossbow|blowpipe)$/i.test(s))) return "bow";
  if (skills.some(s => FENCING_SKILLS.test(s))) return "fencing";
  if (skills.some(s => SWORD_SKILLS.test(s))) return "sword";
  return "melee";
}
// quality grades: B274 (melee, thrown, arrows and bolts), B277 (bows, crossbows, blowpipes), B280 (firearms), B345 (other gear).
// Melee prices depend on TL: list price buys good quality at TL6 or less and fine at TL7+. tl is the campaign TL, else the item's.
function itemQuality(rec, quality, tl) {
  const q = lc(quality || "").replace(/-/g, " ");
  const cls = itemClass(rec), lo = (tl ?? tlNum(rec.tl) ?? 3) <= 6;
  const r = { cls, mult: 1, dmg: 0, acc: 0, range: 0, notes: [], error: null, ref: "B274" };
  if (!q) return r;
  const blade = (rec.weapons || []).some(w => /^(cut|imp)$/.test(w.dmg.type)), cuts = (rec.weapons || []).some(w => w.dmg.type === "cut");
  if (cls === "melee" || cls === "sword" || cls === "fencing") {
    const swordy = cls !== "melee";
    if (q === "cheap") { r.mult = lo ? 0.4 : 0.2; r.acc = -1; r.notes.push("+2 to break", "-1 Acc thrown"); }
    else if (q === "good") r.mult = lo ? 1 : 0.4;
    else if (q === "fine") { r.mult = lo ? (swordy ? 4 : cuts ? 10 : 3) : 1; r.dmg = blade ? 1 : 0; r.notes.push("-1 to break"); }
    else if (q === "very fine") {
      if (!swordy) r.error = "only swords and fencing weapons can be very fine";
      r.mult = lo ? 20 : 4; r.dmg = blade ? 2 : 0; r.notes.push("-2 to break");
    } else r.error = `unknown quality "${quality}" (cheap, good, fine, very fine)`;
    // B275: stone, bronze and iron blades (TL0-TL2) get no damage bonus for quality
    if (r.dmg && tl != null && tl <= 2) { r.dmg = 0; r.notes.push("no damage bonus: blades are stone, bronze or iron below TL3 (B275)"); }
  } else if (cls === "bow") {
    r.ref = "B277";
    if (q === "fine") { r.mult = 4; r.range = 1.2; r.notes.push("1/2D and Max +20%"); }
    else if (q !== "good") r.error = "bows, crossbows and blowpipes come only good or fine";
  } else if (cls === "firearm") {
    r.ref = "B280"; r.accAll = true;
    if (q === "fine") { r.mult = 2; r.acc = 1; r.notes.push("+1 Malf"); }
    else if (q === "very fine") { r.mult = 5; r.acc = 2; r.notes.push("+1 Malf"); }
    else if (q !== "good") r.error = "firearms come only good, fine or very fine";
  } else if (cls === "gear") {
    // B345 gives the equipment modifier and an approximate price ("about")
    r.ref = "B345";
    if (q === "good") { r.mult = 5; r.notes.push("+1 equipment modifier"); }
    else if (q === "fine") { r.mult = 20; r.notes.push("+2 equipment modifier"); }
    else if (q !== "basic") r.error = "gear comes basic, good or fine";
  } else r.error = `no quality grades for ${{ armour: "armour", shield: "shields", magic: "magic items" }[cls]}`;
  return r;
}
// energy cost after high skill (M8: -1 at 15, -2 at 20, -1 more per full five levels past 20); null when the cost isn't a flat number
const spellEnergy = (cost, level) => {
  if (!/^\d+$/.test(String(cost ?? "").trim()) || level == null) return null;
  const red = level < 15 ? 0 : level < 20 ? 1 : 2 + Math.floor((level - 20) / 5);
  return Math.max(0, +cost - red);
};

// ---------------------------------------------------------------- professions (Dungeon Fantasy)
// A profession (lib.professions, DF1 pp.4-13) is a 250-point template (x10 here): fixed parts and choices. A character
// records its choices as "profession": { "name": "Thief", "picks": { "<group path>": [pick, ...] } }. A group's path is
// where it sits: "g4" for a top-level group, "g9.0" for the pick-one at item 0 of fixed group g9, "g11.2.0" for the
// group at item 0 of option 2 (a bundle) of g11. A pick is one of:
//   { "o": 3 }                         option 3 of this group (with "levels", "spec", "notes" or "cost" as it needs)
//   { "g": "g6", "o": 2 }              option 2 of an earlier group ("-20 points chosen from among the previous traits")
//   { "spell": "Armor" }               a spell for a "choose 20 clerical spells" group
//   { "text": "True Faith", "cost": 240 }   points spent on an open list ("25 points in Holy abilities")
//   { "skill": "Stealth", "cost": 10 } points spent raising a skill ("7 points spent on any previous skill")
// stamp() turns a profession and its picks into what goes on the sheet; check() reports each choice's state.
function profOptCost(o, pick = {}) {
  if (o.variable) return pick.cost ?? 0;
  // an upgrade over a fixed level ("High Manual Dexterity 2-4" after level 1) pays only for the added levels
  if (o.per != null && (o.min != null || o.type === "attr")) return o.per * ((pick.levels ?? o.min ?? 1) - (o.from || 0));
  return o.cost ?? 0;
}
const profGroupOf = (prof, g, p) => p.g ? prof.groups.find(x => x.id === p.g) : g;
// everything taken: fixed items and picked options, through bundles and nested groups. fn(option, pick, path)
function profWalk(prof, picks, fn) {
  const take = (o, pick, path) => {
    if (o.type === "group") return choose(o, path);
    if (o.type === "bundle") return o.items.forEach((it, i) => take(it, {}, `${path}.${i}`));
    // a fixed item's specialty is recorded as a pick at its own place: "g6.3": [{ "spec": "Arctic" }]
    fn(o, pick.o == null && !pick.spell && pick.text == null && !pick.skill ? { ...(picks?.[path]?.[0] || {}), ...pick } : pick, path);
  };
  const choose = (g, path) => {
    for (const p of picks?.[path] || []) {
      if (p.spell) fn({ type: "spell", name: p.spell, cost: g.cost ?? 10, power: g.spellList && g.spellList !== "wizardly" ? g.spellList : null }, p, path);
      else if (p.text != null) fn({ type: "note", name: p.text, cost: p.cost ?? 0 }, p, path);
      else if (p.skill) fn({ type: "skill", name: p.skill, spec: p.spec, cost: p.cost ?? 0, raise: true }, p, path);
      else { const o = profGroupOf(prof, g, p)?.options?.[p.o]; if (o) take(o, p, `${path}.${p.o}`); }
    }
  };
  for (const g of prof.groups) {
    if (g.kind === "fixed") g.options.forEach((o, i) => take(o, {}, `${g.id}.${i}`));
    else if (g.kind !== "note") choose(g, g.id);
  }
}
// every choice that applies: the top-level ones, pick-ones inside fixed lists, and groups inside picked bundles
function profChoices(prof, picks) {
  const out = [];
  const label = g => g.label || (g.section === "advantages" ? "Advantages" : g.section === "disadvantages" ? "Disadvantages" : g.section === "spells" ? "Spells" : "Skills");
  const inside = (items, path, lab) => items.forEach((it, i) => {
    if (it.type === "group") { out.push({ g: it, path: `${path}.${i}`, label: lab }); fromPicks(it, `${path}.${i}`, lab); }
    else if (it.type === "bundle") inside(it.items, `${path}.${i}`, lab);
  });
  const fromPicks = (g, path, lab) => { for (const p of picks?.[path] || []) { const o = !p.g && p.o != null ? g.options?.[p.o] : null; if (o?.type === "bundle") inside(o.items, `${path}.${p.o}`, lab); if (o?.type === "group") { out.push({ g: o, path: `${path}.${p.o}`, label: lab }); fromPicks(o, `${path}.${p.o}`, lab); } } };
  for (const g of prof.groups) {
    if (g.kind === "fixed") inside(g.options, g.id, label(g));
    else if (g.kind !== "note") { out.push({ g, path: g.id, label: label(g) }); fromPicks(g, g.id, label(g)); }
  }
  return out;
}
// the specialty a taken skill ends up with: the pick's, the book's, or the skill's own name where the library has it
// as a specialty ("Shield" is Shield (Shield))
const profSpec = (o, p) => p.spec ?? o.spec ?? (o.choices?.includes(o.name) ? o.name : undefined);
function profCheck(prof, picks) {
  const specs = [];
  profWalk(prof, picks, (o, p, path) => { if (o.type === "skill" && (o.ask || o.choices) && !profSpec(o, p)) specs.push({ path, label: `${o.name}: choose a specialty`, kind: "spec", ok: false, o }); });
  return [...specs, ...profChoices(prof, picks).map(({ g, path, label }) => {
    const ps = picks?.[path] || [];
    if (g.kind === "points") {
      const have = ps.reduce((a, p) => { const o = p.o != null ? profGroupOf(prof, g, p)?.options?.[p.o] : null; return a + (o ? profOptCost(o, p) : (p.cost ?? 0)); }, 0);
      return { path, label, kind: "points", n: g.n, have, ok: have === g.n, g };
    }
    return { path, label, kind: "count", n: g.n, have: ps.length, ok: ps.length === g.n, g };
  })];
}
function profStamp(prof, picks) {
  const st = { attributes: { ...prof.attributes }, traits: [], skills: [], spells: [], notes: [] };
  profWalk(prof, picks, (o, p) => {
    const cost = profOptCost(o, p);
    if (o.type === "attr") st.attributes[o.key] = (st.attributes[o.key] || 0) + cost;
    else if (o.type === "trait") {
      const notes = p.notes ?? o.notes, lv = p.levels ?? o.levels ?? o.min ?? null;
      // "Magery 4, 5, or 6 [10, 20, or 30]": raises the template's Magery 3 rather than adding a second Magery
      const same = st.traits.find(t => t.name === o.name && (t.notes || "") === (notes || ""));
      if (same && lv != null) { same.levels = Math.max(same.levels || 0, lv); return; }
      const t = { name: o.name };
      if (notes) t.notes = notes;
      if (lv != null) t.levels = lv;
      if (o.cr) t.cr = o.cr;
      if (o.modifiers) t.modifiers = structuredClone(o.modifiers);
      if (o.declare) t.points = cost;   // a trait the library can't price (Unusual Background): the book's cost
      st.traits.push(t);
    } else if (o.type === "skill") {
      const spec = profSpec(o, p), same = st.skills.find(s => s.name === o.name && (s.spec || "") === (spec || ""));
      if (same) same.points += cost; else st.skills.push({ name: o.name, ...(spec ? { spec } : {}), points: cost });
    } else if (o.type === "spell") st.spells.push({ name: o.name, points: cost, ...(o.power ? { power: o.power } : {}) });
    else st.notes.push({ text: o.name, points: cost });
  });
  return st;
}

// ---------------------------------------------------------------- compute
function compute(ch, lib, opts = {}) {
  const ix = indexLibrary(lib);
  const issues = [];
  const add = (sev, msg, ref, path) => issues.push({ sev, msg, ref: ref || "", path: path || "" });
  const budget = opts.budget ?? ch.budget ?? 0;

  // ---- traits: template first, then character
  // templates: a library name, an inline custom template {name, attributes?, traits:[instances]}, or a list of either
  const traitRows = [], tpls = [];
  const tplList = ch.templates || (ch.template ? [ch.template] : []);
  tplList.forEach((t, j) => {
    if (typeof t === "string") {
      const rec = findOne(ix.templates, t);
      if (!rec) add("ERROR", `template "${t}" not in library`, "", `templates[${j}]`);
      else tpls.push({ tpl: rec, j });
    } else tpls.push({ tpl: t, j });
  });
  const tplAttrs = {};
  // traits taken off a template for this character ("templateRemoved": [{ "template": "Badger-folk", "trait": "Stubbornness" }]);
  // the template is left as it is, so the trait can be put back
  const removedKey = (tn, t) => lc(`${tn}|${fullName(t.name, t.notes)}`);
  const removedSet = new Set((ch.templateRemoved || []).map(r => lc(`${r.template}|${r.trait}`)));
  const removed = [];
  for (const { tpl, j } of tpls) {
    for (const k of ATTR_KEYS) if (tpl.attributes?.[k]) tplAttrs[k] = (tplAttrs[k] || 0) + tpl.attributes[k];
    (tpl.traits || []).forEach((t, i) => {
      if (!removedSet.has(removedKey(tpl.name, t)) && !removedSet.has(lc(`${tpl.name}|${t.name}`))) { traitRows.push({ inst: t, from: tpl.name, path: `templates[${j}].traits[${i}]` }); return; }
      const rec = t.rec || findTrait(ix, t);
      const cost = rec ? traitCost(rec, t, lib.modifiers || []).cost : (t.points ?? 0);
      removed.push({ template: tpl.name, trait: fullName(t.name, t.notes), name: t.name, inst: t, rec, cost });
      add("ok", `${fullName(t.name, t.notes)}: taken off the ${tpl.name} template (${cost < 0 ? "+" : "−"}${Math.abs(cost)} pts to the total)`, rec?.ref || "", `templates[${j}].traits[${i}]`);
    });
    if (tpl.custom) add("WARN", `template ${tpl.name}: custom, not in the library${tpl.ref ? " (" + tpl.ref + ")" : ""}; its traits are checked one by one`, "", `templates[${j}]`);
  }
  const tpl = tpls.map(t => t.tpl);
  (ch.traits || []).forEach((t, i) => traitRows.push({ inst: t, from: null, path: `traits[${i}]` }));

  const traits = traitRows.map(({ inst, from, path }) => {
    const rec = inst.rec || findTrait(ix, inst);
    const row = { inst, rec, from, path, name: inst.name, levels: inst.levels ?? (rec?.canLevel ? 1 : 0), notes: inst.notes || "", cost: inst.points ?? 0, features: [] };
    if (!rec) {
      add("ERROR", `${inst.name}: not in library. Flag for Andrew; using declared ${inst.points ?? 0} pts`, "", path);
      row.kind = (inst.points ?? 0) < 0 ? "disadvantage" : "advantage";
      return row;
    }
    const c = traitCost(rec, inst, lib.modifiers || []);
    row.cost = c.cost; row.mods = c.mods; row.kind = rec.kind; row.house = !!rec.house; row.ref = rec.ref;
    row.features = (rec.features || []).map(f => ({ ...f, amount: f.per_level ? f.amount * (row.levels || 0) : f.amount, source: fullName(inst.name, inst.notes) }));
    for (const e of c.errors) add("ERROR", `${inst.name}: ${e}`, rec.ref, path);
    for (const w of c.warns) add("WARN", `${inst.name}: ${w}`, rec.ref, path);
    // a trait with no cost in the library (Unusual Background, Book-Learned Wisdom) is priced by the GM or a formula:
    // the declared points are used
    const noCost = !rec.base && !rec.perLevel && !(rec.mods || []).some(m => m.adj && m.adj !== "0") && !rec.house;
    if (noCost && inst.points != null) { row.cost = inst.points; add("ok", `${fullName(inst.name, inst.notes)}: ${inst.points} pts as declared (${rec.variable || "priced by the GM"})`, rec.ref, path); }
    else if (inst.points != null && inst.points !== c.cost) add("ERROR", `${fullName(inst.name, inst.notes)}: declared ${inst.points} pts, rules give ${c.cost}`, rec.ref, path);
    if (inst.levels != null && !rec.canLevel) add("WARN", `${inst.name}: has no levels; "levels" ignored`, rec.ref, path);
    if (rec.canLevel && rec.maxLevels && (inst.levels ?? 1) > rec.maxLevels) add("ERROR", `${inst.name}: level ${inst.levels} above the maximum ${rec.maxLevels}`, rec.ref, path);
    if (rec.house) add("ok", `${fullName(inst.name, inst.notes)}${row.levels ? " " + row.levels : ""}: house rule, ${c.cost} pts`, rec.ref, path);
    if (rec.sub && !inst.notes) add("WARN", `${inst.name}: needs a subject in "notes" (${rec.sub})`, rec.ref, path);
    return row;
  });

  const seenTraits = new Map();
  for (const t of traits) {
    const k = lc(fullName(t.name, t.notes));
    if (seenTraits.has(k)) add("WARN", `${fullName(t.name, t.notes)} listed twice${t.from || seenTraits.get(k) ? " (once from a template)" : ""}`, t.ref, t.path);
    seenTraits.set(k, t.from);
  }
  const features = traits.flatMap(t => t.features);
  const attrBonus = {}; const extra = { dodge: 0, parry: 0, block: 0, fright_check: 0, sm: 0, vision: 0, hearing: 0, taste_smell: 0, touch: 0 };
  const limited = [];
  for (const f of features) {
    if (f.type !== "attribute_bonus") continue;
    if (f.limitation && f.limitation !== "none") { limited.push(f); continue; }
    const k = FEATURE_ATTR[f.attribute];
    if (k) attrBonus[k] = (attrBonus[k] || 0) + f.amount;
    else if (f.attribute in extra) extra[f.attribute] += f.amount;
  }

  // ---- attributes
  const pts = {}; for (const k of ATTR_KEYS) pts[k] = (ch.attributes?.[k] || 0) + (tplAttrs[k] || 0);
  const lvl = k => pts[k] / ATTR_COST[k] + (attrBonus[k] || 0);
  const A = {};
  A.ST = 10 + lvl("ST"); A.DX = 10 + lvl("DX"); A.IQ = 10 + lvl("IQ"); A.HT = 10 + lvl("HT");
  A.Will = A.IQ + lvl("Will"); A.Per = A.IQ + lvl("Per");
  A.HP = A.ST + lvl("HP"); A.FP = A.HT + lvl("FP");
  A.Speed = (A.DX + A.HT) / 4 + lvl("Speed");
  A.Move = Math.floor(A.Speed) + lvl("Move");
  const thr = thrust(A.ST), sw = swing(A.ST);
  for (const k of ATTR_KEYS) {
    const v = ch.attributes?.[k] || 0;
    if (v % 10) add("WARN", `${k}: ${v} pts is not a 10-point step`, ATTR_REF[k], `attributes.${k}`);
  }
  // Lifting ST counts for Basic Lift (B65); ST for striking only is not applied
  const liftST = A.ST + limited.filter(f => f.attribute === "st" && f.limitation === "lifting_only").reduce((a, f) => a + f.amount, 0);
  for (const f of limited) if (!(f.attribute === "st" && f.limitation === "lifting_only"))
    add("WARN", `${f.source}: ${f.attribute} ${f.amount > 0 ? "+" : ""}${f.amount} (${f.limitation.replace(/_/g, " ")}) not applied to the sheet`, "", "");

  // ---- equipment carried: weight and encumbrance (B17). An item with "carried": false is owned but left at home.
  const ctl = ch.tl ?? opts.tl ?? null;
  const gear = (ch.equipment || []).map((item, i) => {
    const rec = findOne(ix.equipment, item.name), path = `equipment[${i}]`, qty = item.qty ?? 1;
    const qual = rec ? itemQuality(rec, item.quality, ctl) : null;
    return { item, rec, path, qty, qual, carried: item.carried !== false, weight: rec ? lbs(rec.weight) * qty : 0 };
  });
  // ---- armour worn (B286): pieces on different locations combine freely. Layers on one location add their DR, but
  // every layer under the outermost must be flexible and concealable. An extra layer anywhere but the head gives -1 to
  // DX and DX-based skills (applied to DX after Basic Speed, so Speed, Move and Dodge are unchanged).
  // Split DR: mail is -2 against crushing (B283 note [3]); NBC and space suits have DR only against burning and corrosion;
  // breastplates cover only the front and sandals only the sole (B284 note [2]), noted per location.
  const dr = {}; LOCS.forEach(l => dr[l.name] = 0);
  const drVs = { cr: {}, burn: {} }, partial = {};
  const layers = {};
  gear.forEach(g => {
    if (!g.rec?.dr || !g.carried || g.item.worn === false) return;
    const at = {};
    for (const d of g.rec.dr) for (const loc of d.locations) for (const L of DR_LOC[loc] || []) {
      const p = at[L] ||= { amount: 0, cr: 0, burn: 0, part: null };
      if (d.vs === "crushing") p.cr = Math.min(p.cr, d.amount);
      else if (d.vs === "burning or corrosion") p.burn = Math.max(p.burn, d.amount);
      else { p.amount = Math.max(p.amount, d.amount); if (d.vs === "frontal" || d.vs === "underside") p.part = d.vs === "frontal" ? "front only" : "sole only"; }
    }
    for (const L in at) (layers[L] ||= []).push({ g, ...at[L], inner: !!(g.rec.flexible && g.rec.concealable) });
  });
  let layered = false;
  const badLayer = new Set();
  for (const L in layers) {
    let ps = layers[L];
    if (ps.length > 1) {
      const rigid = ps.filter(p => !p.inner);
      if (rigid.length > 1) {
        const k = rigid.map(p => p.g.rec.name).sort().join(" and ");
        if (!badLayer.has(k)) { badLayer.add(k); add("ERROR", `${k} can't be layered: only flexible, concealable armour goes underneath (${L} uses the higher DR)`, "B286", rigid[1].g.path); }
        ps = [ps.reduce((a, p) => p.amount > a.amount ? p : a)];
      } else if (!HEAD_LOCS.has(L) && ps.filter(p => p.amount > 0).length > 1) layered = true;
    }
    dr[L] = ps.reduce((a, p) => a + p.amount, 0);
    const cr = ps.reduce((a, p) => a + p.cr, 0), burn = ps.reduce((a, p) => a + p.burn, 0);
    if (cr) drVs.cr[L] = dr[L] + cr;
    if (burn) drVs.burn[L] = dr[L] + burn;
    const parts = ps.filter(p => p.part).map(p => ({ name: p.g.rec.name, part: p.part, amount: p.amount }));
    if (parts.length) partial[L] = parts;
  }
  const layerPen = layered ? -1 : 0;
  if (layered) {
    A.DX += layerPen;
    add("WARN", `layered armour: -1 to DX and DX-based skills (DX ${f1(A.DX)})`, "B286");
  }
  const BL = basicLift(liftST);
  const carriedLbs = Math.round(gear.filter(g => g.carried).reduce((a, g) => a + g.weight, 0) * 1000) / 1000;
  let encLevel = ENC.findIndex(e => carriedLbs <= e.bl * BL);
  const overloaded = encLevel < 0;
  if (overloaded) encLevel = 4;
  const enc = { level: encLevel, name: ENC[encLevel].name, carried: carriedLbs, bl: BL, liftST, overloaded,
    limits: ENC.map(e => Math.round(e.bl * BL * 100) / 100), move: overloaded ? 0 : Math.max(1, Math.floor(A.Move * ENC[encLevel].move)) };
  if (A.Move < 1 && !overloaded) enc.move = Math.max(0, Math.floor(A.Move * ENC[encLevel].move));
  const dodgeBase = Math.floor(A.Speed) + 3 + extra.dodge;
  const dodge = encLevel ? Math.max(Math.min(1, dodgeBase), dodgeBase - encLevel) : dodgeBase;
  if (overloaded) add("ERROR", `carrying ${f1(carriedLbs)} lb, over 10 x Basic Lift (${f1(10 * BL)} lb): can't move`, "B17");
  else if (gear.length) add(encLevel >= 3 ? "WARN" : "ok", `carrying ${f1(carriedLbs)} lb, Basic Lift ${f1(BL)} lb: ${ENC[encLevel].name} encumbrance (${encLevel})${encLevel ? `, Move ${enc.move}, Dodge -${encLevel}` : ""}`, "B17");

  // bonus lookups
  const skillBonus = (name, spec, tags) => features.filter(f => f.type === "skill_bonus" && (f.selection_type || "skills_with_name") === "skills_with_name"
    && strCmp(f.name, name) && strCmp(f.specialization, spec || "") && (!f.tags || (tags || []).some(t => strCmp(f.tags, t)))).reduce((a, f) => a + f.amount, 0);
  const spellBonus = (rec) => features.filter(f => f.type === "spell_bonus" && (
    f.match === "all_colleges" || (f.match === "college_name" && (rec.college || []).some(c => strCmp(f.name, c))) ||
    (f.match === "spell_name" && strCmp(f.name, rec.name)) || (f.match === "power_source_name" && strCmp(f.name, rec.power || "")))).reduce((a, f) => a + f.amount, 0);
  const baseOf = k => A[k] ?? 10;

  // ---- skills
  const skillRows = (ch.skills || []).map((inst, i) => {
    const { name, spec } = splitSpec(inst.name, inst.spec);
    const path = `skills[${i}]`;
    const hit = findSkill(lib, name, spec);
    const row = { inst, name, spec, path, points: inst.points || 0, level: null };
    if (!hit.rec) { add("ERROR", `${fullName(name, spec)}: ${hit.why}`, "", path); return row; }
    if (hit.why) add("WARN", `${fullName(name, spec)}: ${hit.why}`, hit.rec.ref, path);
    const rec = hit.rec; row.rec = rec; row.attr = inst.attr || rec.attr; row.diff = rec.diff; row.ref = rec.ref; row.tags = rec.tags || [];
    if (row.points % 10) add("WARN", `${fullName(name, spec)}: ${row.points} pts is not a 10-point step`, rec.ref, path);
    if ((row.diff === "VH" || row.diff === "W") && row.points > 0 && row.points < 10) add("WARN", `${fullName(name, spec)}: very hard skills have no default, so under 10 pts gives no level`, rec.ref, path);
    if (row.diff === "W") add("WARN", `${fullName(name, spec)}: wildcard skills cost x3; costed here as very hard`, rec.ref, path);
    return row;
  });
  const skillByName = (name, spec) => skillRows.find(s => s.rec && lc(s.name) === lc(name) && (!spec || lc(s.spec) === lc(spec)));
  // defaulted level for a skill record (no points): best of its library defaults
  function defaultLevel(rec, depth = 0) {
    let best = null, from = null;
    for (const d of rec.defaults || []) {
      let v = null;
      if (d.type === "skill") {
        if (depth > 1) continue;
        const own = skillRows.find(s => s.rec && s.points > 0 && strCmp(d.name, s.name) && strCmp(d.specialization, s.spec || ""));
        if (own && own.level != null) v = own.level + (d.modifier || 0);
      } else {
        const k = FEATURE_ATTR[d.type];
        if (k) v = baseOf(k) + (d.modifier || 0);
        else if (/^\d+$/.test(d.type)) v = +d.type + (d.modifier || 0);
      }
      if (v != null && (best == null || v > best)) { best = v; from = d; }
    }
    return { level: best, from };
  }
  // two passes so skill-to-skill defaults see bought levels
  // technique: parent skill + default modifier + bought levels, capped at parent + limit (B229-B230).
  // Points x10: average +1 per 10; hard +1 at 20 then +1 per 10.
  function techniqueLevel(s) {
    const p = s.rec.parent, own = skillByName(p.name, p.spec);
    let parentL = own?.level ?? null;
    if (parentL == null) { const q = findSkill(lib, p.name, p.spec); if (q.rec) parentL = defaultLevel(q.rec).level; }
    s.attr = own?.attr || findSkill(lib, p.name, p.spec).rec?.attr || "DX";
    s.parentHas = !!own && own.points > 0;
    if (parentL == null) return null;
    const pts = s.points, bought = s.diff === "H" ? (pts >= 20 ? (pts - 10) / 10 : pts / 20) : pts / 10;
    let L = parentL + p.mod + bought;
    if (s.rec.limit != null) L = Math.min(L, parentL + s.rec.limit);
    return L;
  }
  for (let pass = 0; pass < 2; pass++) for (const s of skillRows) {
    if (!s.rec) continue;
    if (s.rec.technique) {
      s.level = techniqueLevel(s); s.bonus = 0; s.source = "technique";
      s.rel = s.level == null ? null : s.level - baseOf(s.attr);
      continue;
    }
    const bonus = skillBonus(s.name, s.spec, s.tags);
    const r = relLevel(s.points, s.diff);
    const bought = s.points > 0 && r != null ? baseOf(s.attr) + r : null;
    const dflt = defaultLevel(s.rec);
    let L = bought, src = "points";
    if (dflt.level != null && (L == null || dflt.level > L)) { L = dflt.level; src = "default"; }
    s.bonus = bonus; s.level = L == null ? null : L + bonus; s.source = src; s.defaultFrom = dflt.from;
    s.rel = s.level == null ? null : s.level - baseOf(s.attr);
  }
  // encumbrance penalty (B17: Climbing, Stealth, Swimming x2; Judo and Karate), after defaults so it isn't counted twice
  for (const s of skillRows) if (s.rec?.enc && s.level != null && encLevel) {
    s.encPen = -s.rec.enc * encLevel; s.level += s.encPen; s.rel += s.encPen;
  }
  const counted = new Map();
  for (const s of skillRows) {
    const k = lc(fullName(s.name, s.spec));
    if (counted.has(k)) add("WARN", `${fullName(s.name, s.spec)} listed twice`, s.ref, s.path);
    counted.set(k, 1);
    if (s.rec?.technique && !s.parentHas) add("WARN", `${fullName(s.name, s.spec)}: technique without points in its parent skill ${s.rec.parent.name}`, s.ref || "B229", s.path);
  }

  // ---- spells
  const spellRows = (ch.spells || []).map((inst, i) => {
    const rec = findOne(ix.spells, inst.name), path = `spells[${i}]`;
    const row = { inst, name: inst.name, points: inst.points || 0, path, level: null, rec, college: rec?.college || [], tags: rec?.tags || [] };
    if (!rec) { add("ERROR", `spell ${inst.name}: not in library`, "", path); return row; }
    row.ref = rec.ref; row.attr = rec.attr; row.diff = rec.diff;
    const r = row.points >= 10 ? relLevel(row.points, rec.diff) : null;
    row.bonus = spellBonus(rec);
    // clerical and druidic spells (DF1 p.19): Power Investiture replaces Magery, and the only prerequisite is the
    // minimum Power Investiture level on the god's list
    if (inst.power === "clerical" || inst.power === "druidic") {
      const need = lib.piSpells?.[inst.power]?.[rec.name];
      const pi = traits.find(t => (inst.power === "druidic" ? /^power investiture \(druidic\)$/i : /^power investiture$/i).test(t.name));
      row.power = inst.power; row.pi = pi ? (pi.levels || 0) : 0; row.piNeed = need ?? null; row.bonus = row.pi;
      if (need == null) add("ERROR", `spell ${inst.name}: not on the ${inst.power} list`, "DF1:19", path);
      else if (row.pi < need) add("ERROR", `spell ${inst.name}: needs Power Investiture${inst.power === "druidic" ? " (Druidic)" : ""} ${need}, has ${row.pi}`, "DF1:19", path);
    }
    row.level = r == null ? null : baseOf(rec.attr) + r + row.bonus;
    row.energy = spellEnergy(rec.cost, row.level);
    // any point total from 10 up: levels interpolate between the steps, as for skills
    if (row.points < 10) add("ERROR", `spell ${inst.name}: spells have no default; needs at least 10 pts`, rec.ref, path);
    return row;
  });

  // ---- prerequisites
  const pstate = { traits, skills: skillRows, spells: spellRows, attrs: A, tl: ctl };
  for (const t of traits) if (t.rec?.prereqs) {
    const r = checkPrereq(t.rec.prereqs, pstate);
    if (!r.ok) add("ERROR", `${t.name}: prerequisites missing: ${r.missing.join("; ")}`, t.rec.ref, t.path);
  }
  for (const s of skillRows) if (s.rec?.prereqs && s.points > 0) {
    const r = checkPrereq(s.rec.prereqs, pstate);
    if (!r.ok) add("ERROR", `${fullName(s.name, s.spec)}: prerequisites missing: ${r.missing.join("; ")}`, s.ref, s.path);
  }
  for (const s of spellRows) if (s.rec) {
    if (s.power) { s.prereqOk = s.piNeed != null && s.pi >= s.piNeed; s.missing = s.prereqOk ? [] : [`Power Investiture ${s.piNeed ?? "?"}`]; continue; }
    const r = checkPrereq(s.rec.prereqs, pstate);
    s.prereqOk = r.ok; s.missing = r.missing;
    if (!r.ok) add("ERROR", `spell ${s.name}: prerequisites missing: ${r.missing.join("; ")}`, s.ref, s.path);
    if (r.unchecked) add("WARN", `spell ${s.name}: ${r.unchecked}`, s.ref, s.path);
  }

  // ---- profession (Dungeon Fantasy): its choices, and whether what it gives is on the sheet. Template parts can be
  // changed in play, so a missing part is a warning.
  let profession = null;
  if (ch.profession?.name) {
    const prof = (lib.professions || []).find(p => lc(p.name) === lc(ch.profession.name));
    if (!prof) add("ERROR", `profession "${ch.profession.name}" not in library`, "", "profession");
    else {
      const picks = ch.profession.picks || {}, checks = profCheck(prof, picks), stamp = profStamp(prof, picks);
      for (const c of checks) if (!c.ok) add("WARN", c.kind === "spec" ? `${prof.name}: ${c.label}` : `${prof.name}: ${c.label}: ${c.kind === "points" ? `${c.have / 10} of ${c.n / 10} points` : `${c.have} of ${c.n} chosen`}`, prof.ref, "profession");
      for (const t of stamp.traits) if (!traits.some(x => lc(x.name) === lc(t.name) && (!t.notes || lc(x.notes || "") === lc(t.notes))))
        add("WARN", `${prof.name}: ${fullName(t.name, t.notes)} is not on the sheet`, prof.ref, "profession");
      for (const s of stamp.skills) { const have = skillRows.find(x => x.rec && lc(x.name) === lc(s.name) && (!s.spec || lc(x.spec || "") === lc(s.spec)));
        if (!have || have.points < s.points) add("WARN", `${prof.name}: ${fullName(s.name, s.spec)} ${s.points} pts ${have ? `(sheet has ${have.points})` : "is not on the sheet"}`, prof.ref, "profession"); }
      for (const s of stamp.spells) if (!spellRows.some(x => lc(x.name) === lc(s.name))) add("WARN", `${prof.name}: spell ${s.name} is not on the sheet`, prof.ref, "profession");
      if (checks.every(c => c.ok)) add("ok", `${prof.name}: every choice made`, prof.ref, "profession");
      // wizards in dungeon fantasy (DF1 p.20): Healing, Animal, Plant, Weather and Enchantment belong to others, and
      // teleport and time spells don't exist; a spell in another college too, or the only route to one, is allowed
      const W = lib.dfWizardly;
      if (W) for (const s of spellRows) if (s.rec && !s.power) {
        const off = !W.allowed.includes(s.rec.name) && s.college.length && s.college.every(c => W.colleges.includes(c));
        if (off || W.spells.includes(s.rec.name)) add("WARN", `spell ${s.name}: ${off ? `${s.college.join("/")} spells` : "teleport and time spells"} are off-limits to dungeon fantasy wizards unless another college's spell needs it`, W.ref, s.path);
      }
      profession = { rec: prof, checks, stamp };
    }
  }

  // ---- equipment, weapons, armour
  const weaponOf = [];
  const addWeapon = (label, rec, item, path, natural) => {
    const modes = weaponModes(item, rec, A).map(m => {
      let best = null, via = null;
      for (const d of m.defaults) {
        let v = null;
        if (d.type === "skill") {
          const own = skillRows.find(s => s.rec && strCmp(d.name, s.name) && strCmp(d.specialization, s.spec || ""));
          if (own && own.level != null) v = own.level + (d.modifier || 0);
          else {
            const q = d.name?.compare === "is" ? findSkill(lib, d.name.qualifier, d.specialization?.qualifier) : { rec: null };
            if (q.rec) { const dl = defaultLevel(q.rec); if (dl.level != null) v = dl.level + (d.modifier || 0); }
          }
        } else if (FEATURE_ATTR[d.type]) v = baseOf(FEATURE_ATTR[d.type]) + (d.modifier || 0);
        // on a tie, show the skill rather than the bare attribute
        if (v != null && (best == null || v > best || (v === best && d.type === "skill" && via?.type !== "skill"))) { best = v; via = d; }
      }
      const req = parseInt(m.strength, 10);
      let stPen = 0;
      if (!isNaN(req) && m.ratedST == null && req > A.ST) stPen = -Math.ceil(req - A.ST);
      if (!isNaN(req) && m.ratedST == null && req > A.ST) add("WARN", `${label} (${m.usage}): needs ST ${req}, has ${f1(A.ST)}: ${stPen} to hit`, "B270", path);
      if (m.ratedST != null && m.ratedST > A.ST) add("WARN", `${label}: rated ST ${m.ratedST} above wielder ST ${f1(A.ST)}; cocking needs a device or extra time`, rec.ref, path);
      if (m.unparsed) add("WARN", `${label} (${m.usage}): damage "${m.unparsed}" not parsed`, rec.ref, path);
      const skillName = via ? (via.type === "skill" ? fullName(via.name?.qualifier, via.specialization?.qualifier) : (FEATURE_ATTR[via.type] || via.type)) : "?";
      const hasSkill = via?.type === "skill" && !!skillRows.find(s => s.rec && s.points > 0 && strCmp(via.name, s.name) && strCmp(via.specialization, s.spec || ""));
      // fencing weapons: attacks and parries take the encumbrance level as a penalty (B208)
      const fencing = via?.type === "skill" && FENCING_SKILLS.test(via.name?.qualifier || "");
      const encPen = fencing && encLevel ? -encLevel : 0;
      const raw = best == null ? null : best + stPen;
      // Parry and Block: 3 + half skill, fractions dropped (B375-B376), plus the weapon's modifier and trait bonuses
      const def = (s, bonus) => { const p = /^([+-]?\d+)\s*([A-Z]*)$/i.exec(String(s ?? "").trim()); return raw == null || !p ? null : Math.floor(3 + raw / 2) + +p[1] + bonus; };
      const parryLevel = m.melee ? def(m.parry, extra.parry) : null;
      return { ...m, level: raw == null ? null : raw + encPen, via, skillName: skillName + (via?.modifier ? (via.modifier > 0 ? "+" : "") + via.modifier : ""), hasSkill, stPen, encPen,
        parryLevel: parryLevel == null ? null : parryLevel + encPen, parryFlags: /^[+-]?\d+\s*([A-Z]*)$/i.exec(String(m.parry ?? "").trim())?.[1] || "", blockLevel: def(m.block, extra.block), fencing };
    });
    if (modes.length) weaponOf.push({ name: label, rec, item, modes, natural: !!natural, path });
  };
  // gear bonuses: boots add to kicks (weapon_bonus by name), kits add to a skill when used (B345, offered in the roller)
  const ready = g => g.rec && g.carried && g.item.worn !== false;
  const gearBonus = gear.filter(ready).flatMap(g => (g.rec.bonuses || []).map(b => ({ ...b, source: g.rec.name })));
  const kickBonus = label => gearBonus.filter(b => b.type === "weapon_bonus" && b.selection_type === "weapons_with_name" && strCmp(b.specialization, label)).reduce((a, b) => Math.max(a, b.amount), 0);
  const gearMods = gearBonus.filter(b => b.type === "skill_bonus" && b.amount > 0).map(b => ({ name: b.name, amount: b.amount, source: b.source }));
  let db = 0, dbFrom = null;
  for (const g of gear) {
    const { item, rec, path, qual } = g;
    if (!rec) { add("ERROR", `${item.name}: not in library`, "", path); continue; }
    if (qual.error) add("ERROR", `${item.name}: ${qual.error}`, qual.ref, path);
    else if (item.quality) add("ok", `${item.name}: ${lc(item.quality)} (cost x${qual.mult}${qual.notes.length ? "; " + qual.notes.join("; ") : ""})`, qual.ref, path);
    if (!g.carried) continue;
    // a shield or cloak in hand: its Defense Bonus goes on every active defence against attacks from the front or shield side (B287)
    if (rec.db && item.worn !== false && rec.db > db) { db = rec.db; dbFrom = rec.name; }
    addWeapon(item.label || item.name + (item.st ? ` (ST ${item.st})` : ""), rec, { ...item, qual }, path);
  }
  const gearConds = gear.filter(ready).flatMap(g => (g.rec.conds || []).map(c => ({ ...c, source: g.rec.name })));
  // weapons that come with traits: Strikers (horns, tails), Claws, Teeth, Hooves, Innate Attacks. Afflictions and
  // Binding do no injury, so the injury roller does not fit them; they are left out. A trait's punch or kick (Blunt
  // Claws) replaces the plain one.
  const traitWeapons = traits.map(t => ({ t, ws: (t.rec?.weapons || []).filter(w => !/^(aff|binding)$/.test(w.dmg.type) && (w.dmg.st || w.dmg.base || w.dmg.leveled)) })).filter(x => x.ws.length);
  const replaced = new Set(traitWeapons.flatMap(x => x.ws.map(w => lc(w.usage))).filter(Boolean));
  for (const n of NATURAL(lib)) if (!n.weapons.every(w => replaced.has(lc(w.usage)))) addWeapon(n.name, n, { usageBonus: kickBonus }, "natural", true);
  for (const { t, ws } of traitWeapons) {
    const weak = (t.mods || []).some(m => /^weak$/i.test(m.name));
    addWeapon(fullName(t.name, t.inst.notes), { ...t.rec, weapons: ws }, { levels: t.levels, noPerDie: weak, usageBonus: kickBonus }, t.path, true);
  }

  // ---- money (B25-B27): starting wealth for the campaign TL ("tl"), times the Wealth level. Items above the campaign TL
  // double in price per TL (B27). "free": true marks an item not bought from starting wealth (loot, Signature Gear).
  let money = null;
  const wealthT = traits.find(t => WEALTH_MULT[lc(t.name)] != null || /^multimillionaire$/i.test(t.name));
  const wMult = !wealthT ? 1 : /^multimillionaire$/i.test(wealthT.name) ? 100 * 10 ** (wealthT.levels || 1) : WEALTH_MULT[lc(wealthT.name)];
  const itemCost = g => { if (!g.rec) return 0; const it = tlNum(g.rec.tl), up = ctl != null && it != null && it > ctl ? 2 ** (it - ctl) : 1;
    return Math.round(g.rec.cost * g.qual.mult * up * g.qty * 100) / 100; };
  for (const g of gear) { g.cost = itemCost(g); if (g.rec && ctl != null && tlNum(g.rec.tl) > ctl) add("ok", `${g.item.name}: TL${g.rec.tl} in a TL${ctl} campaign, x${2 ** (tlNum(g.rec.tl) - ctl)} price`, "B27", g.path); }
  if (ctl != null) {
    const start = TL_WEALTH[Math.min(12, Math.max(0, ctl))] * wMult;
    const limit = ch.settled ? start * 0.2 : start;
    const spentCash = Math.round(gear.filter(g => !g.item.free).reduce((a, g) => a + g.cost, 0) * 100) / 100;
    money = { tl: ctl, wealth: wealthT ? wealthT.name + (/^multimillionaire$/i.test(wealthT.name) ? " " + (wealthT.levels || 1) : "") : "Average", mult: wMult, start, settled: !!ch.settled, limit, spent: spentCash, left: Math.round((limit - spentCash) * 100) / 100 };
    const txt = `$${spentCash} of $${limit}${ch.settled ? ` (20% of $${start}: settled lifestyle, B26)` : ""} starting wealth at TL${ctl}${wMult !== 1 ? `, ${money.wealth} x${wMult}` : ""}`;
    add(spentCash > limit ? "ERROR" : "ok", spentCash > limit ? `equipment costs ${txt}: $${f1(spentCash - limit)} over` : `equipment: ${txt}, $${money.left} left`, "B27");
  } else if (gear.some(g => !g.item.free && g.rec?.cost)) add("WARN", `no campaign TL ("tl"): starting wealth not checked`, "B27");

  // ---- energy for spells: FP plus one Powerstone at a time (M20, M69); the rest of a spell's cost comes from HP (M8)
  const stones = gear.filter(g => g.carried && g.rec && POWERSTONE.test(g.rec.name)).flatMap(g => Array(g.qty).fill(+POWERSTONE.exec(g.rec.name)[1])).sort((a, b) => b - a);
  const energy = { FP: A.FP, stones, largest: stones[0] || 0 };
  for (const s of spellRows) if (s.energy != null && s.energy > A.FP + energy.largest)
    add("WARN", `spell ${s.name}: costs ${s.energy} energy; FP ${f1(A.FP)}${energy.largest ? ` + Powerstone ${energy.largest}` : ""} = ${f1(A.FP + energy.largest)}, the rest would come from HP, at -1 to the spell roll per HP`, "M8, B237", s.path);
  // natural DR from traits (Damage Resistance, Tough Skin etc.) stacks on armour
  const traitDR = features.filter(f => f.type === "dr_bonus");
  const natDR = {}; LOCS.forEach(l => natDR[l.name] = 0);
  for (const f of traitDR) for (const loc of f.locations || ["all"]) for (const L of DR_LOC[loc] || []) natDR[L] += f.amount;
  for (const k in dr) dr[k] += natDR[k];
  for (const t in drVs) for (const k in drVs[t]) drVs[t][k] += natDR[k];

  // ---- conditionals and reactions, for the roller and the sheet
  const conditionals = [...features.filter(f => f.type === "conditional_modifier").map(f => ({ situation: f.situation, amount: f.amount, source: f.source })), ...gearConds];
  const reactions = features.filter(f => f.type === "reaction_bonus").map(f => ({ situation: f.situation, amount: f.amount, source: f.source }));

  // ---- points
  const sum = a => a.reduce((x, y) => x + y, 0);
  const attrPts = sum(ATTR_KEYS.map(k => pts[k]));
  const tplAttrPts = sum(ATTR_KEYS.map(k => tplAttrs[k] || 0));
  const tplTraitPts = sum(traits.filter(t => t.from).map(t => t.cost));
  const adv = sum(traits.filter(t => !t.from && t.cost > 0).map(t => t.cost));
  const disadv = sum(traits.filter(t => t.cost < 0 && t.kind !== "quirk").map(t => t.cost));
  const quirks = traits.filter(t => t.kind === "quirk" && !t.from);
  const skillPts = sum(skillRows.map(s => s.points)), spellPts = sum(spellRows.map(s => s.points));
  const spent = attrPts + sum(traits.map(t => t.cost)) + skillPts + spellPts;
  const breakdown = { template: tplAttrPts + tplTraitPts, attributes: attrPts - tplAttrPts, advantages: adv, disadvantages: sum(traits.filter(t => !t.from && t.cost < 0 && t.kind !== "quirk").map(t => t.cost)), quirks: sum(quirks.map(t => t.cost)), skills: skillPts, spells: spellPts };

  if (budget) {
    if (spent > budget) add("ERROR", `points: ${spent} spent, budget ${budget} (${spent - budget} over)`, "B10");
    else if (spent < budget) add("WARN", `points: ${spent} spent, budget ${budget} (${budget - spent} unspent)`, "B10");
    else add("ok", `points: ${spent} / ${budget}`, "B10");
    if (-disadv > budget / 2) add("WARN", `disadvantages total ${disadv}, past the usual limit of -${budget / 2} (50% of starting points)`, "B11");
  }
  if (quirks.length > 5) add("WARN", `${quirks.length} quirks; the usual limit is five`, "B162");

  // ---- allies: each has its own sheet, built on a share of this character's starting points
  const allies = traits.filter(t => /^ally\b/i.test(t.name) && t.inst.character).map(t => {
    const share = (t.mods || []).map(m => m.name.match(/^(\d+)% of your starting points/)).find(Boolean);
    const pct = share ? +share[1] : null;
    if (pct == null) add("ERROR", `${fullName(t.name, t.notes)}: choose a point-total modifier (e.g. "100% of your starting points")`, "B37", t.path);
    const allyBudget = pct == null ? null : Math.round(budget * pct / 100);
    const res = compute(t.inst.character, lib, { budget: allyBudget ?? t.inst.character.budget, depth: (opts.depth || 0) + 1, tl: ctl });
    for (const x of res.issues) issues.push({ ...x, msg: `ally ${t.inst.character.name || t.notes}: ${x.msg}`, path: `${t.path}.character${x.path ? "." + x.path : ""}` });
    return { trait: t, pct, budget: allyBudget, result: res };
  });
  for (const t of traits) if (/^ally\b/i.test(t.name) && !t.inst.character) add("WARN", `${fullName(t.name, t.notes)}: no ally sheet ("character") attached`, "B36", t.path);

  // ---- ok lines for the report
  for (const s of skillRows) if (s.rec && s.level != null) add("ok", `${fullName(s.name, s.spec)} ${s.attr}/${s.diff} ${s.points} pts: level ${f1(s.level)}${s.source === "default" ? " (default)" : ""}, ${succPct(s.level)}%`, s.ref, s.path);
  for (const s of spellRows) if (s.rec && s.level != null && s.prereqOk) add("ok", `spell ${s.name} ${s.attr}/${s.diff} ${s.points} pts: level ${f1(s.level)}, ${succPct(s.level)}%`, s.ref, s.path);

  return {
    name: ch.name, budget, spent, breakdown, attrs: A, layerPen, drVs, drPartial: partial, attrPoints: pts, attrBonus, extra, dodge, dodgeBase, db, dbFrom, enc, gear, money, energy, gearMods, thr, sw,
    traits, templateRemoved: removed, profession, skills: skillRows, spells: spellRows, weapons: weaponOf, dr, natDR, conditionals, reactions, allies, templates: tpl, issues,
    houseBackstab: traits.some(t => /^backstabber$/i.test(t.name)),
    sneakDice: traits.filter(t => /^sneak attack$/i.test(t.name)).reduce((a, t) => a + (t.levels || 1), 0),
  };
}

G.BC = {
  CUM, PMF, cdfInt, cdf, inv, succPct, critS, critF, bands, resolve, f1,
  ATTR_COST, ATTR_KEYS, ATTR_REF, DIFF_BASE, DEFAULT_PEN, DIFF_NAME, relLevel, thrust, swing, diceTxt, parseDice,
  LOCS, TYPE_NAME, locMult, typeKnown, GRADES, injuryDist, rollInjury,
  CR_MULT, FR_MULT, parseAdj, traitCost, selectMods, modLabel, generalLabel, modRules, strCmp, numCmp, splitSpec, fullName,
  ENC, TL_WEALTH, WEALTH_MULT, lbs, basicLift, itemClass, itemQuality, spellEnergy,
  profOptCost, profWalk, profChoices, profCheck, profStamp,
  indexLibrary, findSkill, checkPrereq, compute,
};
})(typeof globalThis !== "undefined" ? globalThis : window);
