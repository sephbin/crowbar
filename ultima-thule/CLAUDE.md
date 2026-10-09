# Ultima Thule: BRP prep

Andrew's satirical fantasy/sci-fi setting, run here in Basic Roleplaying (BRP Universal Game Engine, Chaosium 2023 edition). This folder holds rules-checked pregens, NPCs and player-facing HTML character sheets for a one-shot.

## The setting (short)
- Ultima Thule is a parasitic city, roughly the size of Renaissance Paris, built on a giant disc that drains energy from planets, then teleports to the next one. Why it does this is a mystery.
- Refugees from each destroyed world arrive in "waves" and join the city. Arrival era works as class: older waves hold property and power.
- Mixed fantasy and sci-fi/cyberpunk. Tone: sociological satire (Discworld, Disco Elysium).
- **Energy weapons and especially their ammo are rare.** Default to crossbows, thrown and melee weapons.
- The University (magic) is an institution being satirised: rolling sessional contracts, PR departments, committees.

## The adventure ("the Tram Job")
- A black-market crew is hired, nominally by the University, to deal with pro-magic, anti-technology extremists.
- **Secret (GM only):** the University funds the extremists. Hiring deniable mercenaries makes it look like it is dealing with the problem. Nobody is meant to die; they are simply people the University doesn't care about.
- Set-piece: extremists seize a driverless tram and perform a binding to replace its drive intelligence with a daemon ("it should be at least a daemon rather than a robot"). The daemon becomes the tram's drive, not a combatant.
- Clue: ritual chalk or reagent invoice carries a University requisition stamp / department account code under the Director of Public Engagement.
- There is a moral decision; the University's motive is central.

## Rules decisions already made
- Power level: **Heroic**. Point-buy characteristics (36 points; STR/CON/SIZ/CHA cost 1, DEX/INT/POW cost 3; range 3 to 21, SIZ and INT minimum 8).
- Skills: personality type (13 skills at +20) + 325 professional points + INT×10 personal points. Heroic cap 90% at creation. Age bonus: +30 professional points per full 10 years added to the rolled age (17+1D6).
- Passions (optional rule) are in: start one at 80%, two at 60%. The 80% passion is "loud": the GM can call mandatory rolls (book p.216).
- Fate points option (p.115) uses **power points**: 5 PP reroll, 3 PP to ignore 1 damage.
- No hit locations, no strike ranks. Total HP = (CON+SIZ)/2.
- Magic: each spell is its own skill, starting at INT×1; Heroic magicians get six spells; 1 PP per level unless the spell says otherwise.
- Success levels: special = 1/5 skill, critical = 1/20 skill (both rounded normally), fumble = 1/20 of failure chance, 00 always fumbles. Difficult = half skill.

## Files
- `rules/RULES_DIGEST.md`: paraphrased rules with page numbers. Check claims against the PDF, not this digest, when in doubt.
- `rules/BRP_Core_Rulebook.pdf`: gitignored (copyright). Copied from Andrew's OneDrive `RPG\BRP\BRP Core Rulebook.pdf`. Run `python tools/extract_rules.py` from this folder to produce `rules/pages/` (also gitignored). pdftotext comes from MiKTeX on this machine.
- `tools/brp_check.py`: validator. `python tools/brp_check.py data/pcs/*.json data/npcs/*.json`. NPCs with a `build` block get the full PC budget check, and a `pp_plan` is checked against spell costs and the PP pool.
- `data/pcs/*.json`: the three verified pregens (build specs).
- `data/npcs/zealots.json`: verified. All six are Wizards: four zealots and the recruit at Normal, the leader (Imre's former student) at Heroic per p.246.
- `gm/tram-job.html`: GM screen (trackers, stat blocks, binding, threat, rules). Embeds `zealots.json`; run `python tools/sync_gm.py` after editing the JSON.
- `index.html`: GitHub Pages landing page for the GM screen and the sheets. Pages serves `main` from the repo root with Jekyll on, so the root `README.md` (which links here) is the site's front page. Never write a Liquid tag opener (double left brace, or left brace plus percent sign) in a markdown file: Jekyll parses it and the Pages build fails.
- `sheets/*.html`: player-facing sheets (one per character, Synth style). Each file embeds its own data; if a pregen changes, update the matching sheet too. Phone layout (viewport meta, weapon cards, touch sizes) comes from `tools/fix_sheet_mobile.py`; re-run it on any regenerated sheet.

## Book corrections found while checking
- The p.59 spell summary says "Flame" and "Wound"; the full entries are Fire (p.62) and Wounding (p.65). Use the full-entry names.
- The p.59 summary gives Control as 1 PP per level; its p.60 entry says 3. Use 3.
- `docs/pregens.md`: the full pregen write-up including backstories.
- `bellcurve/`: Bell Curve GURPS (GURPS ×10 with d100 on the 3d6 curve): engine, GCS library converter, validator, builder. Separate system from the BRP material; see `bellcurve/CLAUDE.md` and the `bellcurve-build` skill.
- `.claude/skills/brp-check/`: the checking procedure.

## Working rules
- Verify every rules claim against the rulebook text with a page number. Earlier drafts made up rules (Fate point pools, a Stun spell, Knowledge (Arcane) as the casting skill); don't repeat that.
- Player sheets must contain no plot hooks or spoilers (nothing about University funding, extremist targets or the account code).
- Weapon, armour and spell stats come from the book tables; note any GM substitution explicitly.

## Writing style (Andrew's preferences)
- No em dashes. No "not X, but Y" constructions. No adjective stacking or vague intensifiers.
- No summary sentences that restate. Direct claims backed by specific facts.
- Push back when something is wrong instead of agreeing.
