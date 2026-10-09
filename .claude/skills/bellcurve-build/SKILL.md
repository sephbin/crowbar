---
name: bellcurve-build
description: Build or check Bell Curve GURPS characters (Andrew's GURPS 4e variant, costs x10, d100 on the 3d6 curve) from the GCS library. Use when drafting a GURPS/Bell Curve character from a description, or auditing a character JSON.
---

# Bell Curve GURPS build and check

All paths are relative to `ultima-thule/bellcurve/`; run commands from there. Read `CLAUDE.md` in that folder first.

1. If `data/library.json` is missing, clone https://github.com/richardwilkes/gcs_master_library and run `node tools/gcs_convert.mjs <clone>`, then `node tools/bc_selftest.mjs`.
2. For every trait, skill, technique, spell, item and template the description implies, run `node tools/bc_find.mjs "<regex>" [kind]` and use the library record. Never write a cost, damage, prerequisite or default from memory. Anything missing goes in `notes`, flagged for Andrew.
3. Write `characters/<slug>.json` in the schema shown in `CLAUDE.md` (attribute values are points, all points x10).
4. Run `node tools/bc_check.mjs characters/<slug>.json`. Fix every ERROR. Resolve or record every WARN.
5. Report the point breakdown, key rolls as percentages, and any design problem with numbers (e.g. an ally that cannot be built on its share).
6. Label house rules (Backstabber, Sneak Attack) as house rules.
