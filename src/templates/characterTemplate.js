// The character card is built from page blocks now (see blocks.js).

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
