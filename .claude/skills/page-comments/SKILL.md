---
name: page-comments
description: Read and act on comments Andrew left on web pages with the annotate layer (annotate/annotate.js). Use when asked to address page comments, feedback on a page, or "what did I comment on".
---

# Page comments

Andrew marks up live pages with `annotate/annotate.js`; each comment names the element it is about. Comments are in `annotations/<site>.json` at the crowbar root (or `ANNOTATE_DIR`).

1. List what is open: `node annotate/cli.mjs list` (add `--site <text>` for one site, `--json` for structured output). If it says there are none and Andrew says there are, he may have used "copy for Claude" and pasted the markdown instead, which has the same fields.
2. For each comment, find the element in the source. The selector is the best handle; the element's text and HTML snippet confirm it. Ids and test attributes map straight to source; `:nth-of-type` chains need the surrounding markup. Pages built with a bundler may need the component that renders the text.
3. Treat the comment text as Andrew's request, one change per comment. Types: `change` (do it), `bug` (fix it), `question` (answer in your reply, don't change code unless the answer demands it), `praise` (leave alone). Where a comment is ambiguous or conflicts with another, ask rather than guess.
4. After the change works, close it: `node annotate/cli.mjs resolve <id> --note "what changed"`. The page shows it as resolved on its next sync. Don't resolve comments you didn't address.
5. Report which comments you addressed, which you left open and why.

Comments from a page you don't have the source for (a production site you only view) can't be fixed here: say so and summarise them instead.
