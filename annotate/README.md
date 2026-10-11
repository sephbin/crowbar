# annotate: a comment layer for any web page

A floating button puts a page in comment mode. Tap an element (or select some text), write what should change, save. Comments show as numbered pins, can be resolved, and export as markdown for a Claude agent. One script, no dependencies, works on development and production pages.

## Put it on a page

```html
<script src="https://<host>/annotate/annotate.js" data-project="My site"></script>
```

Or use a bookmarklet, which works on pages you don't control (replace the host; make a bookmark whose URL is this line):

```
javascript:(()=>{const s=document.createElement('script');s.src='https://<host>/annotate/annotate.js';s.dataset.project=location.hostname;document.head.append(s)})()
```

A page whose Content-Security-Policy forbids outside scripts blocks both. Run the bookmarklet from the page's own origin instead (host `annotate.js` there), or paste the file into the console.

Where `<host>` comes from: the crowbar server serves it at `/annotate/annotate.js` (port 3002), `node annotate/receiver.mjs` serves it at `/annotate.js` (port 4317), and GitHub Pages serves it from the repo root at `/annotate/annotate.js`. A page on https can load a script from `http://localhost` but not from a LAN address; use a GitHub Pages copy or a tunnel for phones.

## Using it

- The round button at the bottom left (`data-side="right"` or the settings panel moves it) toggles comment mode. The list button beside it shows the count of open comments.
- In comment mode the page ignores taps, so links and buttons don't fire. Tap an element, write the note, pick a type (change, bug, question, praise), save. "↑ parent" widens the selection to the element's parent. On a computer you can also drag-select text; the quoted text is saved.
- Tap a pin to edit, resolve or delete. The list panel has "this page" and "whole site", copy for Claude (markdown), share (phones), github issue, json download, and settings.
- Esc leaves comment mode.

## Where the comments go

1. **This browser** (always): localStorage, per site. Survives reloads.
2. **A receiver** (optional): set the URL in settings or `data-endpoint`. Comments sync both ways; the newer edit wins, so a phone and a desktop agree, and a resolution made by an agent shows up on the page. Receivers:
   - the crowbar server: `http://localhost:3002/api/annotations`
   - standalone, for projects without crowbar: `node annotate/receiver.mjs [--port 4317] [--dir ./annotations]`
   - set `ANNOTATE_KEY=secret` on the receiver and the key in settings to require a key.
   When the script is served by a receiver, the page finds it on its own.
3. **Paste or issue**: "copy for Claude" puts the open comments on the clipboard; "github issue" (set `data-github="owner/repo"`) opens a prefilled new issue.

Production sites on https can only reach a receiver on https or on localhost. For a phone, put the receiver behind a tunnel (Tailscale funnel, cloudflared) and enter its URL in settings, or use copy and share.

## What each comment records

The note, type, author, time, page URL and title, the element's CSS selector (stable ids, test attributes and classes preferred; hashed class names skipped), XPath, tag, text, a shallow HTML snippet, the selected text if any, the element's box, viewport size, scroll and device pixel ratio.

## For agents

Comments land in `annotations/<site>.json` (gitignored) next to this folder, or in `ANNOTATE_DIR`.

```
node annotate/cli.mjs sites
node annotate/cli.mjs list [--site <text>] [--all] [--json]     open comments as markdown
node annotate/cli.mjs resolve <id> --note "what changed"        shows as resolved on the page after its next sync
node annotate/cli.mjs reopen <id>
```

The `page-comments` skill (`.claude/skills/page-comments/SKILL.md`) walks an agent through it.

## Options

`data-endpoint` (receiver URL, or leave out to auto-detect), `data-key`, `data-github`, `data-project`, `data-author`, `data-start="comment"`. Or set `window.ANNOTATE_CONFIG` before the script loads. Settings typed in the panel are remembered per browser and override these.

## Limits

No screenshots yet (the selector, text and HTML snippet identify the element). Elements inside iframes and closed shadow roots can't be selected. Single-page apps that change the URL without a reload keep their comments by path.
