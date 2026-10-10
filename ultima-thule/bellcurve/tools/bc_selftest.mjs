#!/usr/bin/env node
/* Self-test for the engine: the core maths from the handoff, the Oskar reference numbers,
   and trait costs against the points GCS computed for every template trait.
   Usage: node tools/bc_selftest.mjs */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const ROOT = path.resolve(HERE, "..");
await import(pathToFileURL(path.join(ROOT, "engine.js")).href);
const BC = globalThis.BC;
const lib = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "library.json"), "utf8"));

let fail = 0;
const eq = (label, got, want, tol = 0) => {
  const ok = typeof want === "number" ? Math.abs(got - want) <= tol : JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fail++; console.log(`FAIL ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
  else console.log(`ok   ${label}`);
};

// curve
eq("P(<=10)", BC.cdf(10), 108 / 216, 1e-12);
eq("P(<=13.5) halfway", BC.cdf(13.5), (181 + 196) / 2 / 216, 1e-12);
eq("succPct floor (3-4 succeed)", BC.succPct(0), 2);
eq("succPct 10", BC.succPct(10), 50);
eq("succPct cap below 18", BC.succPct(17.9), 99);
eq("succPct 18", BC.succPct(18), 100);
eq("succPct 18.1", BC.succPct(18.1), 101);
eq("succPct 19", BC.succPct(19), 110);
eq("inverse round trip", BC.inv(BC.cdf(12.3)), 12.3, 1e-9);
eq("-3 at level 10 costs 34%", BC.succPct(10) - BC.succPct(7), 34);
eq("-3 at level 16 costs 14%", BC.succPct(16) - BC.succPct(13), 14);
// The handoff says -3 at 19 costs nothing; the formula gives 110% -> 98%. Free only from level 21.
eq("-3 at level 19: 110% -> 98%", [BC.succPct(19), BC.succPct(16)], [110, 98]);
eq("-3 at level 21: 130% -> 100%", [BC.succPct(21), BC.succPct(18)], [130, 100]);
eq("crit success threshold at 15", BC.critS(15), 5);
eq("crit fail threshold at 10", BC.critF(10), 17);
eq("crit fail threshold at 16", BC.critF(16), 18);
eq("crit fail threshold at 5", BC.critF(5), 15);

// skill costs
eq("Easy 10 pts", BC.relLevel(10, "E"), 0);
eq("Average 20 pts is A+0", BC.relLevel(20, "A"), 0);
eq("Hard 40 pts is H+0", BC.relLevel(40, "H"), 0);
eq("Easy 80 pts", BC.relLevel(80, "E"), 3);
eq("Average 5 pts interpolates", BC.relLevel(5, "A"), -3);
eq("Very hard 5 pts has no level", BC.relLevel(5, "VH"), null);

// ST tables (B16)
eq("thr ST 7", BC.diceTxt(BC.thrust(7)), "1d-3");
eq("sw ST 10", BC.diceTxt(BC.swing(10)), "1d");
eq("thr ST 20", BC.diceTxt(BC.thrust(20)), "2d-1");
eq("sw ST 20", BC.diceTxt(BC.swing(20)), "3d+2");
eq("thr ST 30", BC.diceTxt(BC.thrust(30)), "3d");

// Oskar: knife at the eye, unaware, Backstabber halves -9 to -4.5, Sneak Attack 1 adds 1d after x4
const oskar = JSON.parse(fs.readFileSync(path.join(ROOT, "characters", "oskar-penn.json"), "utf8"));
const res = BC.compute(oskar, lib);
eq("Oskar spends 1500", res.spent, 1500);
const knife = res.weapons.find(w => w.name === "Large Knife").modes.find(m => m.usage === "Thrust");
eq("Oskar knife level", knife.level, 18);
const eye = BC.LOCS.find(l => l.name === "eye");
eq("knife at eye, unaware: 87%", BC.succPct(knife.level + eye.pen / 2), 87);
const inj = BC.injuryDist(knife.dice, knife.type, BC.locMult(eye, knife.type), eye.dr, res.sneakDice);
eq("knife at eye, unaware: avg injury 9.5", inj.avg, 9.5, 1e-9);
eq("Oskar dodge (Combat Reflexes from library features)", res.dodge, 10);

// trait costs vs GCS
let n = 0, bad = 0;
for (const t of lib.templates) for (const i of t.traits) {
  if (i.points == null) continue; n++;
  if (BC.traitCost(i.rec, i).cost !== i.points) { bad++; console.log(`  cost mismatch: ${t.name} / ${i.name}`); }
}
eq(`trait costs match GCS on ${n} template traits`, bad, 0);
eq("Ally 100%, 15 or less, Summonable = 300", BC.traitCost(lib.traits.find(t => t.name === "Ally"), { frequency: 15, modifiers: ["100% of your starting points", "Summonable"] }).cost, 300);

// general enhancements and limitations (B101-B117) on traits that don't list them
const T = n => lib.traits.find(t => t.name === n), G = lib.modifiers;
const cost = (n, inst) => BC.traitCost(T(n), inst, G);
eq("Third Rail: Burn 4d, AD 2, Surge, Melee C = 280", cost("Innate Attack (Burn)", { levels: 4, modifiers: ["Surge", "Armor Divisor (50%)", "Melee Attack, Reach C"] }).cost, 280);
const plenary = cost("Affliction", { levels: 1, modifiers: [{ name: "Sense-Based", adj: "+150%" }, { name: "Area Effect", levels: 2 }, "Selective Area", "Sleep", "Emanation", { name: "Takes Recharge", notes: "15 seconds" }] });
eq("Plenary Session: Affliction 1 +380% = 480", plenary.cost, 480);
eq("Plenary Session: no rule warnings", plenary.warns.length, 0);
eq("Bursar's Evil Eye: Affliction 2 +140% = 480", cost("Affliction", { levels: 2, modifiers: [{ name: "Malediction", notes: "-1 per yard" }, { name: "Sense-Based", adj: "-20%" }, "Terrible Pain"] }).cost, 480);
eq("Harbour Fog: Affliction 1 +260% = 360", cost("Affliction", { levels: 1, modifiers: ["Respiratory Agent", { name: "Area Effect", levels: 3 }, "Persistent", "Drifting", "Nauseated", { name: "Limited Use", notes: "2 uses per day" }] }).cost, 360);
eq("ambiguous general modifier is an error", cost("Affliction", { modifiers: ["Limited Use"] }).errors.length, 1);
eq("Aura without Melee Attack (Reach C) warns", cost("Innate Attack (Toxic)", { levels: 1, modifiers: ["Aura"] }).warns.some(w => /B102/.test(w)), true);
eq("Contact Agent with Area Effect warns about +150%", cost("Affliction", { modifiers: ["Contact Agent", "Area Effect"] }).warns.some(w => /\+150%/.test(w)), true);
eq("two penetration modifiers warn", cost("Affliction", { modifiers: ["Respiratory Agent", { name: "Blood Agent", notes: "" , adj: "-40%" }, "Area Effect"] }).warns.some(w => /penetration/.test(w)), true);

console.log(fail ? `${fail} failure(s)` : "all passed");
process.exit(fail ? 1 : 0);
