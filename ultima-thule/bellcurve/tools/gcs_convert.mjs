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
  // the Basic Set first: where two books share a name, the first record found is the one a plain name gets.
  // The other books are for the professions they hold (see data/src/professions.json).
  skills: ["Basic Set/Basic Set Skills.skl", "Magic/Magic Skills.skl", "Martial Arts/Martial Arts Skills.skl", "Action/Action Skills.skl",
    "Monster Hunters/Monster Hunters Skills.skl", "Fantasy/Fantasy Skills.skl", "Supers/Supers Skills.skl", "Psionics/Psionics Skills.skl",
    "Mysteries/Mysteries Skills.skl", "Infinite Worlds/Infinite Worlds Skills.skl", "High Tech/High Tech Skills.skl", "Gun Fu/Gun Fu Skills.skl",
    "Power Ups/Power Ups Skills.skl", "Thaumatology/Thaumatology - RPM Skills.skl", "Thaumatology/Thaumatology - CEP Skills.skl",
    "Reign of Steel Will to Live/Reign of Steel Will to Live Skills.skl", "Tales of the Solar Patrol/Solar Patrol Skills.skl"],
  traits: ["Basic Set/Basic Set Traits.adq", "Dungeon Fantasy/Dungeon Fantasy 1/Dungeon Fantasy 1 Traits.adq",
    "Dungeon Fantasy/Dungeon Fantasy 3/Dungeon Fantasy 3 Traits.adq", "Dungeon Fantasy/Dungeon Fantasy 4/Dungeon Fantasy 4 Traits.adq",
    "Martial Arts/Martial Arts Traits.adq", "Powers/Powers Traits.adq", "Powers/Powers - Divine Favor Traits.adq", "Powers/Powers - Enhanced Senses Traits.adq",
    "Power Ups/Power Ups Traits.adq", "Action/Action Traits.adq", "Monster Hunters/Monster Hunters Traits.adq", "Horror/Horror Traits.adq",
    "Fantasy/Fantasy Traits.adq", "Banestorm/Banestorm Traits.adq", "Supers/Supers Traits.adq", "Psionics/Psionics Traits.adq",
    "Mysteries/Mysteries Traits.adq", "Space/Space Traits.adq", "Bio-Tech/Bio-Tech Traits.adq", "Infinite Worlds/Infinite Worlds Traits.adq",
    "High Tech/High Tech Traits.adq", "Ultra Tech/Ultra Tech Traits.adq", "Gun Fu/Gun Fu Traits.adq",
    "Thaumatology/Thaumatology - Magical Styles Traits.adq", "Thaumatology/Thaumatology - Sorcery Traits.adq", "Thaumatology/Thaumatology - Threshold Magic Traits.adq",
    "Thaumatology/Thaumatology - RPM Traits.adq", "Thaumatology/Thaumatology - CEP Traits.adq",
    "Reign of Steel Will to Live/Reign of Steel Will to Live Traits.adq", "Tales of the Solar Patrol/Solar Patrol Traits.adq"],
  spells: ["Magic/Magic Spells.spl", "Dungeon Fantasy/Dungeon Fantasy Spells.spl", "Bio-Tech/Bio-Tech Spells.spl"],
  equipment: ["Basic Set/Basic Set Equipment.eqp", "Magic/Magic Equipment.eqp"],
  // racial and meta-trait templates (no choices): the Basic Set and Fantasy first, then the books Andrew owns
  templates: ["Basic Set/Races", "Basic Set/Meta-Traits", "Fantasy/Races", "Fantasy/Meta-Traits", "Magic/Meta-Traits",
    "Dungeon Fantasy/Races", "Banestorm/Races", "Bio-Tech/Races", "Ultra Tech/Races", "Horror/Meta-Traits", "Lands Out of Time/Races",
    "Reign of Steel Will to Live/Meta-Traits", "Fantasy Folk/Elves/Racial Templates", "Fantasy Folk/Goblins and Hobgoblins/Racial Templates",
    "Fantasy Folk/Kobolds/Racial Templates"],
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

