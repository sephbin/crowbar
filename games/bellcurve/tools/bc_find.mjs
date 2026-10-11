#!/usr/bin/env node
/* Search the converted library so builds use real records instead of remembered ones.

   Usage: node tools/bc_find.mjs <regex> [skills|traits|spells|equipment|templates|modifiers] [--full] [--text]

   modifiers are the general enhancements and limitations (B101-B117). A trait only takes the modifiers listed under
   its own mods; the general list is the reference for what each one does and costs.

   Prints name, cost (x10) or attribute/difficulty, modifiers and page reference.
   --full prints the whole record as JSON.
   --text adds the book text and supplement text from rules/library-with-text.json (local only: the rules/ folder is
   gitignored and the text is copyrighted, so read it for rulings and never copy it into characters or the repo). */
import fs from "node:fs";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const lib = JSON.parse(fs.readFileSync(path.join(HERE, "..", "data", "library.json"), "utf8"));
const args = process.argv.slice(2), full = args.includes("--full"), withText = args.includes("--text");
const [pat, kind] = args.filter(a => !a.startsWith("--"));
if (!pat) { console.error("usage: node tools/bc_find.mjs <regex> [skills|traits|spells|equipment|templates] [--full] [--text]"); process.exit(2); }
const key = (k, r) => `${k}|${r.name}|${r.spec || r.notes || ""}|${r.ref || ""}|${k === "modifiers" ? r.adj : ""}`;
const TEXT = new Map();
if (withText) {
  const file = path.join(HERE, "..", "rules", "library-with-text.json");
  if (!fs.existsSync(file)) { console.error("--text: rules/library-with-text.json not found (see rules/ in CLAUDE.md)"); process.exit(2); }
  const L = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const k of ["skills", "spells", "traits", "modifiers"]) for (const r of L[k] || []) TEXT.set(key(k, r), r);
}
const textOf = (k, r) => {
  const t = TEXT.get(key(k, r));
  if (!t) return k === "equipment" || k === "templates" ? "" : "\n          (no book text)";
  const body = t.text ? `\n---- ${t.textRef}\n${t.text}` : `\n          (no book text: ${t.how})`;
  return body + (t.supplements || []).map(s => `\n---- ${s.book} ${s.textRef || ""}\n${s.text}`).join("") + "\n";
};
const re = new RegExp(pat, "i");
const kinds = kind ? [kind] : ["traits", "skills", "spells", "equipment", "templates", "modifiers"];

for (const k of kinds) for (const r of lib[k] || []) {
  const label = r.spec ? `${r.name} (${r.spec})` : r.name;
  if (!re.test(label)) continue;
  if (full) { console.log(JSON.stringify(r, null, 1) + (withText ? textOf(k, r) : "")); continue; }
  let line = `${k.slice(0, -1).padEnd(9)} ${label}`;
  if (k === "traits") {
    line += `  ${r.base ? r.base : ""}${r.canLevel ? `${r.base ? " + " : ""}${r.perLevel}/level${r.maxLevels ? " max " + r.maxLevels : ""}` : ""}${!r.base && !r.canLevel ? "0 (cost from modifiers)" : ""}`;
    if (r.cr) line += `  CR ${r.cr}`;
    if (r.fr) line += `  FR ${r.fr}`;
    if (r.sub) line += `  needs notes: ${r.sub}`;
    if (r.house) line += "  HOUSE RULE";
    if (r.mods?.length) line += `\n          mods: ${r.mods.map(m => `${m.group ? m.group + ": " : ""}${m.name} (${m.adj})${m.on ? " [on]" : ""}`).join("; ")}`;
  } else if (k === "skills") line += r.technique ? `  technique ${r.diff}, default ${r.parent.name}${r.parent.mod ? r.parent.mod : ""}${r.limit != null ? ", limit +" + r.limit : ""}` : `  ${r.attr}/${r.diff}${r.defaults ? "  defaults " + r.defaults.map(d => d.type === "skill" ? `${d.name?.qualifier}${d.specialization ? " (" + d.specialization.qualifier + ")" : ""}${d.modifier || ""}` : `${d.type}${d.modifier || ""}`).join(", ") : ""}`;
  else if (k === "spells") line += `  ${r.attr}/${r.diff}  ${r.college.join(", ")}  ${r.class}  cost ${r.cost}`;
  else if (k === "equipment") line += `  $${r.cost} ${r.weight}${r.weapons ? "  " + r.weapons.map(w => `${w.usage || "attack"} ${w.dmgText}`).join(", ") : ""}${r.dr ? "  DR " + r.dr.map(d => `${d.amount} ${d.locations.join("/")}`).join(", ") : ""}`;
  else if (k === "modifiers") line = `${r.kind.padEnd(11)} ${label}  ${r.adj}${r.notes ? `  (${r.notes})` : ""}${r.group ? `  group: ${r.group}` : ""}`;
  else if (k === "templates") line += `  ${r.traits.reduce((a, t) => a + (t.points || 0), 0)} pts: ${r.traits.map(t => t.name + (t.levels ? " " + t.levels : "")).join(", ")}`;
  console.log(`${line}  [${r.ref}]${withText ? textOf(k, r) : ""}`);
}
