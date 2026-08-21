/*
	GALACTOMIMESIS
	Source and license at: https://github.com/LoreTru/Galactomimesis
	Numero di versione: vedi version.js
*/
import * as THREE from "https://cdnjs.cloudflare.com/ajax/libs/three.js/0.185.1/three.module.min.js";

import { GM_VER } from './version.js';
import { raDecDistToCartesian, computeEarthPos, R_SUN_LY } from './coords.js';
import { loadCatalog, parseCustomObjectFromQuery, resolveStartIndex } from './catalog.js';
import { buildGalaxy } from './galaxy.js';
import { buildGalacticGrid, applyGridScale as applyGridScaleTo, updateGridLabels } from './grid.js';
import { createOrbitControls } from './controls.js';
import { createEarthMarker, createObjectMarker, updateObjectMarker, updateMarkerLine, removeObjectMarker, computeFraming, clampMarkerToMaxPixels } from './markers.js';
import {
  buildObjectList, filterObjectList, setObjectItemDisplayed, uncheckAllObjectItems,
  updateInfoPanel as renderInfoPanel, setupCollapsiblePanel, setupResizeHandler, renderDisclaimer
} from './ui.js';
import { projectLabelToScreen } from './label-utils.js';

/* =============================================================================
   CATALOGO
   ============================================================================= */
const CATALOG = await loadCatalog('./catalog.json');

/* =============================================================================
   SETUP SCENA
   ============================================================================= */
const container = document.getElementById('container');
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.insertBefore(renderer.domElement, container.firstChild);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.001, 1e9);
camera.up.set(0, 0, 1); // vedi coords.js/riepilogo progetto: allineato al polo dei controlli orbit

/* =============================================================================
   STRUTTURA GALATTICA e POSIZIONE DELLA TERRA
   ============================================================================= */
const { arms } = buildGalaxy(scene);
const EARTH_POS = computeEarthPos();

/* =============================================================================
   ETICHETTE DEI BRACCI
   ============================================================================= */
const armLabelsContainer = document.getElementById('armLabels');
const armLabelEls = arms.map(arm => {
  const el = document.createElement('div');
  el.className = 'armLabel';
  el.textContent = arm.name;
  armLabelsContainer.appendChild(el);
  return { el, position: arm.position };
});

function updateArmLabels() {
  armLabelEls.forEach(({ el, position }) => projectLabelToScreen(el, position, camera, container));
}

/* =============================================================================
   GRIGLIA DI COORDINATE GALATTICHE
   ============================================================================= */
const { galacticGrid, gridLabelEls } = buildGalacticGrid(scene, EARTH_POS, armLabelsContainer);

/* =============================================================================
   MARCATORE TERRA (fisso) + materiale della linea (condiviso da tutti gli
   oggetti: resta uniforme — vedi nota colori sotto)
   ============================================================================= */
const earthMarker = createEarthMarker(scene, EARTH_POS);
const lineMat = new THREE.LineBasicMaterial({ color: 0xeee8aa }); // giallo paglierino

/* =============================================================================
   CONTROLLI ORBIT
   ============================================================================= */
const controls = createOrbitControls(camera, renderer.domElement);

/* =============================================================================
   STATO APPLICATIVO — MULTI-OGGETTO

   displayedMarkers: registro dei marcatori attualmente in scena, chiave
   entry.id. currentEntries: l'array corrispondente, usato per ricalcolare
   inquadratura/griglia quando cambia solo il perno o la scala, senza dover
   ricreare i marcatori.
   ============================================================================= */
let displayedMarkers = new Map();  // entry.id -> marker
let currentEntries = [];
let nextColorIndex = 0;
let gridScaleFactor = 1;
let pivotMode = 'earth'; // 'earth' oppure 'gc'

const MAX_MARKER_PIXELS = 6; // vedi clampMarkerToMaxPixels() in markers.js
const FALLBACK_VIEW_LY = 2000;      // inquadratura di default quando è visibile solo la Terra col perno su di essa (altrimenti raggio zero)
const DEFAULT_GRID_DISTANCE_LY = R_SUN_LY; // scala di default della griglia quando nessun oggetto è visualizzato

/* Colori distintivi per marcatore, assegnati in ordine di comparsa (non
   scelta esplicitamente richiesta, ma necessaria per distinguere più
   oggetti a colpo d'occhio). Evitano l'azzurro della Terra (#1ec8ff) e il
   giallo paglierino della linea (#eee8aa). La linea Terra-oggetto resta
   invece uniforme per tutti — è un indicatore di "collegamento alla Terra",
   non di identità dell'oggetto. */
const COLOR_PALETTE = [
  0xff2b2b, 0xffa62b, 0xd42bff, 0x2bff8f, 0x2bffe6,
  0x2bd4ff, 0xff2bb0, 0x8fff2b, 0xa62bff, 0xff6f2b
];

