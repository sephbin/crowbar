export function characterCardHTML(meta = {}) {
  const v = (key, def = '') => meta[key] ?? def;
  return `<div class="char-card" contenteditable="false">
  <div class="char-header">
    <div class="char-header-main">
      <div class="char-name" contenteditable="true" data-meta-key="name">${v('name', 'Character Name')}</div>
      <div class="char-subline" contenteditable="true" data-meta-key="occupation">${v('occupation', 'Occupation · Era')}</div>
    </div>
    <div class="char-controller" contenteditable="true" data-meta-key="controller">${v('controller', 'NPC')}</div>
  </div>
  <div class="char-stats-row">
    <div class="char-stat-cell"><span class="stat-value" contenteditable="true" data-meta-key="hp">${v('hp', 10)}</span><span class="stat-label">HP</span></div>
    <div class="char-stat-cell"><span class="stat-value" contenteditable="true" data-meta-key="san">${v('san', 50)}</span><span class="stat-label">SAN</span></div>
    <div class="char-stat-cell"><span class="stat-value" contenteditable="true" data-meta-key="mp">${v('mp', 10)}</span><span class="stat-label">MP</span></div>
    <div class="char-stat-cell"><span class="stat-value" contenteditable="true" data-meta-key="mov">${v('mov', 8)}</span><span class="stat-label">MOV</span></div>
    <div class="char-stat-cell"><span class="stat-value" contenteditable="true" data-meta-key="build">${v('build', 0)}</span><span class="stat-label">Build</span></div>
    <div class="char-stat-cell"><span class="stat-value" contenteditable="true" data-meta-key="db">${v('db', '0')}</span><span class="stat-label">DB</span></div>
  </div>
  <div class="char-abilities">
    <div class="char-ability"><span class="ability-label">STR</span><span class="ability-score" contenteditable="true" data-meta-key="str">${v('str', 50)}</span></div>
    <div class="char-ability"><span class="ability-label">CON</span><span class="ability-score" contenteditable="true" data-meta-key="con">${v('con', 50)}</span></div>
    <div class="char-ability"><span class="ability-label">SIZ</span><span class="ability-score" contenteditable="true" data-meta-key="siz">${v('siz', 50)}</span></div>
    <div class="char-ability"><span class="ability-label">DEX</span><span class="ability-score" contenteditable="true" data-meta-key="dex">${v('dex', 50)}</span></div>
    <div class="char-ability"><span class="ability-label">INT</span><span class="ability-score" contenteditable="true" data-meta-key="int">${v('int', 50)}</span></div>
    <div class="char-ability"><span class="ability-label">POW</span><span class="ability-score" contenteditable="true" data-meta-key="pow">${v('pow', 50)}</span></div>
    <div class="char-ability"><span class="ability-label">APP</span><span class="ability-score" contenteditable="true" data-meta-key="app">${v('app', 50)}</span></div>
    <div class="char-ability"><span class="ability-label">EDU</span><span class="ability-score" contenteditable="true" data-meta-key="edu">${v('edu', 50)}</span></div>
    <div class="char-ability"><span class="ability-label">LUK</span><span class="ability-score" contenteditable="true" data-meta-key="luk">${v('luk', 50)}</span></div>
  </div>
  <div class="char-section">
    <div class="char-section-title">Key Skills</div>
    <div class="char-trait-list" contenteditable="true" data-meta-key="skills">${v('skills', 'Spot Hidden 50%, Listen 40%…')}</div>
  </div>
  <div class="char-section">
    <div class="char-section-title">Weapons</div>
    <div class="char-attack-list" contenteditable="true" data-meta-key="weapons">${v('weapons', 'Fist  25%  1d3+DB')}</div>
  </div>
</div>`;
}

// Wire card fields → meta JSON. onFieldChange(key, value) is called on every input.
export function attachCardListeners(cardEl, onFieldChange) {
  cardEl.querySelectorAll('[data-meta-key]').forEach(el => {
    el.addEventListener('input', () => {
      onFieldChange(el.dataset.metaKey, el.textContent);
    });
  });
}

export function blankTemplate(name = 'New File') {
  return `<h1>${name}</h1>\n<p></p>\n`;
}