// a weapon on an item or a trait. perDie: "+1 per die" (Strikers, Claws, Hooves; Weak Bite is -2); leveled: damage per
// level of the trait (Innate Attack "1d").
const convWeapon = w => ({
  usage: w.usage || "",
  dmg: { st: w.damage?.st || null, base: w.damage?.base || "", type: w.damage?.type || "",
    ...(w.damage?.modifier_per_die ? { perDie: w.damage.modifier_per_die } : {}), ...(w.damage?.base_leveled ? { leveled: w.damage.base_leveled } : {}) },
  dmgText: w.calc?.damage || "", strength: w.strength || "", reach: w.reach, parry: w.parry, ...(w.block != null ? { block: w.block } : {}), acc: w.accuracy, range: w.range,
  rof: w.rate_of_fire, shots: w.shots, bulk: w.bulk, defaults: clean(w.defaults || []),
});

function convMods(mods, group) {
  const out = [];
  for (const m of mods || []) {
    if (m.children?.length) { out.push(...convMods(m.children, stripAt(m.name))); continue; }
    const r = { name: stripAt(m.name), adj: x10adj(m.cost_adj) };
    if (group) r.group = group;
    if (m.affects && m.affects !== "total") r.affects = m.affects;
    if (!m.disabled) r.on = true;
    if (m.levels) r.levels = m.levels;
    if (m.use_level_from_trait) r.perTrait = true;
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
  if (r.weapons?.length) rec.weapons = r.weapons.map(convWeapon);
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
  // encumbrance level times this is a penalty to the skill (B17: Climbing, Stealth; Swimming x2; Judo, Karate)
  if (r.encumbrance_penalty_multiplier) rec.enc = r.encumbrance_penalty_multiplier;
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
  if (r.weapons?.length) rec.weapons = r.weapons.map(convWeapon);
  // vs: crushing (mail's lower DR, B283 note [3]), burning or corrosion (only against those), frontal or underside (partial cover)
  const dr = (r.features || []).filter(x => x.type === "dr_bonus").map(x => ({ locations: x.locations || [x.location], amount: x.amount, ...(x.specialization ? { vs: x.specialization } : {}) }));
  if (dr.length) rec.dr = dr;
  // layering (B286) needs the inner layer flexible and concealable; GCS records both in the notes, as the book's tables do
  if (dr.length && /flexible/i.test(r.local_notes || "")) rec.flexible = true;
  if (dr.length && /concealable/i.test(r.local_notes || "")) rec.concealable = true;
  // a shield's or cloak's Defense Bonus (B287) is a conditional bonus to all three active defences; other conditional
  // bonuses (the large shield's -2 off-hand attacks, a suit's Diagnosis modifier) are kept as situational notes
  const conds = (r.features || []).filter(x => x.type === "conditional_modifier");
  const db = conds.find(x => /dodge, parry (&|and) block/i.test(x.situation || ""));
  if (db) rec.db = db.amount;
  const other = conds.filter(x => x !== db).map(x => ({ situation: String(x.situation).trim(), amount: x.amount }));
  if (other.length) rec.conds = other;
  // tool kits add to a skill when used (B345); boots add to kicks
  const bon = (r.features || []).filter(x => x.type === "skill_bonus" || x.type === "weapon_bonus").map(clean);
  if (bon.length) rec.bonuses = bon;
  if (r.local_notes) rec.notes = r.local_notes;
  if (r.legality_class) rec.lc = r.legality_class;
  rec.tags = r.tags || []; rec.ref = r.reference || "";
  push("equipment", rec.name.toLowerCase(), rec, f);
}

// every .gct under a folder, sub-folders included (Dungeon Fantasy's races sit in Elves/, Half-Spirits/ and so on)
const gctFiles = dir => fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
  .flatMap(e => e.isDirectory() ? gctFiles(path.join(dir, e.name)) : e.name.endsWith(".gct") ? [path.join(dir, e.name)] : []);
for (const dir of SOURCES.templates) {
  const full = L(dir);
  if (!fs.existsSync(full)) { console.error(`missing ${dir}`); continue; }
  const book = dir.split("/")[0];
  for (const fp of gctFiles(full)) {
    const file = path.basename(fp);
    const d = read(fp);
    const traits = [];
    // a container's own percentage modifiers (a Power Modifier of -10%) apply to every trait inside it
    const leaves = (rows, inherit = []) => (rows || []).flatMap(r => {
      const mods = (r.modifiers || []).filter(m => !m.disabled && /%\s*$/.test(String(m.cost_adj ?? ""))).map(m => ({ name: stripAt(m.name), adj: String(m.cost_adj).trim(), container: true }));
      return r.children ? leaves(r.children, [...inherit, ...(r.container_type || r.children ? mods : [])]) : [{ r, inherit }];
    });
    for (const { r, inherit } of leaves(d.traits)) {
      if (r.container_type) continue;
      const rec = convTrait(r);
      const inst = { name: rec.name, rec };
      if (inherit.length) inst.modifiers = inherit.map(x => ({ ...x }));
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

// ---- Dungeon Fantasy professions and spell lists (DF1 pp.4-20). GCS's DF profession files have errors (Barbarian's
// weapon packages and Basic Speed), so these are parsed from the book by rules/df_professions.mjs (local only) and kept,
// as names, costs and choice rules, in data/src/professions.json.
{
  const pf = read(path.join(ROOT, "data", "src", "professions.json"));
  out.professions = pf.professions; out.piSpells = pf.piSpells; out.dfWizardly = pf.wizardly;
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
// book traits GCS lacks, with their page (Code of Honor (Bushido) at -15 is DF1's price)
for (const t of read(path.join(SRC, "book-traits.json")).traits) out.traits.push(t);
// where a name has both a full trait and GCS's one-point quirk version (Vow, Obsession, Code of Honor), the full trait
// comes first, so a plain name finds it; "ref" on an instance picks the quirk (B165)
{
  const first = new Map(); out.traits.forEach((t, i) => { if (!first.has(t.name)) first.set(t.name, i); });
  const order = new Map(out.traits.map((t, i) => [t, [first.get(t.name), t.kind === "quirk" ? 1 : 0, i]]));
  out.traits.sort((a, b) => { const x = order.get(a), y = order.get(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; });
}
out.natural = read(path.join(SRC, "natural.json")).natural;
out.circumstances = read(path.join(SRC, "circumstances.json")).circumstances;
out.modsets = read(path.join(SRC, "modifier-sets.json")).sets;

let commit = "";
try { commit = execFileSync("git", ["-C", libRoot, "log", "-1", "--format=%h %cs"], { encoding: "utf8" }).trim(); } catch { }
out.meta = {
  source: "GCS master library, https://github.com/richardwilkes/gcs_master_library",
  license: "Mozilla Public License 2.0 (library data). Converted for personal use; costs are GURPS x10.",
  commit, books: SOURCES,
  counts: Object.fromEntries(["skills", "traits", "spells", "equipment", "templates", "modifiers", "natural", "circumstances", "professions"].map(k => [k, out[k].length])),
};

fs.writeFileSync(path.join(ROOT, "data", "library.json"), JSON.stringify(out));
fs.writeFileSync(path.join(ROOT, "data", "library.js"), `/* generated by tools/gcs_convert.mjs; do not edit */\nglobalThis.BC_LIBRARY=${JSON.stringify(out)};\n`);
console.log(out.meta.counts, commit);
if (dupes.length) console.log(`${dupes.length} duplicate names skipped (first kept), e.g.`, dupes.slice(0, 5));