function getMaxDisplayedDistance(entries) {
  return entries.reduce((max, e) => Math.max(max, e.distance_ly), 0);
}

/* =============================================================================
   UI: pannello oggetti (filtro + lista a checkbox)
   ============================================================================= */
const objectListEl = document.getElementById('objectList');
const objectItems = buildObjectList(objectListEl, CATALOG);
const objectItemsById = new Map(objectItems.map(item => [item.entry.id, item]));

/* =============================================================================
   VISUALIZZAZIONE — punto centrale: sincronizza scena, camera, griglia e
   pannello info con l'insieme di oggetti passato. Usata sia da Applica sia
   da Reset sia dal cambio di perno (che deve solo ricalcolare l'inquadratura
   sugli oggetti già mostrati, senza ricrearli).
   ============================================================================= */
function setDisplayedEntries(entries) {
  currentEntries = entries;
  const newIds = new Set(entries.map(e => e.id));

  // rimuovi marcatori di oggetti non più nell'insieme
  for (const [id, marker] of displayedMarkers) {
    if (!newIds.has(id)) {
      removeObjectMarker(scene, marker);
      if (marker.labelEl) marker.labelEl.remove();
      displayedMarkers.delete(id);
      const item = objectItemsById.get(id);
      if (item) setObjectItemDisplayed(item, null);
    }
  }

  const allPoints = [EARTH_POS];
  entries.forEach(entry => {
    let marker = displayedMarkers.get(entry.id);
    if (!marker) {
      const color = COLOR_PALETTE[nextColorIndex % COLOR_PALETTE.length];
      nextColorIndex++;
      marker = createObjectMarker(scene, color);
      marker.color = color;

      // etichetta con l'id, colorata come il marcatore — proiettata a ogni
      // frame in animate() usando la posizione corrente della mesh
      const labelEl = document.createElement('div');
      labelEl.className = 'objMarkerLabel';
      labelEl.textContent = entry.id;
      labelEl.style.color = '#' + color.toString(16).padStart(6, '0');
      armLabelsContainer.appendChild(labelEl);
      marker.labelEl = labelEl;

      displayedMarkers.set(entry.id, marker);
    }

    const posFromEarth = raDecDistToCartesian(entry.ra_deg, entry.dec_deg, entry.distance_ly);
    const pos = posFromEarth.clone().add(EARTH_POS);
    const markerScale = entry.distance_ly * 0.01;
    updateObjectMarker(marker, pos, markerScale);
    updateMarkerLine(scene, marker, EARTH_POS, pos, lineMat);
    allPoints.push(pos);

    const item = objectItemsById.get(entry.id);
    if (item) setObjectItemDisplayed(item, marker.color);
  });

  // dimensione marcatore Terra: coerente col più grande tra gli oggetti
  // visualizzati (o un valore neutro se nessuno è selezionato)
  const maxDist = getMaxDisplayedDistance(entries);
  const earthMarkerScale = (maxDist > 0 ? maxDist : DEFAULT_GRID_DISTANCE_LY) * 0.01;
  earthMarker.baseScale = earthMarkerScale;

  // inquadratura camera: perno Terra o Centro Galattico, sfera-limite su
  // TUTTI i punti visualizzati (generalizzazione di computeFraming, vedi
  // markers.js). Caso degenere: perno=Terra e nessun oggetto -> Terra
  // coincide col perno, raggio zero — aggiungo un punto virtuale (non
  // visualizzato) per un'inquadratura di default sensata invece di una
  // camera a distanza zero.
  const fovRad = THREE.MathUtils.degToRad(camera.fov);
  const pivotTarget = (pivotMode === 'gc') ? new THREE.Vector3(0, 0, 0) : EARTH_POS.clone();

  let framingPoints = allPoints;
  if (allPoints.length === 1 && pivotTarget.distanceTo(EARTH_POS) < 1) {
    framingPoints = [EARTH_POS, EARTH_POS.clone().add(new THREE.Vector3(FALLBACK_VIEW_LY, 0, FALLBACK_VIEW_LY * 0.3))];
  }

  const { fitDistance, theta, phi } = computeFraming(framingPoints, pivotTarget, fovRad);

  controls.target.copy(pivotTarget);
  controls.radius = fitDistance;
  controls.minRadius = fitDistance * 0.02;
  controls.maxRadius = fitDistance * 80;
  controls.theta = theta;
  controls.phi = phi;
  camera.near = fitDistance * 0.0005;
  camera.far = fitDistance * 500;
  camera.updateProjectionMatrix();
  controls.update();

  applyGridScaleTo(galacticGrid, maxDist > 0 ? maxDist : DEFAULT_GRID_DISTANCE_LY, gridScaleFactor);

  renderInfoPanel(document.getElementById('infoContent'), entries);
}

