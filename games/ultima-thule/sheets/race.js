// Race picker for the player sheets. Shows once before the sheet renders; the choice is kept in this browser.
// Each race is a flat set of deltas added on top of the pregen's characteristics.
// Deltas = race dice average minus human dice average, rounded toward zero (bestiary pp.226-229;
// human STR/CON/POW/DEX/CHA 3D6, SIZ/INT 2D6+6). Half-races halve the deltas (half-elf rule, p.226).
(function () {
  const RACES = [
    { id: "human", name: "Human", d: {}, move: 10, note: "No changes." },
    { id: "dwarf", name: "Dwarf", d: { STR: 3, CON: 5, SIZ: -6 }, move: 6,
      note: "Dark vision: sees 15 m in total darkness, +15 m per extra level; levels = ½ POW, rounded up (pp.105, 226)." },
    { id: "elf", name: "Elf", d: { STR: -1, SIZ: -4, INT: 3, POW: 2, DEX: 3 }, move: 11,
      note: "Night vision: sees clearly for 15 m by any faint light; levels = ½ POW, rounded up (pp.105, 227)." },
    { id: "half-elf", name: "Half-elf", d: { SIZ: -2, INT: 1, POW: 1, DEX: 1 }, move: 11,
      note: "Night vision at half an elf's levels: ¼ POW, rounded up (pp.105, 226)." },
    { id: "halfling", name: "Halfling", d: { STR: -3, CON: 8, SIZ: -8, DEX: 6 }, move: 6,
      note: "Thrown rocks ignore a negative damage modifier (p.229)." },
    { id: "half-orc", name: "Half-orc", d: { STR: 1, SIZ: -2, DEX: 1, CHA: -1 }, move: 9,
      note: "Half the orc deltas, by the half-elf method (p.226)." },
    { id: "orc", name: "Orc", d: { STR: 3, SIZ: -4, DEX: 3, CHA: -3 }, move: 8,
      note: "Prefers darkness but functions in daylight (p.229)." },
  ];
  const KEYS = ["STR", "CON", "SIZ", "INT", "POW", "DEX", "CHA"];
  const DM = t => t <= 12 ? "−1D6" : t <= 16 ? "−1D4" : t <= 24 ? "None" : t <= 32 ? "+1D4" : t <= 40 ? "+1D6" : "+2D6";
  const HALF = { "+1D4": "+1D2", "+1D6": "+1D3", "+2D6": "+1D6" }; // p.20: halve positive DM for thrown; negative stays
  const store = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const put = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const sign = n => (n > 0 ? "+" : "−") + Math.abs(n);
  const dline = r => KEYS.filter(k => r.d[k]).map(k => `${k} ${sign(r.d[k])}`).join(" · ") || "no changes";

  // Damage modifier applied per weapon skill: melee and brawl full, thrown half, self-propelled and spells none (p.20).
  const dmMode = skill => /Crossbow|Firearm|Blast/.test(skill) ? "none" : /Thrown|Missile/.test(skill) ? "half" : /Grapple/.test(skill) ? "none" : "full";
  const withDM = (dmg, oldDM, newDM, mode) => {
    if (mode === "none" || !/^\d/.test(dmg) || /per level/.test(dmg)) return dmg;
    const strip = m => (m !== "None" && dmg.endsWith(m)) ? dmg.slice(0, -m.length) : null;
    const base = strip(mode === "half" ? (HALF[oldDM] || oldDM) : oldDM) ?? dmg;
    const add = mode === "half" ? (HALF[newDM] || newDM) : newDM;
    return add === "None" ? base : base + add;
  };

  function apply(ch, sk, race) {
    const c0 = { ...ch.c }, c = ch.c;
    KEYS.forEach(k => { c[k] = Math.max(1, c0[k] + (race.d[k] || 0)); });
    const dDEX = c.DEX - c0.DEX, dINT = c.INT - c0.INT;
    if (sk.Dodge != null) sk.Dodge += 2 * dDEX;                       // Dodge base DEX×2
    if (ch.spells) ch.spells.forEach(s => { s[1] += dINT; });         // spells base INT×1
    const oldDM = DM(c0.STR + c0.SIZ), newDM = DM(c.STR + c.SIZ);
    ch.weapons.forEach(w => { w[2] = withDM(w[2], oldDM, newDM, dmMode(w[1])); });
    ch.race = race.name; ch.move = race.move; ch.raceNote = race.id === "human" ? null : `${dline(race)}. ${race.note}`;
  }

  function picker(ch, done) {
    const wrap = document.createElement("div");
    wrap.className = "modal racepick"; wrap.setAttribute("role", "dialog"); wrap.setAttribute("aria-modal", "true");
    wrap.setAttribute("aria-labelledby", "racetitle");
    const card = document.createElement("div"); card.className = "mcard"; wrap.append(card);
    card.innerHTML = `<div class="mkind">before you start</div><h3 id="racetitle">Choose ${ch.name.split(" ").slice(-2, -1)[0] || ch.name}'s race</h3>
      <p class="mhint">Adds these changes to the sheet's characteristics. Saved on this device; change it later from the top of the sheet.</p>`;
    const list = document.createElement("div"); list.className = "racelist"; card.append(list);
    RACES.forEach(r => {
      const b = document.createElement("button"); b.type = "button"; b.className = "raceopt";
      b.innerHTML = `<b>${r.name}</b><span>${dline(r)} · Move ${r.move}</span>`;
      b.addEventListener("click", () => { wrap.remove(); document.body.classList.remove("locked"); done(r); });
      list.append(b);
    });
    document.body.append(wrap); document.body.classList.add("locked");
    list.querySelector("button").focus();
  }

  window.RacePicker = {
    init(ch, sk, render) {
      const key = `charsheet-${ch.id}-race`, trackers = `charsheet-${ch.id}-v1`;
      const go = race => {
        apply(ch, sk, race); render();
        const h = document.querySelector("header.top .ctl");
        if (h && !h.querySelector(".racebtn")) {
          const b = document.createElement("button"); b.type = "button"; b.className = "reset racebtn";
          b.textContent = `Race: ${race.name} · change`;
          b.addEventListener("click", () => {
            if (!confirm("Change race? Hit point and power point trackers reset to the new maximums.")) return;
            try { localStorage.removeItem(key); } catch (e) {}
            location.reload();
          });
          h.prepend(b);
        }
      };
      const saved = RACES.find(r => r.id === store(key));
      if (saved) return go(saved);
      picker(ch, race => {
        put(key, race.id);
        // A new race changes HP and PP maximums: drop stored tracker values so they start full.
        try { const s = JSON.parse(store(trackers) || "{}"); if (s[ch.id]) { delete s[ch.id].hp; delete s[ch.id].pp; put(trackers, JSON.stringify(s)); } } catch (e) {}
        go(race);
      });
    },
  };
})();
