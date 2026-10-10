#!/usr/bin/env node
/* Convert the GCS master library (https://github.com/richardwilkes/gcs_master_library, MPL 2.0)
   into this project's library: names, costs x10, attribute/difficulty, defaults, prerequisites,
   features, damage, page references. No rules text.

   Usage: node tools/gcs_convert.mjs <path to gcs_master_library checkout>
   Writes data/library.json and data/library.js (the same data as a classic script for the builder).
   Hand-authored files in data/src/ are merged in: house rules, circumstances, natural attacks. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const ROOT = path.resolve(HERE, "..");
const libRoot = process.argv[2];
if (!libRoot) { console.error("usage: node tools/gcs_convert.mjs <gcs_master_library>"); process.exit(2); }
const L = p => path.join(libRoot, "Library", p);

// Which books to take. Order matters: the first record with a given name wins.
const SOURCES = {
  skills: ["Basic Set/Basic Set Skills.skl", "Magic/Magic Skills.skl"],
  traits: ["Basic Set/Basic Set Traits.adq"],
  spells: ["Magic/Magic Spells.spl"],
  equipment: ["Basic Set/Basic Set Equipment.eqp", "Magic/Magic Equipment.eqp"],
  templates: ["Basic Set/Races", "Basic Set/Meta-Traits", "Fantasy/Races"],
  modifiers: ["Basic Set/Basic Set Enhancement Modifiers.adm", "Basic Set/Basic Set Limitation Modifiers.adm"],
};

const read = f => JSON.parse(fs.readFileSync(f, "utf8"));
function* walk(rows) { for (const r of rows || []) { yield r; yield* walk(r.children); } }
// drop GCS bookkeeping ids from nested structures
const clean = o => JSON.parse(JSON.stringify(o ?? null, (k, v) => k === "id" || k === "calc" ? undefined : v));
const PLACEHOLDER = /\s*\(@([^@]*)@\)\s*$/;
const stripAt = s => String(s ?? "").replace(/@/g, "").trim();
const ATTR = { dx: "DX", iq: "IQ", ht: "HT", st: "ST", per: "Per", will: "Will" };
const DIFF = { e: "E", a: "A", h: "H", vh: "VH", w: "W" };
function attrDiff(s) { const [a, d] = String(s).split("/"); return { attr: ATTR[a] || a, diff: DIFF[d] || d }; }
const x10adj = adj => {
  const s = String(adj ?? "").trim();
  if (!s || /^x/i.test(s) || s.endsWith("%")) return s;
  const n = parseFloat(s); return isNaN(n) ? s : String(n * 10);
};
function kindOf(tags, pts) {
  const t = (tags || []).map(x => x.toLowerCase());
  if (t.includes("quirk")) return "quirk";
  if (t.includes("perk")) return "perk";
  if (t.includes("disadvantage")) return "disadvantage";
  if (t.includes("advantage")) return "advantage";
  if (t.includes("feature")) return "feature";
  return pts < 0 ? "disadvantage" : "advantage";
}

function convMods(mods, group) {
  const out = [];
  for (const m of mods || []) {
    if (m.children?.length) { out.push(...convMods(m.children, stripAt(m.name))); continue; }
    const r = { name: stripAt(m.name), adj: x10adj(m.cost_adj) };
    if (group) r.group = group;
    if (m.affects && m.affects !== "total") r.affects = m.affects;
    if (!m.disabled) r.on = true;
    if (m.levels) r.levels = m.levels;
    if (m.reference) r.ref = m.reference;
    out.push(r);
  }
  return out;
}

function convTrait(r) {
  const m = r.name.match(PLACEHOLDER);
  const rec = { type: "trait", name: m ? r.name.replace(PLACEHOLDER, "") : r.name };
  if (m) rec.sub = m[1];
  const base = (r.base_points || 0) * 10, ppl = (r.points_per_level || 0) * 10;
  if (base) rec.base = base;
  if (r.can_level) { rec.canLevel = true; rec.perLevel = ppl; }
  if (r.max_levels) rec.maxLevels = parseInt(r.max_levels, 10) || undefined;
  if (r.cr) rec.cr = r.cr;
  if (r.frequency) rec.fr = r.frequency;
  if (r.round_down) rec.roundDown = true;
  rec.kind = kindOf(r.tags, base + ppl);
  const mods = convMods(r.modifiers);
  if (mods.length) rec.mods = mods;
  if (r.features?.length) rec.features = clean(r.features);
  if (r.prereqs?.prereqs?.length) rec.prereqs = clean(r.prereqs);
  rec.tags = r.tags || [];
  rec.ref = r.reference || "";
  return rec;
}

const out = { meta: {}, skills: [], traits: [], spells: [], equipment: [], templates: [], modifiers: [], natural: [], circumstances: [] };
const seen = { skills: new Set(), traits: new Set(), spells: new Set(), equipment: new Set(), templates: new Set(), modifiers: new Set() };
const dupes = [];
const push = (kind, key, rec, src) => { if (seen[kind].has(key)) { dupes.push(`${kind}: ${key} (${src})`); return; } seen[kind].add(key); out[kind].push(rec); };

for (const f of SOURCES.skills) for (const r of walk(read(L(f)).rows)) {
  if (r.children) continue;
  if (!String(r.difficulty).includes("/")) {
    // technique: bought up from a parent skill's default, capped at parent + limit (B229). The parent
    // skill becomes the specialization, so "Arm Lock (Judo)" and "Arm Lock (Wrestling)" are separate.
    const d = r.default || {};
    const parent = d.name?.qualifier || "";
    const rec = { type: "technique", name: r.name, technique: true, diff: DIFF[r.difficulty] || r.difficulty,
      spec: d.specialization?.qualifier ? `${parent} (${d.specialization.qualifier})` : parent,
      parent: { name: parent, spec: d.specialization?.qualifier || "", mod: d.modifier || 0 } };
    if (r.limit != null) rec.limit = r.limit;
    if (r.prereqs?.prereqs?.length) rec.prereqs = clean(r.prereqs);
    rec.tags = r.tags || []; rec.ref = r.reference || "";
    push("skills", `${r.name.toLowerCase()}|${rec.spec.toLowerCase()}`, rec, f);
    continue;
  }
  const { attr, diff } = attrDiff(r.difficulty);
  const rec = { type: "skill", name: r.name, attr, diff };
  if (r.specialization) rec.spec = r.specialization;
  if (r.tech_level != null) rec.tl = true;
  if (r.defaults?.length) rec.defaults = clean(r.defaults);
  if (r.prereqs?.prereqs?.length) rec.prereqs = clean(r.prereqs);
  if (r.features?.length) rec.features = clean(r.features);
  rec.tags = r.tags || []; rec.ref = r.reference || "";
  push("skills", `${r.name.toLowerCase()}|${(r.specialization || "").toLowerCase()}`, rec, f);
}

for (const f of SOURCES.traits) for (const r of walk(read(L(f)).rows)) {
  if (r.children || r.container_type) continue;
  const rec = convTrait(r);
  push("traits", `${rec.name.toLowerCase()}|${rec.ref}|${rec.base || 0}|${rec.perLevel || 0}`, rec, f);
}

for (const f of SOURCES.spells) for (const r of walk(read(L(f)).rows)) {
  if (r.children) continue;
  const { attr, diff } = attrDiff(r.difficulty);
  const sm = r.name.match(PLACEHOLDER);
  const rec = { type: "spell", name: sm ? r.name.replace(PLACEHOLDER, "") : r.name, college: r.college || [], attr, diff, class: r.spell_class || "",
    cost: r.casting_cost || "", maint: r.maintenance_cost || "", time: r.casting_time || "", duration: r.duration || "" };
  if (sm) rec.sub = sm[1];
  if (r.resist) rec.resist = r.resist;
  if (r.power_source) rec.power = r.power_source;
  if (r.prereqs?.prereqs?.length) rec.prereqs = clean(r.prereqs);
  rec.tags = r.tags || []; rec.ref = r.reference || "";
  push("spells", rec.name.toLowerCase(), rec, f);
}

for (const f of SOURCES.equipment) for (const r of walk(read(L(f)).rows)) {
  if (r.children?.length && !r.weapons) continue;
  const rec = { type: "equipment", name: r.description, tl: r.tech_level ?? "", cost: +r.base_value || 0, weight: r.base_weight || "" };
  if (r.rated_strength) rec.ratedST = r.rated_strength;
  if (r.weapons?.length) rec.weapons = r.weapons.map(w => ({
    usage: w.usage || "", dmg: { st: w.damage?.st || null, base: w.damage?.base || "", type: w.damage?.type || "" },
    dmgText: w.calc?.damage || "", strength: w.strength || "", reach: w.reach, parry: w.parry, acc: w.accuracy, range: w.range,
    rof: w.rate_of_fire, shots: w.shots, bulk: w.bulk, defaults: clean(w.defaults || []),
  }));
  const dr = (r.features || []).filter(x => x.type === "dr_bonus").map(x => ({ locations: x.locations || [x.location], amount: x.amount }));
  if (dr.length) rec.dr = dr;
  rec.tags = r.tags || []; rec.ref = r.reference || "";
  push("equipment", rec.name.toLowerCase(), rec, f);
}

for (const dir of SOURCES.templates) {
  const full = L(dir);
  if (!fs.existsSync(full)) { console.error(`missing ${dir}`); continue; }
  const book = dir.split("/")[0];
  for (const file of fs.readdirSync(full).filter(x => x.endsWith(".gct")).sort()) {
    const d = read(path.join(full, file));
    const traits = [];
    for (const r of walk(d.traits)) {
      if (r.container_type || r.children) continue;
      const rec = convTrait(r);
      const inst = { name: rec.name, rec };
      if (r.can_level) inst.levels = r.levels ?? 0; // GCS omits zero levels
      if (r.cr) inst.cr = r.cr;
      if (rec.sub) inst.notes = rec.sub;
      if (r.calc?.points != null) inst.points = r.calc.points * 10;
      traits.push(inst);
    }
    let name = file.replace(/\.gct$/, "");
    if (seen.templates.has(name.toLowerCase())) name = `${name} (${book})`;
    const top = d.traits?.[0];
    const rec = { type: "template", name, book, ref: top?.reference || "", traits };
    if (d.skills?.length || d.spells?.length || d.equipment?.length) rec.ignored = "skills/spells/equipment in this template were not converted";
    push("templates", name.toLowerCase(), rec, `${dir}/${file}`);
  }
}

// general enhancements and limitations (B101-B117): reference list only. Traits still take modifiers from their own
// mods; several entries share a name and differ by notes ("Limited Use", "Once per day")
for (const f of SOURCES.modifiers) for (const r of walk(read(L(f)).rows.map(function tag(p) { for (const c of p.children || []) { c._parent = p; tag(c); } return p; }))) {
  if (r.children) continue;
  const g = r._parent;
  const rec = { type: "modifier", kind: /Limitation/.test(f) ? "limitation" : "enhancement", name: stripAt(r.name).replace(/\s*\(\)$/, "") };
  const notes = stripAt(r.local_notes || "").replace(/<script>.*<\/script>/, "").trim();
  if (notes) rec.notes = notes;
  rec.adj = x10adj(r.cost_adj);
  if (g) rec.group = stripAt(g.name);
  if (r.levels) rec.levels = r.levels;
  rec.ref = r.reference || "";
  push("modifiers", `${rec.name}|${notes}|${rec.adj}`.toLowerCase(), rec, f);
}

// hand-authored data
const SRC = path.join(ROOT, "data", "src");
const house = read(path.join(SRC, "house-rules.json"));
for (const t of house.traits) out.traits.unshift({ ...t, house: true });
out.natural = read(path.join(SRC, "natural.json")).natural;
out.circumstances = read(path.join(SRC, "circumstances.json")).circumstances;

let commit = "";
try { commit = execFileSync("git", ["-C", libRoot, "log", "-1", "--format=%h %cs"], { encoding: "utf8" }).trim(); } catch { }
out.meta = {
  source: "GCS master library, https://github.com/richardwilkes/gcs_master_library",
  license: "Mozilla Public License 2.0 (library data). Converted for personal use; costs are GURPS x10.",
  commit, books: SOURCES,
  counts: Object.fromEntries(["skills", "traits", "spells", "equipment", "templates", "modifiers", "natural", "circumstances"].map(k => [k, out[k].length])),
};

fs.writeFileSync(path.join(ROOT, "data", "library.json"), JSON.stringify(out));
fs.writeFileSync(path.join(ROOT, "data", "library.js"), `/* generated by tools/gcs_convert.mjs; do not edit */\nglobalThis.BC_LIBRARY=${JSON.stringify(out)};\n`);
console.log(out.meta.counts, commit);
if (dupes.length) console.log(`${dupes.length} duplicate names skipped (first kept), e.g.`, dupes.slice(0, 5));