/* =============================================================================
   APPLICA / RESET
   ============================================================================= */
function applySelection() {
  gridScaleFactor = 1;
  gridScaleSelect.value = '1';
  const checked = objectItems.filter(item => item.checkboxEl.checked).map(item => item.entry);
  setDisplayedEntries(checked);
}

function resetSelection() {
  uncheckAllObjectItems(objectItems);
  gridScaleFactor = 1;
  gridScaleSelect.value = '1';
  setDisplayedEntries([]);
}

document.getElementById('applyBtn').addEventListener('click', applySelection);
document.getElementById('resetBtn').addEventListener('click', resetSelection);

const objectFilterEl = document.getElementById('objectFilter');
objectFilterEl.addEventListener('input', () => filterObjectList(objectItems, objectFilterEl.value));

/* =============================================================================
   PERNO E SCALA GRIGLIA

   Cambiare il perno o la scala NON tocca l'insieme di oggetti visualizzati
   (currentEntries) — richiama solo il ricalcolo di inquadratura/griglia.
   A differenza della versione a un solo oggetto, qui non serve più
   salvare/ripristinare gridScaleFactor attorno al cambio di perno: quel
   valore non viene più azzerato da setDisplayedEntries (lo azzerano solo
   Applica e Reset, esplicitamente), quindi cambiare perno lo lascia
   semplicemente invariato.
   ============================================================================= */
const pivotSelect = document.getElementById('pivotSelect');
pivotSelect.addEventListener('change', () => {
  pivotMode = pivotSelect.value;
  setDisplayedEntries(currentEntries);
});

const gridScaleSelect = document.getElementById('gridScaleSelect');
gridScaleSelect.addEventListener('change', () => {
  gridScaleFactor = parseFloat(gridScaleSelect.value);
  const maxDist = getMaxDisplayedDistance(currentEntries);
  applyGridScaleTo(galacticGrid, maxDist > 0 ? maxDist : DEFAULT_GRID_DISTANCE_LY, gridScaleFactor);
});

/* =============================================================================
   PANNELLO INFO COLLASSABILE + RESIZE + DISCLAIMER
   ============================================================================= */
setupCollapsiblePanel(document.getElementById('info'), document.getElementById('infoToggle'));
// avviato COLLASSATO: la lista di 205 oggetti + filtro + pulsanti + due
// select occupa molto spazio — su mobile, se partisse espanso, coprirebbe
// gran parte del canvas e renderebbe difficile ruotare/zoomare finché non
// lo si chiude a mano. L'utente lo apre quando vuole scegliere gli oggetti.
setupCollapsiblePanel(document.getElementById('topbar'), document.getElementById('topbarToggle'), true);
setupResizeHandler(camera, renderer, container);
renderDisclaimer(document.getElementById('disclaimer'), GM_VER);

/* =============================================================================
   RENDER LOOP
   ============================================================================= */
function animate() {
  requestAnimationFrame(animate);
  camera.updateMatrixWorld();
  clampMarkerToMaxPixels(earthMarker, camera, container.clientHeight, MAX_MARKER_PIXELS);
  for (const marker of displayedMarkers.values()) {
    clampMarkerToMaxPixels(marker, camera, container.clientHeight, MAX_MARKER_PIXELS);
    projectLabelToScreen(marker.labelEl, marker.mesh.position, camera, container);
  }
  updateArmLabels();
  updateGridLabels(gridLabelEls, galacticGrid, EARTH_POS, camera, container);
  renderer.render(scene, camera);
}
animate();

/* =============================================================================
   BOOTSTRAP DA QUERYSTRING — sovrascrive il comportamento a checkbox: se
   presente, deseleziona tutto e mostra SOLO l'oggetto indicato. In ordine
   di priorità:
   1) ?ra=&dec=&dist=&name=   oggetto personalizzato, non fa parte del catalogo
   2) ?id=<id catalogo>       es. ?id=M42 (case-insensitive)
   3) ?pos=<indice numerico>  es. ?pos=3
   Se NESSUNA di queste è presente: nessuna sovrascrittura, si parte con la
   lista a checkbox vuota (solo la Terra visibile) — l'utente sceglie con la
   nuova interfaccia, non c'è più un oggetto caricato di default.
   ============================================================================= */
const urlParams = new URLSearchParams(window.location.search);
const parsedCustom = parseCustomObjectFromQuery(urlParams);

if (parsedCustom) {
  uncheckAllObjectItems(objectItems);
  setDisplayedEntries([parsedCustom]);
} else if (urlParams.has('id') || urlParams.has('pos')) {
  const startIndex = resolveStartIndex(CATALOG, urlParams);
  uncheckAllObjectItems(objectItems);
  setDisplayedEntries([CATALOG[startIndex]]);
} else {
  setDisplayedEntries([]);
}
