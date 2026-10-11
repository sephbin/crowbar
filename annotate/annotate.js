/* annotate.js: a comment layer for any web page.
   A button puts the page in comment mode: tap an element (or select some text) and write a note. Comments are kept in the
   browser, optionally sent to a receiver (annotate/receiver.mjs or the crowbar server), and can be exported as markdown
   for a Claude agent. No dependencies, one file. See annotate/README.md.

   <script src=".../annotate.js" data-endpoint="http://localhost:3002/api/annotations" data-project="Bell Curve"></script>
   Options (data-* on the script tag, or window.ANNOTATE_CONFIG before it loads):
     endpoint  collection URL of a receiver; omit to keep comments on this device ("auto" or omitted with the script served
               by a crowbar/receiver origin probes <script origin>/api/annotations)
     key       sent as x-annotate-key (receiver started with ANNOTATE_KEY)
     github    owner/repo: adds a "github issue" export that opens a prefilled new issue
     project   label stored with each comment
     author    name stored with each comment (asked once when empty)
     start     "comment" opens in comment mode
   Everything the person types in the settings panel overrides these and is remembered per browser. */
(() => {
  if (window.__annotate) { window.__annotate.open(); return; }
  const script = document.currentScript || [...document.scripts].find(s => /annotate\.js/.test(s.src)) || null;
  const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

  // ---------------------------------------------------------------- config
  const scriptOrigin = (() => { try { return script?.src ? new URL(script.src, location.href).origin : ""; } catch { return ""; } })();
  const cfg = { endpoint: "", key: "", github: "", project: "", author: "", start: "", ...(window.ANNOTATE_CONFIG || {}), ...(script?.dataset || {}) };
  const SETTINGS = "annotate:settings";
  Object.assign(cfg, lsGet(SETTINGS, {}));
  if (cfg.endpoint === "auto") cfg.endpoint = "";
  let probed = false;
  const SITE = location.protocol === "file:" || location.origin === "null" ? "file://" + location.pathname.replace(/[^/]*$/, "") : location.origin;
  const KEY = "annotate:v1:" + SITE;

  // ---------------------------------------------------------------- store
  // Each comment: { id, status: open|resolved, type, text, author, createdAt, updatedAt, deleted?, resolution?,
  //   page: { origin, path, url, title, project }, target: { selector, xpath, tag, text, html, quote?, rect },
  //   env: { viewport, scroll, dpr, ua }, _sent }  (_sent is local: the updatedAt the receiver last saw)
  let items = lsGet(KEY, []);
  let dirty = false;
  const persist = () => { dirty = true; lsSet(KEY, items); };
  const live = () => items.filter(c => !c.deleted);
  const here = () => live().filter(c => c.page.path === pagePath());
  const pagePath = () => location.pathname + location.search;
  const uid = () => "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const now = () => new Date().toISOString();

  // ---------------------------------------------------------------- finding elements
  const cssEsc = s => (window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^\w-]/g, "\\$&"));
  const stableId = id => !!id && !/\d{4,}|^[a-f0-9]{8,}$|^:r|^radix|^headlessui/i.test(id);
  const stableClass = c => /^[a-z][\w-]{1,32}$/i.test(c) && !/\d{3,}|^(css|sc|jsx|svelte|emotion|_)/i.test(c) && !/^(active|selected|open|opened|show|shown|hidden|visible|hover|focus|focused|disabled|loading|is-|has-)/i.test(c);
  const TESTATTRS = ["data-testid", "data-test", "data-cy", "data-id", "name", "aria-label"];
  const isUnique = (sel, el) => { try { const l = document.querySelectorAll(sel); return l.length === 1 && l[0] === el; } catch { return false; } };
  function selectorOf(el) {
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && n !== document.documentElement; n = n.parentElement) {
      if (n === document.body) { parts.unshift("body"); break; }
      if (stableId(n.id)) { parts.unshift("#" + cssEsc(n.id)); if (isUnique(parts.join(" > "), el)) break; continue; }
      let part = n.localName;
      const a = TESTATTRS.find(k => n.getAttribute(k) && n.getAttribute(k).length < 60);
      if (a) part += `[${a}="${n.getAttribute(a).replace(/"/g, '\\"')}"]`;
      else {
        part += [...n.classList].filter(stableClass).slice(0, 2).map(c => "." + cssEsc(c)).join("");
        const sib = n.parentElement ? [...n.parentElement.children].filter(x => x.localName === n.localName) : [];
        if (sib.length > 1) part += `:nth-of-type(${sib.indexOf(n) + 1})`;
      }
      parts.unshift(part);
      if (isUnique(parts.join(" > "), el)) break;
    }
    return parts.join(" > ");
  }
  function xpathOf(el) {
    const parts = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const sib = n.parentElement ? [...n.parentElement.children].filter(x => x.localName === n.localName) : [n];
      parts.unshift(`${n.localName}${sib.length > 1 ? `[${sib.indexOf(n) + 1}]` : ""}`);
    }
    return "/" + parts.join("/");
  }
  function findEl(t) {
    if (!t) return null;
    try { const e = t.selector && document.querySelector(t.selector); if (e) return e; } catch { /* bad selector */ }
    try { const e = t.xpath && document.evaluate(t.xpath, document, null, 9, null).singleNodeValue; if (e) return e; } catch { /* bad xpath */ }
    return null;
  }
  const clean = s => String(s || "").replace(/\s+/g, " ").trim();
  function describe(el, quote) {
    const r = el.getBoundingClientRect();
    return {
      selector: selectorOf(el), xpath: xpathOf(el), tag: el.localName, role: el.getAttribute("role") || undefined, label: el.getAttribute("aria-label") || undefined,
      text: clean(el.innerText || el.textContent).slice(0, 160), html: el.cloneNode(false).outerHTML.slice(0, 300), ...(quote ? { quote: clean(quote).slice(0, 400) } : {}),
      rect: { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) },
    };
  }
  const envNow = () => ({ viewport: { w: innerWidth, h: innerHeight }, scroll: { x: Math.round(scrollX), y: Math.round(scrollY) }, dpr: devicePixelRatio, ua: navigator.userAgent });

  // ---------------------------------------------------------------- UI shell (shadow DOM, so page styles can't touch it)
  const host = document.createElement("div");
  host.setAttribute("data-annotate", "");
  host.style.cssText = "all:initial;position:absolute;top:0;left:0;width:0;height:0;z-index:2147483647";
  const root = host.attachShadow({ mode: "open" });
  const I = {
    note: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    list: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  };
  root.innerHTML = `<style>
    :host{all:initial}
    *{box-sizing:border-box;font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}
    :host,.ui{--bg:#fff;--fg:#1b1b1b;--mut:#6b6b6b;--rule:#d9d9d9;--acc:#e64700;--wash:#fff1ea;--ok:#1f7a3c;color-scheme:light dark}
    @media (prefers-color-scheme:dark){.ui{--bg:#232323;--fg:#f0f0f0;--mut:#a5a5a5;--rule:#444;--wash:#3a2a22}}
    .ui{position:fixed;inset:0;pointer-events:none;color:var(--fg)}
    .ui>*{pointer-events:auto}
    button{cursor:pointer;border:1.5px solid var(--fg);background:var(--bg);color:var(--fg);border-radius:999px;padding:8px 14px;min-height:36px;font-weight:600}
    button.pri{background:var(--acc);border-color:var(--acc);color:#fff}
    button.dng{border-color:#b33a00;color:#b33a00}
    button:disabled{opacity:.4}
    button[aria-pressed=true]{background:var(--fg);color:var(--bg)}
    .fab{position:fixed;bottom:calc(16px + env(safe-area-inset-bottom,0px));right:16px;display:flex;gap:8px;align-items:center}
    .fab.left{right:auto;left:16px}
    .fab button{width:48px;height:48px;padding:0;display:grid;place-items:center;box-shadow:0 3px 14px rgba(0,0,0,.3)}
    .fab .main[aria-pressed=true]{background:var(--acc);border-color:var(--acc);color:#fff}
    .fab .count{position:relative}
    .fab .count b{position:absolute;top:-6px;right:-6px;min-width:20px;height:20px;border-radius:10px;background:var(--acc);color:#fff;font-size:12px;display:grid;place-items:center;padding:0 5px}
    .banner{position:fixed;top:8px;left:50%;transform:translateX(-50%);background:var(--acc);color:#fff;border-radius:999px;padding:6px 14px;font-weight:600;box-shadow:0 3px 14px rgba(0,0,0,.3);max-width:calc(100% - 24px);text-align:center}
    .hl{position:fixed;border:2px solid var(--acc);background:rgba(230,71,0,.12);pointer-events:none!important;border-radius:3px}
    .hl.sel{background:rgba(230,71,0,.2);border-style:dashed}
    .pins{position:absolute;top:0;left:0;pointer-events:none}
    .pin{position:absolute;width:24px;height:24px;border-radius:50%;background:var(--acc);color:#fff;font-weight:700;font-size:12px;display:grid;place-items:center;pointer-events:auto;cursor:pointer;
      border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.4);padding:0;min-height:0}
    .pin.done{background:var(--ok)}
    .pop,.panel{position:fixed;background:var(--bg);border:1.5px solid var(--fg);border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,.35);padding:12px;display:flex;flex-direction:column;gap:8px}
    .pop{width:min(340px,calc(100% - 16px))}
    .pop .what{font-size:12px;color:var(--mut);overflow-wrap:anywhere;max-height:3.6em;overflow:hidden}
    .pop textarea{width:100%;min-height:84px;resize:vertical;font-size:16px;padding:8px;border:1.5px solid var(--rule);border-radius:8px;background:var(--bg);color:var(--fg)}
    .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    .row.end{justify-content:flex-end}
    .chips button{padding:4px 10px;min-height:30px;font-size:12px}
    .panel{right:8px;bottom:calc(76px + env(safe-area-inset-bottom,0px));width:min(400px,calc(100% - 16px));max-height:min(70vh,640px)}
    .panel.left{right:auto;left:8px}
    .panel h3{margin:0;font-size:15px}
    .list{overflow:auto;display:flex;flex-direction:column;border-top:1px solid var(--rule);min-height:60px}
    .item{display:flex;gap:10px;padding:10px 4px;border-bottom:1px solid var(--rule);cursor:pointer;align-items:flex-start}
    .item .n{flex:0 0 22px;height:22px;border-radius:50%;background:var(--acc);color:#fff;font-size:12px;font-weight:700;display:grid;place-items:center}
    .item.done .n{background:var(--ok)}
    .item.done .t{color:var(--mut);text-decoration:line-through}
    .item .t{flex:1;min-width:0;overflow-wrap:anywhere}
    .item small{display:block;color:var(--mut);font-size:12px}
    .item .gone{color:#b33a00}
    .mut{color:var(--mut);font-size:12px}
    label.f{display:flex;flex-direction:column;gap:2px;font-size:12px;color:var(--mut)}
    label.f input{font-size:16px;padding:6px 8px;border:1.5px solid var(--rule);border-radius:8px;background:var(--bg);color:var(--fg)}
    .toast{position:fixed;bottom:calc(76px + env(safe-area-inset-bottom,0px));left:50%;transform:translateX(-50%);background:var(--fg);color:var(--bg);border-radius:999px;padding:8px 14px;max-width:calc(100% - 24px)}
  </style><div class="ui" id="ui"></div><div class="pins" id="pins"></div>`;
  const ui = root.getElementById("ui"), pinsEl = root.getElementById("pins");
  const h = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === "class") e.className = v; else if (k === "html") e.innerHTML = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else if (k === "value") e.value = v; else e.setAttribute(k, v === true ? "" : v); }
    for (const c of kids.flat()) if (c != null && c !== false) e.append(c);
    return e;
  };
  const toast = msg => { const t = h("div", { class: "toast", role: "status" }, msg); ui.append(t); setTimeout(() => t.remove(), 2400); };

  // ---------------------------------------------------------------- state
  let mode = false, hover = null, sel = null /* { el, quote } */, popEl = null, panelEl = null, editing = null, showPins = true;
  let fabSide = lsGet("annotate:side", "right");
  const hl = h("div", { class: "hl", hidden: true }), hlSel = h("div", { class: "hl sel", hidden: true });
  const banner = h("div", { class: "banner", hidden: true }, "Comment mode: tap something on the page");
  const fab = h("div", { class: "fab" + (fabSide === "left" ? " left" : "") });
  const modeBtn = h("button", { class: "main", type: "button", "aria-label": "Comment mode", "aria-pressed": "false", title: "Comment mode", html: I.note, onclick: () => setMode(!mode) });
  const countB = h("b", {}, "0");
  const listBtn = h("button", { class: "count", type: "button", "aria-label": "Comments", title: "Comments", html: I.list, onclick: () => togglePanel() });
  listBtn.append(countB);
  fab.append(listBtn, modeBtn);
  ui.append(hl, hlSel, banner, fab);

  function place(box, el) {
    if (!el || !el.isConnected) { box.hidden = true; return; }
    const r = el.getBoundingClientRect();
    box.hidden = !(r.width || r.height);
    Object.assign(box.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
  }
  function setMode(on) {
    mode = on; modeBtn.setAttribute("aria-pressed", String(on)); banner.hidden = !on;
    if (!on) { hover = null; hl.hidden = true; closePop(); }
    else { closePanel(); showPins = true; renderPins(); }
    for (const ev of BLOCKED) window[on ? "addEventListener" : "removeEventListener"](ev, swallow, { capture: true, passive: false });
    window[on ? "addEventListener" : "removeEventListener"]("click", onPick, { capture: true });
    window[on ? "addEventListener" : "removeEventListener"]("pointermove", onMove, { capture: true });
    window[on ? "addEventListener" : "removeEventListener"]("mouseup", onSelectText, { capture: true });
    document.documentElement.style.cursor = on ? "crosshair" : "";
  }
  const mine = e => e.composedPath().includes(host);
  const BLOCKED = ["mousedown", "mouseup", "pointerdown", "pointerup", "touchstart", "touchend", "dblclick", "auxclick", "submit"];
  // the page must not react while commenting; scrolling and our own controls are left alone
  function swallow(e) { if (mine(e)) return; if (e.type === "mouseup" && !getSelection().isCollapsed) return; e.stopImmediatePropagation(); if (e.type === "submit") e.preventDefault(); }
  function onMove(e) {
    if (e.pointerType && e.pointerType !== "mouse") return;
    if (mine(e)) { hover = null; hl.hidden = true; return; }
    const el = document.elementFromPoint(e.clientX, e.clientY);
    hover = el && el !== host ? el : null; place(hl, hover);
  }
  function onPick(e) {
    if (mine(e)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (!getSelection().isCollapsed) return;   // a text selection is handled on mouseup
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (el && el !== host && el !== document.documentElement) openPop({ el });
  }
  function onSelectText(e) {
    if (mine(e)) return;
    const s = getSelection(), q = s.toString();
    if (!q.trim()) return;
    let n = s.getRangeAt(0).commonAncestorContainer; if (n.nodeType !== 1) n = n.parentElement;
    if (n && !n.closest("[data-annotate]")) { e.stopImmediatePropagation(); openPop({ el: n, quote: q }); }
  }

  // ---------------------------------------------------------------- popover: write, edit or resolve one comment
  function closePop() { popEl?.remove(); popEl = null; hlSel.hidden = true; sel = null; editing = null; }
  const TYPES = ["change", "bug", "question", "praise"];
  function openPop({ el, quote, comment }) {
    closePop(); closePanel();
    sel = { el, quote }; editing = comment || null;
    let type = comment?.type || "change";
    const ta = h("textarea", { placeholder: "What should change here?", "aria-label": "Comment", inputmode: "text", enterkeyhint: "done", value: comment?.text || "" });
    const what = h("div", { class: "what" });
    const typeRow = h("div", { class: "row chips", role: "group", "aria-label": "Type" });
    const drawTypes = () => { typeRow.replaceChildren(...TYPES.map(t => h("button", { type: "button", "aria-pressed": String(t === type), onclick: () => { type = t; drawTypes(); } }, t))); };
    drawTypes();
    const drawWhat = () => { const d = comment && sel.el === findEl(comment.target) ? comment.target : describe(sel.el, sel.quote);
      what.textContent = `${d.tag}${d.label ? ` “${d.label}”` : d.text ? ` “${d.text.slice(0, 70)}”` : ""}${sel.quote ? ` · selected: “${sel.quote.slice(0, 60)}”` : ""}`; place(hlSel, sel.el); };
    drawWhat();
    const wider = h("button", { type: "button", title: "Select the parent element", onclick: () => { if (sel.el.parentElement && sel.el.parentElement !== document.documentElement) { sel.el = sel.el.parentElement; sel.quote = null; drawWhat(); } } }, "↑ parent");
    const save = h("button", { type: "button", class: "pri", onclick: () => {
      const text = ta.value.trim(); if (!text) { ta.focus(); return; }
      if (!cfg.author) { cfg.author = (prompt("Your name, for the comments you leave?", "") || "").trim(); if (cfg.author) lsSet(SETTINGS, { ...lsGet(SETTINGS, {}), author: cfg.author }); }
      const t = now();
      if (comment) { Object.assign(comment, { text, type, updatedAt: t, target: sel.el === findEl(comment.target) ? comment.target : describe(sel.el, sel.quote), env: envNow() }); }
      else items.push({ id: uid(), status: "open", type, text, author: cfg.author || "", createdAt: t, updatedAt: t,
        page: { origin: SITE, path: pagePath(), url: location.href, title: document.title, project: cfg.project || "" }, target: describe(sel.el, sel.quote), env: envNow() });
      persist(); closePop(); refresh(); sync();
    } }, comment ? "update" : "save");
    const extra = comment ? [
      h("button", { type: "button", onclick: () => { Object.assign(comment, { status: comment.status === "open" ? "resolved" : "open", updatedAt: now() }); persist(); closePop(); refresh(); sync(); } }, comment.status === "open" ? "resolve" : "reopen"),
      h("button", { type: "button", class: "dng", onclick: () => { if (confirm("Delete this comment?")) { Object.assign(comment, { deleted: true, updatedAt: now() }); persist(); closePop(); refresh(); sync(); } } }, "delete"),
    ] : [];
    popEl = h("div", { class: "pop", role: "dialog", "aria-label": "Comment" },
      h("div", { class: "row" }, h("b", {}, comment ? `Comment ${here().indexOf(comment) + 1}` : "New comment"), comment?.author ? h("span", { class: "mut" }, comment.author) : null), what, ta, typeRow,
      comment?.resolution ? h("div", { class: "mut" }, `Resolution: ${comment.resolution}`) : null,
      h("div", { class: "row end" }, h("button", { type: "button", onclick: closePop }, "cancel"), wider, ...extra, save));
    ui.append(popEl);
    positionPop(); ta.focus({ preventScroll: true });
    ta.addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save.click(); });
  }
  function positionPop() {
    if (!popEl || !sel) return;
    const r = sel.el.getBoundingClientRect(), pw = popEl.offsetWidth, ph = popEl.offsetHeight, small = innerWidth < 560;
    if (small) { Object.assign(popEl.style, { left: "8px", right: "8px", width: "auto", bottom: "calc(72px + env(safe-area-inset-bottom,0px))", top: "auto" }); return; }
    let top = r.bottom + 10; if (top + ph > innerHeight - 8) top = Math.max(8, r.top - ph - 10);
    const left = Math.min(Math.max(8, r.left), innerWidth - pw - 8);
    Object.assign(popEl.style, { left: left + "px", top: Math.max(8, top) + "px" });
  }

  // ---------------------------------------------------------------- pins: a numbered mark on each commented element
  function renderPins() {
    pinsEl.replaceChildren();
    if (!showPins) return;
    here().forEach((c, i) => {
      const el = findEl(c.target); if (!el) return;
      const r = el.getBoundingClientRect(); if (!r.width && !r.height) return;
      const pin = h("button", { class: "pin" + (c.status === "resolved" ? " done" : ""), type: "button", "aria-label": `Comment ${i + 1}: ${c.text.slice(0, 60)}`, title: c.text,
        onclick: ev => { ev.stopPropagation(); openPop({ el, comment: c }); } }, String(i + 1));
      pin.style.left = Math.max(0, r.left + scrollX - 12) + "px"; pin.style.top = Math.max(0, r.top + scrollY - 12) + "px";
      pinsEl.append(pin);
    });
  }
  let raf = 0;
  const refresh = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { renderPins(); countB.textContent = String(here().filter(c => c.status === "open").length); if (sel) { place(hlSel, sel.el); positionPop(); } if (hover) place(hl, hover); if (panelEl && !settings && dirty) drawPanel(); dirty = false; }); };
  addEventListener("scroll", () => { renderPins(); if (sel) { place(hlSel, sel.el); positionPop(); } if (hover) place(hl, hover); }, { capture: true, passive: true });
  addEventListener("resize", refresh);
  new MutationObserver(m => { if (!m.every(x => host.contains(x.target))) refresh(); }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden"] });
  setInterval(refresh, 1500);

  // ---------------------------------------------------------------- panel: the list, exports and settings
  function closePanel() { panelEl?.remove(); panelEl = null; }
  function togglePanel() { if (panelEl) closePanel(); else { setMode(false); drawPanel(); } }
  let view = "page", settings = false;
  function drawPanel() {
    const had = panelEl; closePanel();
    const all = view === "site", list = (all ? live() : here());
    panelEl = h("div", { class: "panel" + (fabSide === "left" ? " left" : ""), role: "dialog", "aria-label": "Comments" });
    const head = h("div", { class: "row" }, h("h3", {}, settings ? "Settings" : "Comments"), h("span", { class: "mut", id: "sync" }, syncMsg),
      h("span", { style: "margin-left:auto" }), h("button", { type: "button", onclick: () => { settings = !settings; drawPanel(); } }, settings ? "back" : "settings"), h("button", { type: "button", "aria-label": "Close", onclick: closePanel }, "×"));
    panelEl.append(head);
    if (settings) panelEl.append(...settingsForm());
    else {
      panelEl.append(h("div", { class: "row chips" },
        h("button", { type: "button", "aria-pressed": String(!all), onclick: () => { view = "page"; drawPanel(); } }, "this page"),
        h("button", { type: "button", "aria-pressed": String(all), onclick: () => { view = "site"; drawPanel(); } }, "whole site"),
        h("button", { type: "button", "aria-pressed": String(showPins), onclick: () => { showPins = !showPins; renderPins(); drawPanel(); } }, showPins ? "pins on" : "pins off")));
      const box = h("div", { class: "list" });
      if (!list.length) box.append(h("div", { class: "mut", style: "padding:14px 4px" }, "No comments yet. Turn on comment mode and tap something."));
      list.forEach((c, i) => {
        const el = c.page.path === pagePath() ? findEl(c.target) : null, n = c.page.path === pagePath() ? here().indexOf(c) + 1 : "•";
        box.append(h("div", { class: "item" + (c.status === "resolved" ? " done" : ""), role: "button", tabindex: "0",
          onclick: () => { if (c.page.path !== pagePath()) { location.href = c.page.url; return; } if (el) { closePanel(); el.scrollIntoView({ block: "center", behavior: "smooth" }); setTimeout(() => openPop({ el, comment: c }), 350); } else toast("That element is not on the page any more"); } },
          h("span", { class: "n" }, String(n)), h("div", { class: "t" }, c.text, h("small", {}, `${c.type} · ${c.target.tag}${c.status === "resolved" ? " · resolved" : ""}${c.page.path !== pagePath() ? ` · ${c.page.path}` : ""}${c.author ? ` · ${c.author}` : ""}`,
            c.page.path === pagePath() && !el ? h("span", { class: "gone" }, " · element not found") : null))));
      });
      panelEl.append(box);
      const sent = items.filter(c => c._sent !== c.updatedAt).length;
      panelEl.append(h("div", { class: "row" },
        cfg.endpoint ? h("button", { type: "button", class: "pri", onclick: () => sync(true) }, sent ? `sync (${sent})` : "sync") : null,
        h("button", { type: "button", onclick: () => copy(markdown(list.filter(c => c.status === "open")), "copied for Claude") }, "copy for Claude"),
        navigator.share ? h("button", { type: "button", onclick: () => navigator.share({ title: `Comments on ${document.title}`, text: markdown(list.filter(c => c.status === "open")) }).catch(() => { }) }, "share") : null,
        cfg.github ? h("button", { type: "button", onclick: githubIssue }, "github issue") : null,
        h("button", { type: "button", onclick: download }, "json"),
        list.some(c => c.status === "resolved") ? h("button", { type: "button", onclick: () => { for (const c of list.filter(c => c.status === "resolved")) Object.assign(c, { deleted: true, updatedAt: now() }); persist(); refresh(); sync(); } }, "clear resolved") : null));
    }
    ui.append(panelEl);
    if (had) panelEl.scrollTop = had.scrollTop;
  }
  function settingsForm() {
    const f = (label, key, ph, type = "text") => h("label", { class: "f" }, label, h("input", { type, value: cfg[key] || "", placeholder: ph, autocomplete: "off", autocapitalize: "off", spellcheck: "false", oninput: e => { cfg[key] = e.target.value.trim(); } }));
    return [f("Your name", "author", "shown on your comments"), f("Receiver URL", "endpoint", "http://localhost:3002/api/annotations", "url"), f("Receiver key (if it asks for one)", "key", "optional"),
      f("GitHub repo for issues", "github", "owner/repo"), f("Project label", "project", "e.g. Bell Curve"),
      h("div", { class: "row" }, h("button", { type: "button", class: "pri", onclick: () => { lsSet(SETTINGS, { author: cfg.author, endpoint: cfg.endpoint, key: cfg.key, github: cfg.github, project: cfg.project }); settings = false; drawPanel(); sync(true); } }, "save"),
        h("button", { type: "button", onclick: () => { fabSide = fabSide === "left" ? "right" : "left"; lsSet("annotate:side", fabSide); fab.classList.toggle("left", fabSide === "left"); drawPanel(); } }, "move buttons to the other side")),
      h("p", { class: "mut" }, "Comments stay in this browser until a receiver is set. Settings are kept per browser.")];
  }

  // ---------------------------------------------------------------- exports
  const md = s => String(s).replace(/\n/g, " ");
  function markdown(list) {
    if (!list.length) return "No open comments.";
    const pages = [...new Set(list.map(c => c.page.url))];
    const out = [`# Page comments${cfg.project ? `: ${cfg.project}` : ""}`, "", `${list.length} open comment${list.length === 1 ? "" : "s"} on ${pages.join(", ")}. Each names the element it is about: use the selector, the text and the HTML to find it in the source.`, ""];
    list.forEach((c, i) => {
      const t = c.target;
      out.push(`## ${i + 1}. [${c.type}] ${md(c.text)}`, "", `- Page: ${c.page.path} (${md(c.page.title)})`, `- Element: \`${t.tag}\`${t.label ? ` aria-label "${md(t.label)}"` : ""}${t.text ? `, text "${md(t.text.slice(0, 100))}"` : ""}`, `- Selector: \`${t.selector}\``);
      if (t.quote) out.push(`- Selected text: "${md(t.quote)}"`);
      out.push(`- HTML: \`${md(t.html)}\``, `- Viewport: ${c.env.viewport.w}×${c.env.viewport.h}${c.author ? `, from ${c.author}` : ""}`, `- Id: ${c.id}`, "");
    });
    return out.join("\n");
  }
  function copy(text, msg) {
    const done = () => toast(msg);
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => fallback());
    else fallback();
    function fallback() { const t = h("textarea", { style: "position:fixed;opacity:0" }); t.value = text; ui.append(t); t.select(); try { document.execCommand("copy"); done(); } catch { toast("could not copy"); } t.remove(); }
  }
  function download() {
    const blob = new Blob([JSON.stringify({ site: SITE, comments: live().map(({ _sent, ...c }) => c) }, null, 2)], { type: "application/json" });
    const a = h("a", { href: URL.createObjectURL(blob), download: `comments-${location.hostname || "page"}.json` }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function githubIssue() {
    const open = here().filter(c => c.status === "open"), body = markdown(open).slice(0, 5500);
    window.open(`https://github.com/${cfg.github}/issues/new?title=${encodeURIComponent(`Page comments: ${document.title}`)}&body=${encodeURIComponent(body)}`, "_blank", "noopener");
  }

  // ---------------------------------------------------------------- sync with a receiver: the newer updatedAt wins
  let syncMsg = "", syncing = false;
  const setMsg = m => { syncMsg = m; const e = panelEl?.querySelector("#sync"); if (e) e.textContent = m; };
  async function sync(loud) {
    if (!cfg.endpoint && !probed) { probed = true; await probe(); }
    if (!cfg.endpoint || syncing) return;
    syncing = true; setMsg("syncing…");
    const ep = cfg.endpoint.replace(/\/$/, ""), headers = { "content-type": "application/json", ...(cfg.key ? { "x-annotate-key": cfg.key } : {}) };
    try {
      const r = await fetch(`${ep}?site=${encodeURIComponent(SITE)}&deleted=1`, { headers });
      if (!r.ok) throw new Error(r.status);
      for (const rc of (await r.json()).comments || []) {
        const l = items.find(x => x.id === rc.id);
        if (!l) items.push({ ...rc, _sent: rc.updatedAt }); else if (rc.updatedAt > l.updatedAt) Object.assign(l, rc, { _sent: rc.updatedAt });
      }
      for (const c of items.filter(c => c._sent !== c.updatedAt)) {
        const { _sent, ...body } = c;
        const p = await fetch(`${ep}/${encodeURIComponent(c.id)}`, { method: "PUT", headers, body: JSON.stringify(body) });
        if (!p.ok) throw new Error(p.status);
        c._sent = c.updatedAt;
      }
      items = items.filter(c => !(c.deleted && c._sent === c.updatedAt));
      persist(); setMsg("synced"); if (loud) toast("synced");
    } catch (e) { setMsg("offline: kept on this device"); if (loud) toast("receiver not reachable"); }
    syncing = false; refresh();
  }
  // a script served by a receiver (crowbar, receiver.mjs) can find it without being told
  async function probe() {
    for (const base of [...new Set([scriptOrigin, SITE])].filter(b => /^https?:/.test(b))) {
      try { const ac = new AbortController(); setTimeout(() => ac.abort(), 2500); const r = await fetch(`${base}/api/annotations/ping`, { signal: ac.signal }); if (r.ok && (await r.json()).ok) { cfg.endpoint = `${base}/api/annotations`; return; } } catch { /* none here */ }
    }
  }

  // ---------------------------------------------------------------- go
  addEventListener("keydown", e => { if (e.key === "Escape") { if (popEl) closePop(); else if (panelEl) closePanel(); else if (mode) setMode(false); } });
  document.documentElement.append(host);
  window.__annotate = { open() { drawPanel(); }, setMode, items: () => live(), markdown: () => markdown(live().filter(c => c.status === "open")), sync, remove() { setMode(false); host.remove(); delete window.__annotate; } };
  refresh();
  sync();
  if (cfg.start === "comment") setMode(true);
})();
