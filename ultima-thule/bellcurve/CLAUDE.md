# Bell Curve GURPS

Andrew's personal variant of GURPS 4e for Ultima Thule: GURPS rules and costs (×10), every roll resolved on the 3d6 curve and shown as a d100 percentage. Not distributed. Paths below are relative to this folder.

## Files
- `engine.js`: the rules, used by both the builder and the tools: 3d6 curve and d100 display, skill and attribute costs, the GCS trait-cost algorithm (modifiers, self-control, frequency, the −80% cap, round up), features (attribute, skill, spell and DR bonuses, conditional modifiers), prerequisites, techniques, weapons, hit locations and injury. Change rules here only.
- `index.html`: builder, sheet and roller. Loads `engine.js` and `data/library.js`. Saves to localStorage and to character JSON (open, save, copy json). Sections sit in tabs like the BRP sheets: base (name, check, templates, attributes), traits, combat (dodge, damage, attacks), skills, magic, kit, notes. Rolls show as percentages only; GURPS levels, relative levels and 3d6 equivalents are hidden unless the header's debug toggle is on (elements with class `g`). Tab and debug state are per browser (localStorage `bellcurve-ui`). The examples menu fetches `characters/*.json`, so it needs http (GitHub Pages, or `npx serve ..` from this folder's parent); everything else also works from `file://`.
- `data/library.json`, `data/library.js`: generated. Do not edit.
- `data/src/`: hand-authored data merged into the library: `house-rules.json` (Backstabber, Sneak Attack), `circumstances.json` (suggested GM values per skill), `natural.json` (punch and kick, B271).
- `characters/*.json`: characters. `oskar-penn.json` is the reference build; `brock-underhill.json` is the handoff draft and fails on purpose (see Open issues).
- `tools/gcs_convert.mjs`: rebuilds the library from a GCS master library checkout.
- `tools/bc_check.mjs`: validator. `tools/bc_find.mjs`: library search. `tools/bc_selftest.mjs`: maths and cost tests.

## Commands
```
node tools/bc_selftest.mjs                     # must say "all passed"
node tools/bc_check.mjs characters/*.json -q   # ERROR/WARN lines with page refs; exit 1 on errors
node tools/bc_find.mjs "magery|ally" traits    # search; add --full for the raw record
git clone --depth 1 https://github.com/richardwilkes/gcs_master_library <dir>
node tools/gcs_convert.mjs <dir>               # rebuild data/library.*
```
On Windows the clone fails on some long paths (Template Toolkit, Discworld, Pyramid). The books used here (Basic Set, Magic, Fantasy races) check out fine. Re-run the self-test after a rebuild: it compares trait costs with the costs GCS computed for every template trait.

## Library contents
Basic Set skills, techniques and traits; Magic skills and spells (not Ritual Magic); Basic Set and Magic equipment; templates from Basic Set races, Basic Set meta-traits and GURPS Fantasy races. The GCS library is MPL 2.0; credit it if anything here is shared. To add a book, add its files to `SOURCES` in `tools/gcs_convert.mjs`.

## Character JSON
```
{
  "format": "bellcurve-character", "version": 1,
  "name": "...", "concept": "...", "budget": 1500, "notes": "...",
  "options": { "backstabber": "all" | "melee" },
  "templates": ["Halfling", { "name": "Badger-folk", "custom": true, "attributes": {"ST": 200}, "traits": [ ... ] }],
  "attributes": { "ST": 0, "DX": 0, "IQ": 0, "HT": 0, "Will": 0, "Per": 0, "HP": 0, "FP": 0, "Speed": 0, "Move": 0 },
  "traits": [ { "name": "Greed", "cr": 12, "points": -150 },
              { "name": "Silence", "levels": 1, "points": 50 },
              { "name": "Ally", "notes": "who", "frequency": 15, "modifiers": ["100% of your starting points", "Summonable"], "points": 300, "character": { ...ally sheet... } } ],
  "skills": [ { "name": "Thrown Weapon", "spec": "Knife", "points": 40 } ],
  "spells": [ { "name": "Death Vision", "points": 10 } ],
  "equipment": [ { "name": "Large Knife", "qty": 2 }, { "name": "Crossbow", "st": 9, "label": "Light crossbow (ST 9)" }, { "name": "Leather Armor", "worn": true } ]
}
```
- Attribute values are points spent (×10), not levels. Skill, spell and trait `points` are ×10.
- Trait `points` is the declared cost; the validator recomputes it and reports a mismatch. The builder keeps it in step.
- Modifiers are named as in the library. Where two share a name, use the label `"Name (adj)"`, e.g. `"People Affected (x1)"`.
- Techniques take their parent skill as the specialization: `{ "name": "Arm Lock", "spec": "Judo" }`.
- An ally's sheet is built on its share of the owner's budget, taken from the point-total modifier.

## AI build workflow
1. Read the description. List every trait, skill, spell, item and template it implies.
2. Look each one up with `node tools/bc_find.mjs`. Use the library's name, cost, modifiers and specializations. Never write a stat from memory. If something is not in the library, keep it out of the library-backed fields, put it in `notes` and flag it for Andrew. A custom template (`"custom": true`) is fine for a homebrew race when its traits are library traits.
3. Write `characters/<slug>.json`.
4. Run `node tools/bc_check.mjs characters/<slug>.json`. Fix every ERROR. Read every WARN and fix it or record the ruling in `notes`.
5. Report the point breakdown and any design problems with numbers. Open the file in the builder (open, or the examples menu after adding it there) to play it.

## House rules (label them as house rules wherever they appear)
- Backstabber (150): against an unaware target, hit-location penalties are halved (eye −4.5). `options.backstabber` set to `"melee"` limits it to melee attacks; the default covers ranged too.
- Sneak Attack (50 per level, max 3 in the data; cap of 2 or 3 is undecided): +1d injury per level against an unaware target, added after the location multiplier.
- Unaware target: no defence roll.
- Throat cut as impaling to the vitals at the neck's −5: not implemented (undecided).

## Known gaps
- Damage types outside imp, pi−, pi, cut, cr use ×1 at every location; the roller says so.
- Not modelled: buying a skill up from a skill default (the defaulted level is used as a floor), wildcard skill cost (costed as very hard, with a warning), attribute cost reductions, ST bonuses limited to lifting or striking (listed as warnings), Brawling's damage bonus, encumbrance.
- `script_prereq` prerequisites (4 in the library) are not evaluated.

## Open issues for Andrew
- Brock's ghost goat: the library Spirit meta-trait (B263) costs 2610 on its own. With Quadruped and Domestic Animal the goat is 1960 before any attributes, against a 1500 share (Ally at 100%). Options: Ally at 150% (2250 share, the Ally costs 600 instead of 300), a cut-down spirit build, or make the goat a spell effect.
- Oskar has no Crossbow skill: his ST 9 crossbow rolls at DX−4 = 11 (63%), and at ST 7 he cannot cock it by hand.

## Writing style for anything shown to Andrew
No em dashes. No "not X, but Y" constructions. No adjective stacking or vague intensifiers. Direct claims with specific facts. Push back when something is wrong.
