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

// a trait taken off a template for one character: a disadvantage removed costs its points back
const brock = JSON.parse(fs.readFileSync(path.join(HERE, "..", "characters", "brock-underhill.json"), "utf8"));
const b0 = BC.compute(brock, lib).spent;
const b1 = BC.compute({ ...brock, templateRemoved: [{ template: "Badger-folk", trait: "Stubbornness" }] }, lib);
eq("Badger-folk without Stubbornness costs 50 more", b1.spent - b0, 50);
eq("removed template trait is listed", b1.templateRemoved.map(x => x.name).join(), "Stubbornness");
// spells take any point total from 10, interpolating like skills
const sp = BC.compute({ ...brock, spells: [{ name: "Death Vision", points: 15 }] }, lib);
eq("spell at 15 pts: no step warning", sp.issues.some(x => /Death Vision/.test(x.msg) && /step/.test(x.msg)), false);
eq("spell at 15 pts sits between 10 and 20", (() => { const at = p => BC.compute({ ...brock, spells: [{ name: "Death Vision", points: p }] }, lib).spells[0].level; return at(10) < sp.spells[0].level && sp.spells[0].level < at(20); })(), true);

// weapons that come with traits (B88: a Striker does thrust +1 per die; Weak drops the bonus)
const tw = (traits, ST = 0) => BC.compute({ attributes: { ST }, traits, skills: [], spells: [], equipment: [] }, lib).weapons;
const horn = tw([{ name: "Crushing Striker", notes: "Horns" }], 100).find(w => /Striker/.test(w.name));
eq("Crushing Striker at ST 11: 1d crushing", horn && BC.diceTxt(horn.modes[0].dice) + " " + horn.modes[0].type, "1d cr");
const weakHorn = tw([{ name: "Crushing Striker", notes: "Horns", modifiers: ["Weak"] }], 100).find(w => /Striker/.test(w.name));
eq("Weak Striker at ST 11: 1d-1", weakHorn && BC.diceTxt(weakHorn.modes[0].dice), "1d-1");
const claws = tw([{ name: "Blunt Claws" }]);
eq("Blunt Claws replace the plain punch", claws.some(w => w.name === "Punch"), false);
eq("Innate Attack (Burn) 3: 3d", BC.diceTxt(tw([{ name: "Innate Attack (Burn)", levels: 3 }]).find(w => /Innate/.test(w.name)).modes[0].dice), "3d");

