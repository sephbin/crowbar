#!/usr/bin/env node
/* Bell Curve GURPS character checker.

   Usage: node tools/bc_check.mjs characters/*.json [-q]

   Recomputes every character from data/library.json with the same engine the builder uses:
   points vs budget, attribute and skill levels from points, trait costs (modifiers, self-control,
   frequency), prerequisites for traits, skills, techniques and spells, defaults, trait level limits,
   ally sheets against the ally's point share, weapon skill links and ST minimums.
   Prints ERROR / WARN / ok lines with page references. -q hides ok lines.
   Exit code 1 if any ERROR is found. */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const ROOT = path.resolve(HERE, "..");
await import(pathToFileURL(path.join(ROOT, "engine.js")).href);
const BC = globalThis.BC;
const lib = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "library.json"), "utf8"));

const args = process.argv.slice(2);
const quiet = args.includes("-q");
const files = args.filter(a => !a.startsWith("-"));
if (!files.length) { console.error("usage: node tools/bc_check.mjs characters/*.json [-q]"); process.exit(2); }

const f1 = BC.f1;
let errors = 0;
function report(res, indent = "") {
  const A = res.attrs;
  console.log(`${indent}ST ${f1(A.ST)}  DX ${f1(A.DX)}  IQ ${f1(A.IQ)}  HT ${f1(A.HT)}  Will ${f1(A.Will)}  Per ${f1(A.Per)}  HP ${f1(A.HP)}  FP ${f1(A.FP)}  Speed ${f1(A.Speed)}  Move ${f1(A.Move)}  Dodge ${res.dodge}  thr ${BC.diceTxt(res.thr)}  sw ${BC.diceTxt(res.sw)}`);
  const b = res.breakdown;
  console.log(`${indent}points ${res.spent}/${res.budget}: template ${b.template}, attributes ${b.attributes}, advantages ${b.advantages}, disadvantages ${b.disadvantages}, quirks ${b.quirks}, skills ${b.skills}, spells ${b.spells}`);
  for (const w of res.weapons) for (const m of w.modes)
    if (!w.natural || m.level != null) console.log(`${indent}  weapon ${w.name} ${m.usage}: ${m.skillName} level ${f1(m.level)} (${m.level == null ? "—" : BC.succPct(m.level) + "%"}), ${BC.diceTxt(m.dice)} ${m.type}`);
}

for (const file of files) {
  let ch;
  try { ch = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { console.log(`\n== ${file}\nERROR  cannot read: ${e.message}`); errors++; continue; }
  const res = BC.compute(ch, lib);
  console.log(`\n== ${ch.name || "(unnamed)"}  [${file}]`);
  report(res);
  const order = { ERROR: 0, WARN: 1, ok: 2 };
  const lines = [...res.issues].sort((a, b) => order[a.sev] - order[b.sev]);
  for (const x of lines) {
    if (quiet && x.sev === "ok") continue;
    console.log(`${x.sev.padEnd(5)}  ${x.msg}${x.ref ? `  [${x.ref}]` : ""}`);
  }
  for (const a of res.allies) {
    console.log(`  -- ally ${a.trait.inst.character.name || a.trait.notes}: ${a.pct ?? "?"}% of ${res.budget} = ${a.budget ?? "?"} pts`);
    report(a.result, "  ");
  }
  const n = res.issues.filter(x => x.sev === "ERROR").length;
  errors += n;
  console.log(n ? `${n} error(s)` : "no errors");
}
process.exit(errors ? 1 : 0);
