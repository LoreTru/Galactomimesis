/* =============================================================================
   catalog.js — caricamento catalogo e lettura oggetto da querystring

   Nessuna dipendenza da Three.js/scena: solo dati e logica di parsing. Ogni
   voce del catalogo: id (senza spazi), name, type, ra_deg, dec_deg,
   distance_ly, distance_unc_ly (null se non nota), source.

   IMPORTANTE: il catalogo (catalog.json) va esteso solo con dati verificati
   (SIMBAD, VizieR, Wikipedia con infobox, letteratura primaria). Non
   inventare coordinate o distanze per riempirlo — un valore sbagliato lì
   produce una posizione 3D sbagliata, silenziosamente.
   ============================================================================= */

/** Carica il catalogo da file esterno. Il chiamante deve fare
    `const CATALOG = await loadCatalog();` — essendo dentro un modulo ES,
    l'esecuzione si sospende finché il fetch non è completo. */
export async function loadCatalog(url = './catalog.json') {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`catalog.json non trovato o non raggiungibile (${response.status})`);
  }
  return response.json();
}

/** Cerca un oggetto per id, case-insensitive. Restituisce -1 se non trovato. */
export function findIndexById(catalog, targetId) {
  const normalized = targetId.toLowerCase();
  return catalog.findIndex(item => item.id.toLowerCase() === normalized);
}

/* Lettura di un oggetto personalizzato da querystring:
   ?ra=<gradi>&dec=<gradi>&dist=<al>&name=<testo>

   Non fa parte del catalogo. Servono TUTTI E TRE ra/dec/dist validi (dec
   tra -90 e 90, dist positiva). Se anche uno solo manca o non è valido, non
   è un errore bloccante: si restituisce null e il chiamante scende alla
   logica id/pos normale. name è opzionale (nome di default generato da
   RA/Dec se assente). URLSearchParams decodifica già %20/+ negli spazi di
   name da solo, nessuna gestione manuale necessaria.

   ATTENZIONE (errore già commesso una volta): ra va passato in GRADI
   DECIMALI, non in ore sessagesimali. */
export function parseCustomObjectFromQuery(urlParams) {
  const raStr = urlParams.get('ra');
  const decStr = urlParams.get('dec');
  const distStr = urlParams.get('dist');
  if (raStr === null || decStr === null || distStr === null) return null; // non tutti e tre presenti, ok, non è un errore

  const ra = Number(raStr), dec = Number(decStr), dist = Number(distStr);
  if (!Number.isFinite(ra)) {
    console.warn(`ra="${raStr}" non è un numero valido — parametri custom ignorati.`);
    return null;
  }
  if (!Number.isFinite(dec) || dec < -90 || dec > 90) {
    console.warn(`dec="${decStr}" deve essere un numero tra -90 e 90 — parametri custom ignorati.`);
    return null;
  }
  if (!Number.isFinite(dist) || dist <= 0) {
    console.warn(`dist="${distStr}" deve essere un numero positivo — parametri custom ignorati.`);
    return null;
  }

  const rawName = urlParams.get('name');
  const name = (rawName !== null && rawName.trim() !== '')
    ? rawName
    : `Oggetto personalizzato (RA ${ra}°, Dec ${dec}°)`;

  return {
    id: 'custom',
    name,
    type: 'Oggetto personalizzato (da querystring)',
    ra_deg: ra,
    dec_deg: dec,
    distance_ly: dist,
    distance_unc_ly: null,
    source: 'Coordinate fornite manualmente via querystring (ra, dec, dist) — non fanno parte del catalogo, non verificate da questa applicazione.'
  };
}

/** Risolve l'indice di partenza nel catalogo da querystring (?id= oppure
    ?pos=), con fallback a 0. Non gestisce il caso ra/dec/dist (quello va
    controllato separatamente PRIMA di chiamare questa funzione, perché ha
    priorità e non riguarda un indice nel catalogo). */
export function resolveStartIndex(catalog, urlParams) {
  const idParam = urlParams.get('id');
  if (idParam !== null) {
    const found = findIndexById(catalog, idParam);
    if (found !== -1) return found;
    console.warn(`Nessun oggetto con id "${idParam}" nel catalogo — avvio con il primo oggetto.`);
    return 0;
  }

  const posParam = urlParams.get('pos');
  if (posParam !== null) {
    const n = Number(posParam);
    if (Number.isInteger(n) && n >= 0 && n < catalog.length) return n;
    console.warn(`Indice "${posParam}" non valido (0-${catalog.length - 1} atteso) — avvio con il primo oggetto.`);
    return 0;
  }

  return 0;
}
