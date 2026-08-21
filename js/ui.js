/* =============================================================================
   ui.js — pezzi di interfaccia generici (select, pannello info, resize)

   Qui solo funzioni DOM riusabili, senza stato applicativo proprio (nessun
   riferimento a "l'oggetto corrente" o simili) — il collegamento agli eventi
   che toccano stato condiviso (cambio oggetto/perno/scala griglia) resta in
   main.js, che è il solo posto che conosce quello stato.
   ============================================================================= */

/** Costruisce la lista di checkbox, una per oggetto del catalogo. Restituisce
    un array di descrittori {index, entry, rowEl, checkboxEl, swatchEl} così
    il chiamante (main.js) può leggere lo stato o assegnare colori senza
    dover ripetere query DOM. */
export function buildObjectList(containerEl, catalog) {
  const items = [];
  catalog.forEach((entry, index) => {
    const row = document.createElement('label');
    row.className = 'objectItem';
    row.dataset.index = String(index);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.index = String(index);

    const swatch = document.createElement('span');
    swatch.className = 'swatch';

    const labelText = document.createElement('span');
    labelText.className = 'objLabel';
    labelText.textContent = entry.name;

    row.appendChild(checkbox);
    row.appendChild(swatch);
    row.appendChild(labelText);
    containerEl.appendChild(row);

    items.push({ index, entry, rowEl: row, checkboxEl: checkbox, swatchEl: swatch });
  });
  return items;
}

/** Filtro "LIKE %testo%" sul nome, case-insensitive: nasconde le righe che
    non corrispondono, non le rimuove (lo stato dei checkbox nascosti resta
    intatto). */
export function filterObjectList(items, filterText) {
  const needle = filterText.trim().toLowerCase();
  items.forEach(({ rowEl, entry }) => {
    const match = needle === '' || entry.name.toLowerCase().includes(needle);
    rowEl.classList.toggle('hidden', !match);
  });
}

/** Segna una riga come "visualizzata" con un pallino del colore assegnato al
    marcatore, o la riporta allo stato neutro se colorHex è null. */
export function setObjectItemDisplayed(item, colorHex) {
  if (colorHex === null) {
    item.rowEl.classList.remove('displayed');
    item.swatchEl.style.background = '';
  } else {
    item.rowEl.classList.add('displayed');
    item.swatchEl.style.background = '#' + colorHex.toString(16).padStart(6, '0');
  }
}

export function uncheckAllObjectItems(items) {
  items.forEach(({ checkboxEl }) => { checkboxEl.checked = false; });
}

/** Pannello info: una sezione per ciascun oggetto attualmente visualizzato.
    Con zero oggetti mostra un messaggio neutro (solo la Terra è visibile). */
export function updateInfoPanel(infoContentEl, entries) {
  if (!entries || entries.length === 0) {
    infoContentEl.innerHTML = `<div class="row">Nessun oggetto selezionato — solo la Terra è visibile.</div>`;
    return;
  }
  infoContentEl.innerHTML = entries.map(entry => {
    const uncStr = entry.distance_unc_ly
      ? ` ± ${entry.distance_unc_ly.toLocaleString('it-IT')}`
      : '';
    const distStr = entry.distance_ly >= 1e6
      ? (entry.distance_ly / 1e6).toLocaleString('it-IT', { maximumFractionDigits: 2 }) + ' milioni di anni luce'
      : entry.distance_ly.toLocaleString('it-IT') + uncStr + ' anni luce';
    return `
      <h3>${entry.name}</h3>
      <div class="row">${entry.type}</div>
      <div class="row">Distanza dalla Terra: ${distStr}</div>
      <div class="row">RA: ${entry.ra_deg.toFixed(4)}°  Dec: ${entry.dec_deg.toFixed(4)}° (J2000)</div>
      <div class="src">Fonte: ${entry.source}</div>
    `;
  }).join('<hr style="border-color: var(--border); margin:10px 0;">')
    + `<div class="warn">I marcatori 3D non sono in scala rispetto alla distanza reale (altrimenti sarebbero invisibili); indicano solo la posizione relativa.</div>`;
}

/* Lo stato (collassato/espanso) non viene resettato cambiando oggetto —
   resta come l'utente l'ha impostato, è una preferenza di interfaccia, non
   legata al singolo oggetto. Per questo vive internamente qui (closure),
   non tra lo stato applicativo di main.js. Riusabile per qualsiasi pannello
   collassabile (pannello info, pannello controlli) — non solo per l'info. */
export function setupCollapsiblePanel(panelEl, toggleEl, startCollapsed = false) {
  let collapsed = startCollapsed;

  function setCollapsed(value) {
    collapsed = value;
    panelEl.classList.toggle('collapsed', collapsed);
    toggleEl.textContent = collapsed ? 'i' : '−';
    toggleEl.title = collapsed ? 'Espandi' : 'Comprimi';
  }

  toggleEl.addEventListener('click', (e) => {
    e.stopPropagation();
    setCollapsed(!collapsed);
  });
  panelEl.addEventListener('click', () => {
    if (collapsed) setCollapsed(false);
  });

  setCollapsed(startCollapsed);
}

/** Popola il disclaimer in basso a destra. Riceve la versione come
    parametro (non importa version.js direttamente): questo modulo resta
    generico, senza conoscere costanti specifiche dell'applicazione. */
export function renderDisclaimer(el, version) {
  el.innerHTML = `
    GALACTOMIMESIS - © 2026, Lorenzo Trumino<br>
    Version: ${version}<br>
    Part of <a href="https://sicuthipparchus.wordpress.com/" target="_blank" rel="noopener">Sicut Hipparchus Project</a><br>
    Go to <a href="./coordconv.html">Coordinate Converter Utility</a>
  `;
}

export function setupResizeHandler(camera, renderer, container) {
  function onResize() {
    const w = container.clientWidth, h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);
  onResize();
}
