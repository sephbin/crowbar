# Bell Curve GURPS

Andrew's personal variant of GURPS 4e for Ultima Thule: GURPS rules and costs (×10), every roll resolved on the 3d6 curve and shown as a d100 percentage. Not distributed. Paths below are relative to this folder.

## Files
- `engine.js`: the rules, used by both the builder and the tools: 3d6 curve and d100 display, skill and attribute costs, the GCS trait-cost algorithm (modifiers, self-control, frequency, the −80% cap, round up), features (attribute, skill, spell and DR bonuses, conditional modifiers), prerequisites, techniques, weapons, hit locations and injury. Change rules here only.
- `index.html`: builder, sheet and roller. Loads `engine.js` and `data/library.js`. Saves to localStorage and to character JSON (open, save, copy json). Sections sit in tabs like the BRP sheets: base (name, check, templates, attributes), traits, combat (dodge, damage, attacks), skills, magic, kit, notes. Tapping a skill, spell, attribute, Dodge or attack opens the roller as a modal (attack modes, hit locations, circumstances, situation, d100 roll, injury). Its rules tab shows a paraphrased description (from `data/descriptions.js`) above the library data: attribute and difficulty, defaults, prerequisites, technique parent and maximum, spell stats, weapon modes, next-step cost, page reference. The page opens read-only (every load): steppers, remove and add controls, modifier panels and inputs are hidden (`body.view`; editing controls carry class `ed`, their read-only text class `vw`), and the header's edit button shows them. Rolling works in both modes. Tapping a trait opens the same modal on its rules (cost, modifiers, page). When the page is served by the crowbar server, the rules tab also shows the book text and supplement text for the skill, spell or trait, and the text of each modifier on a trait, from `/api/booktext` (server.js, reading the gitignored `rules/library-with-text.json`); elsewhere those sections stay hidden. Rolls show as percentages only; GURPS levels, relative levels and 3d6 equivalents are hidden unless the header's debug toggle is on (elements with class `g`). Tab and debug state are per browser (localStorage `bellcurve-ui`). The examples menu fetches `characters/*.json`, so it needs http (GitHub Pages, or `npx serve ..` from this folder's parent); everything else also works from `file://`.
- `data/library.json`, `data/library.js`: generated. Do not edit.
- `data/src/`: hand-authored data merged into the library: `house-rules.json` (Backstabber, Sneak Attack), `circumstances.json` (suggested GM values per skill), `natural.json` (punch and kick, B271).
- `data/src/modifier-sets.json`: the standard modifier sets that skill and spell entries point to (equipment B345, cultural familiarity B23, language B24, physiology B181, Magic's long-distance table M14), with paraphrased labels and the page's values; built into the library as `modsets`. With the local book text, the roller adds a skill's or spell's own "Modifiers:" items and the sets it names as dotted circumstance chips (from `rollMods`, parsed by `rules/library_text.mjs`; items for the character's own traits are left out, since trait bonuses already apply).
- `data/src/descriptions.json`: paraphrased skill and spell descriptions for the rules tab, keyed by library name (`"Name (Spec)"` wins over `"Name"`). `node tools/build_desc.mjs` checks every key against the library and writes `data/descriptions.js`. Write them from the book text in `rules/pages/`, in your own words, never copied: the repo is public. So far: every skill and spell Oskar and Brock use, plus Crossbow.
- `rules/`: gitignored. The GURPS PDFs (copyrighted) and their extracted text. Copy `Basic Set - Characters.pdf`, `Basic Set - Campaigns.pdf` and `Magic.pdf` from `\\sanguinecrow\Andrew\GURPS\GURPS 4e` (more books there: Martial Arts, Thaumatology, Fantasy, Low-Tech, Dungeon Fantasy and others), then `node tools/extract_rules.mjs` writes `rules/pages/B222.txt` and so on, named by book page. Add a book to `BOOKS` in that script with its PDF-to-book page offset. `Powers.pdf`, `Martial Arts.pdf` and `Horror.pdf` are also copied there, plus the books GCS cites for traits and modifiers: Psionic Powers, Supers, Reign of Steel - Will to Live, Martial Arts - Gladiators, Gun Fu, Ultra-Tech, High-Tech, Banestorm, Power Ups 2-4 and Dungeon Fantasy 04 and 09. The local book-text tools in `rules/` append their text to the matching Basic Set and Magic entries as supplements, each labelled with its source; a book missing from `rules/` is skipped. Not on the share: Pyramid (PY), Furries (FUR), FFWF, Power-Ups 6, GURPS Lite, Discworld and the Dungeon Fantasy RPG books.
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
Basic Set skills, techniques and traits; Magic skills and spells (not Ritual Magic); Basic Set and Magic equipment; templates from Basic Set races, Basic Set meta-traits and GURPS Fantasy races; the general enhancements and limitations (B101-B117) as `modifiers`. Any trait can take a general modifier; the trait's own `mods` are matched first. The GCS library is MPL 2.0; credit it if anything here is shared. To add a book, add its files to `SOURCES` in `tools/gcs_convert.mjs`.

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
- `"templateRemoved": [{ "template": "Badger-folk", "trait": "Stubbornness" }]` takes a trait off a template for this character only (a removed disadvantage costs its points back). The template is left unchanged, so the builder lists the trait as removed with a "put back" button; the validator reports each removal as ok. Use the trait's name with its notes in brackets when the template gives it notes.
- Skill and spell points can be any number (spells from 10): levels interpolate between the 10-point steps. In the builder, + and − on a skill or spell buy or sell the fewest points that move the roll by 1%.
- Modifiers are named as in the library. Where two share a name, use the label `"Name (adj)"`, e.g. `"People Affected (x1)"`.
- General enhancements and limitations (`node tools/bc_find.mjs <name> modifiers`) go in the same list, as a name or an object: `{ "name": "Area Effect", "levels": 2 }` (4 yd), `{ "name": "Limited Use", "notes": "Once per day" }` (notes pick a variant, matched from the start), `{ "name": "Sense-Based", "adj": "+150%" }` (a value picks the variant with that value). An `adj` that matches no variant sets the value by hand (Cone width, Cyclic cycles) and the validator reports it. The validator warns on combinations the book forbids or requires (Aura needs Melee Attack (Reach C), Drifting needs Delay or Persistent, one penetration modifier, and so on), and on Contact Agent or Blood Agent with Area Effect or Cone, which become +150% and +100% enhancements (B110-B111). GCS lists only the limitation value for Contact Agent, so set `"adj": "+150%"` there.
- Techniques take their parent skill as the specialization: `{ "name": "Arm Lock", "spec": "Judo" }`.
- An ally's sheet is built on its share of the owner's budget, taken from the point-total modifier.

## AI build workflow
1. Read the description. List every trait, skill, spell, item and template it implies.
2. Look each one up with `node tools/bc_find.mjs`. Use the library's name, cost, modifiers and specializations. Never write a stat from memory. Where `rules/library-with-text.json` exists (local only), add `--text` to read the book and supplement text for each chosen trait: check its limits, incompatibilities and GM-permission notes before using it. Costs still come from the library; never copy the book text into a character or the repo. If something is not in the library, keep it out of the library-backed fields, put it in `notes` and flag it for Andrew. A custom template (`"custom": true`) is fine for a homebrew race when its traits are library traits.
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
