/* =============================================================================
   ui.js — pezzi di interfaccia generici (select, pannello info, resize)

   Qui solo funzioni DOM riusabili, senza stato applicativo proprio (nessun
   riferimento a "l'oggetto corrente" o simili) — il collegamento agli eventi
   che toccano stato condiviso (cambio oggetto/perno/scala griglia) resta in
   main.js, che è il solo posto che conosce quello stato.
   ============================================================================= */

export function populateObjectSelect(selectEl, catalog) {
  catalog.forEach((entry, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = entry.name;
    selectEl.appendChild(opt);
  });
}

/** Inserisce (o aggiorna, se già presente) la voce dinamica per l'oggetto
    personalizzato passato via querystring, in cima al menu, selezionata. */
export function showCustomOption(selectEl, name) {
  let opt = document.getElementById('customOption');
  if (!opt) {
    opt = document.createElement('option');
    opt.id = 'customOption';
    opt.value = 'custom';
    selectEl.insertBefore(opt, selectEl.firstChild);
  }
  opt.textContent = name;
  selectEl.value = 'custom';
}

export function updateInfoPanel(infoContentEl, entry) {
  const uncStr = entry.distance_unc_ly
    ? ` ± ${entry.distance_unc_ly.toLocaleString('it-IT')}`
    : '';
  const distStr = entry.distance_ly >= 1e6
    ? (entry.distance_ly / 1e6).toLocaleString('it-IT', { maximumFractionDigits: 2 }) + ' milioni di anni luce'
    : entry.distance_ly.toLocaleString('it-IT') + uncStr + ' anni luce';
  infoContentEl.innerHTML = `
    <h3>${entry.name}</h3>
    <div class="row">${entry.type}</div>
    <div class="row">Distanza dalla Terra: ${distStr}</div>
    <div class="row">RA: ${entry.ra_deg.toFixed(4)}°  Dec: ${entry.dec_deg.toFixed(4)}° (J2000)</div>
    <div class="warn">I marcatori 3D non sono in scala rispetto alla distanza reale (altrimenti sarebbero invisibili); indicano solo la posizione relativa.</div>
    <div class="src">Fonte: ${entry.source}</div>
  `;
}

/* Lo stato (collassato/espanso) non viene resettato cambiando oggetto —
   resta come l'utente l'ha impostato, è una preferenza di interfaccia, non
   legata al singolo oggetto. Per questo vive internamente qui (closure),
   non tra lo stato applicativo di main.js. */
export function setupInfoPanelCollapse(infoEl, infoToggleEl) {
  let collapsed = false;

  function setCollapsed(value) {
    collapsed = value;
    infoEl.classList.toggle('collapsed', collapsed);
    infoToggleEl.textContent = collapsed ? 'i' : '−';
    infoToggleEl.title = collapsed ? 'Espandi' : 'Comprimi';
  }

  infoToggleEl.addEventListener('click', (e) => {
    e.stopPropagation();
    setCollapsed(!collapsed);
  });
  infoEl.addEventListener('click', () => {
    if (collapsed) setCollapsed(false);
  });
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
