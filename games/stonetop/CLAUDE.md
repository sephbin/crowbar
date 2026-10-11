# Stonetop sheets

Browser character sheets that look like the paper playbooks (open `index.html`; served at `/games/stonetop/`).

- `index.html`, `stonetop.css`, `stonetop.js`: the app. No build step, no playbook text inside.
- `pack/stonetop-pack.json`: **gitignored**, built from the playbook PDFs. Players load this file once on the home page; it is kept in their browser (localStorage). A pack sitting at `pack/` next to the page is picked up automatically (GM's machine).
- `tools/extract_playbooks.py <folder or zip of "Playbook - The X.pdf"> [out.json]`: needs PyMuPDF. Extracts by region (all nine playbooks share one layout); checkboxes, circles and diamonds are vector drawings found by shape. `tools/show.py pack/stonetop-pack.json heavy moves` prints a playbook's blocks for checking against the PDF.
- Characters live in the browser and can be exported/imported as `stonetop-character` JSON.
- Source PDFs: Andrew's OneDrive `RPG\Stonetop\` (individual playbooks zip). Not yet covered: the playbook inserts PDF (followers, crew, revenant/thrall), the steading and GM playbooks.