// equipment: Basic Lift and encumbrance (B15, B17), Parry and Block (B375-B376), shields (B287), quality (B274-B280),
// starting wealth (B25-B27), spell energy (M8)
const ch = o => BC.compute({ attributes: {}, traits: [], skills: [], spells: [], equipment: [], ...o }, lib);
eq("Basic Lift: ST 7 9.8, ST 10 20, ST 11 24", [BC.basicLift(7), BC.basicLift(10), BC.basicLift(11)], [9.8, 20, 24]);
const sword = ch({ tl: 3, equipment: [{ name: "Broadsword", quality: "fine" }, { name: "Medium Shield" }, { name: "Boots" }], skills: [{ name: "Broadsword", points: 40 }, { name: "Shield", spec: "Shield", points: 20 }, { name: "Stealth", points: 20 }] });
const bs = sword.weapons.find(w => w.name === "Broadsword").modes;
eq("fine broadsword: sw+1 cut +1 = 1d+2, thrust crushing unchanged 1d-1", [BC.diceTxt(bs[0].dice), BC.diceTxt(bs[1].dice)], ["1d+2", "1d-1"]);
eq("Broadsword-11: Parry 8", bs[0].parryLevel, 8);
eq("Shield-11: Block 8, medium shield DB 2", [sword.weapons.find(w => w.name === "Medium Shield").modes[0].blockLevel, sword.db], [8, 2]);
eq("boots: kick +1 (1d-1 at ST 10)", BC.diceTxt(sword.weapons.find(w => w.name === "Kick").modes[0].dice), "1d-1");
eq("21 lb at ST 10: Light, Move 4, Dodge 8 -> 7", [sword.enc.name, sword.enc.move, sword.dodgeBase, sword.dodge], ["Light", 4, 8, 7]);
eq("Stealth takes the encumbrance level", sword.skills.find(s => s.name === "Stealth").encPen, -1);
eq("fine broadsword x4 + shield $60 + boots $80 = $2140, over $1000 at TL3", [sword.money.spent, sword.money.limit, sword.issues.some(x => x.sev === "ERROR" && /over/.test(x.msg))], [2140, 1000, true]);
eq("Comfortable Wealth doubles starting wealth", ch({ tl: 3, traits: [{ name: "Comfortable Wealth" }], equipment: [{ name: "Leather Armor" }] }).money.limit, 2000);
const tl8 = lib.equipment.find(e => e.tl === "8" && e.cost > 0);
eq(`TL8 item in a TL3 campaign costs x32 (${tl8.name})`, ch({ tl: 3, equipment: [{ name: tl8.name }] }).gear[0].cost, tl8.cost * 32);
eq("very fine axe is an error", BC.itemQuality(lib.equipment.find(e => e.name === "Axe"), "very fine", 3).error != null, true);
eq("fine axe costs x10 at TL3 (it cuts), fine mace x3", [BC.itemQuality(lib.equipment.find(e => e.name === "Axe"), "fine", 3).mult, BC.itemQuality(lib.equipment.find(e => e.name === "Mace"), "fine", 3).mult], [10, 3]);
eq("fine blade at TL2: no damage bonus (iron, B275)", BC.itemQuality(lib.equipment.find(e => e.name === "Broadsword"), "fine", 2).dmg, 0);
const bow = ch({ equipment: [{ name: "Longbow", quality: "fine" }] }).weapons.find(w => w.name === "Longbow")?.modes[0];
eq("fine longbow: range x15/x20 -> x18/x24", bow?.range, "x18/x24");
eq("Summon Spirit (20) warns at FP 11 without a Powerstone", BC.compute(brock, lib).issues.some(x => /Summon Spirit: costs 20/.test(x.msg)), true);
eq("a 10-point Powerstone covers it", BC.compute({ ...brock, equipment: [{ name: "10 pt Powerstone" }] }, lib).issues.some(x => /Summon Spirit: costs/.test(x.msg)), false);
eq("spell cost: -1 at skill 15, -2 at 20, -3 at 25", [BC.spellEnergy("20", 14.9), BC.spellEnergy("20", 15), BC.spellEnergy("20", 20), BC.spellEnergy("20", 25)], [20, 19, 18, 17]);

// armour layering (B286) and the foot (B399)
const lay = ch({ equipment: [{ name: "Mail Shirt" }, { name: "Steel Breastplate" }], skills: [{ name: "Broadsword", points: 20 }] });
eq("mail shirt under a breastplate: torso DR 4 + 5 = 9", lay.dr.torso, 9);
eq("layered armour: -1 to DX and DX-based skills, Speed unchanged", [lay.attrs.DX, lay.skills[0].level, lay.attrs.Speed], [9, 9, 5]);
eq("leather armour can't go under a breastplate", ch({ equipment: [{ name: "Leather Armor" }, { name: "Steel Breastplate" }] }).issues.some(x => x.sev === "ERROR" && /B286/.test(x.ref)), true);
eq("mail under a breastplate: 7 against crushing (mail -2), breastplate front only", [lay.drVs.cr.torso, lay.drPartial.torso.map(x => x.name + " " + x.part).join()], [7, "Steel Breastplate front only"]);
eq("boots: DR 2 on the foot", ch({ equipment: [{ name: "Boots" }] }).dr.foot, 2);
eq("foot: -4, as for a hand", BC.LOCS.find(l => l.name === "foot").pen, -4);

console.log(fail ? `${fail} failure(s)` : "all passed");
process.exit(fail ? 1 : 0);
