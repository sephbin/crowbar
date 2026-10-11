# Ultima Thule BRP prep: Claude Code package

## Setup
1. Unzip this folder somewhere on your computer.
2. Copy your rulebook PDF into `rules/` and name it `BRP_Core_Rulebook.pdf`. (It isn't included in the package.)
3. Install poppler for PDF text extraction: `brew install poppler` (macOS) or `sudo apt install poppler-utils`.
4. In the folder, run `python3 tools/extract_rules.py`.
5. Optional, for the sheet test: `npm i -D playwright && npx playwright install chromium`.
6. Start Claude Code in the folder: `claude`.

## First prompt to try
> Use the brp-check skill to rules-check the zealots in data/npcs/zealots.json. Resolve the open questions, give them real characteristics, and tell me how dangerous the tram fight is for the party.

## What's here
- `CLAUDE.md`: setting, adventure, rules decisions and writing style. Claude Code reads it automatically.
- `rules/RULES_DIGEST.md`: paraphrased rules with page numbers.
- `tools/brp_check.py`: validator (`python3 tools/brp_check.py data/pcs/*.json data/npcs/*.json`).
- `tools/sheet_smoke.js`: tests the HTML sheets at phone width.
- `data/`: pregens (verified) and zealots (draft).
- `sheets/`: player-facing character sheets.
- `docs/`: pregen write-up and session decisions.
- `.claude/skills/brp-check/SKILL.md`: the checking procedure.
