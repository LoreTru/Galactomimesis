/*
	GALACTOMIMESIS V. 0.3
	Source and license at: https://github.com/LoreTru/Galactomimesis
*/
import * as THREE from "https://cdnjs.cloudflare.com/ajax/libs/three.js/0.185.1/three.module.min.js";

import { raDecDistToCartesian, computeEarthPos } from './coords.js';
import { loadCatalog, parseCustomObjectFromQuery, resolveStartIndex } from './catalog.js';
import { buildGalaxy } from './galaxy.js';
import { buildGalacticGrid, applyGridScale as applyGridScaleTo, updateGridLabels } from './grid.js';
import { createOrbitControls } from './controls.js';
import { createEarthMarker, createObjectMarker, updateObjectMarker, updateMarkerLine, computeFraming } from './markers.js';
import { populateObjectSelect, showCustomOption, updateInfoPanel as renderInfoPanel, setupInfoPanelCollapse, setupResizeHandler } from './ui.js';
import { projectLabelToScreen } from './label-utils.js';

/* =============================================================================
   CATALOGO
   Caricato da file esterno (catalog.json). Top-level await: essendo un
   modulo ES, l'esecuzione si sospende qui finché il fetch non è completo.
   IMPORTANTE: estendere catalog.json solo con dati verificati — un valore
   sbagliato lì produce una posizione 3D sbagliata, silenziosamente.
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
// Il sistema di coordinate sferiche dei controlli orbit usa l'asse Z come
// polo (phi misurato da Z). Il vettore "up" di default di Three.js è invece
// l'asse Y: senza questa riga, camera.lookAt() userebbe Y come riferimento
// verticale, disallineato rispetto al polo reale della rotazione — è
// esattamente questo disallineamento a causare l'effetto di assi di
// trascinamento apparentemente scambiati.
camera.up.set(0, 0, 1);

/* =============================================================================
   STRUTTURA GALATTICA (bracci + barra) e POSIZIONE DELLA TERRA

   L'origine della scena (0,0,0) è il Centro Galattico, non la Terra. Vedi
   coords.js per il dettaglio della trasformazione e il riepilogo di
   progetto per la storia di questa scelta.
   ============================================================================= */
const { arms } = buildGalaxy(scene);
const EARTH_POS = computeEarthPos();

/* =============================================================================
   ETICHETTE DEI BRACCI (overlay DOM, proiezione manuale — vedi label-utils.js)
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
   GRIGLIA DI COORDINATE GALATTICHE (centrata sulla Terra, non sul perno)
   ============================================================================= */
const { galacticGrid, gridLabelEls } = buildGalacticGrid(scene, EARTH_POS, armLabelsContainer);

/* =============================================================================
   MARCATORI Terra/oggetto e linea Terra-oggetto
   ============================================================================= */
const earthMarker = createEarthMarker(scene, EARTH_POS);
const targetMarker = createObjectMarker(scene); // rosso intenso di default
const lineMat = new THREE.LineBasicMaterial({ color: 0x556077 });

/* =============================================================================
   CONTROLLI ORBIT
   ============================================================================= */
const controls = createOrbitControls(camera, renderer.domElement);

/* =============================================================================
   STATO APPLICATIVO
   ============================================================================= */
let currentEntry = null;
let gridScaleFactor = 1;
let pivotMode = 'earth'; // 'earth' oppure 'gc'
let customEntry = null;  // oggetto personalizzato via querystring, se presente

function applyGridScale() {
  if (!currentEntry) return;
  applyGridScaleTo(galacticGrid, currentEntry.distance_ly, gridScaleFactor);
}

/* =============================================================================
   CARICAMENTO DI UN OGGETTO NELLA SCENA

   Il perno di rotazione (controls.target) può essere la Terra o il Centro
   Galattico (menu #pivotSelect) — vedi computeFraming() in markers.js per la
   formula generalizzata che copre entrambi i casi con un'unica logica.
   ============================================================================= */
function loadObject(entry) {
  currentEntry = entry;
  // cambiando oggetto, il fattore di scala della griglia torna a 1×
  gridScaleFactor = 1;
  const gridScaleSelectEl = document.getElementById('gridScaleSelect');
  if (gridScaleSelectEl) gridScaleSelectEl.value = '1';

  // vettore Terra->oggetto (dipende solo da RA/Dec/distanza, non
  // dall'origine della scena), poi sommato a EARTH_POS per la posizione
  // assoluta nel sistema centrato sul Centro Galattico
  const posFromEarth = raDecDistToCartesian(entry.ra_deg, entry.dec_deg, entry.distance_ly);
  const pos = posFromEarth.clone().add(EARTH_POS);

  // dimensione marcatori scalata sulla distanza, SOLO per visibilità — non è
  // la dimensione fisica reale dell'oggetto né della Terra
  const markerScale = entry.distance_ly * 0.01;
  earthMarker.mesh.scale.setScalar(Math.max(markerScale, 0.001));
  updateObjectMarker(targetMarker, pos, markerScale);
  updateMarkerLine(scene, targetMarker, EARTH_POS, pos, lineMat);

  const fovRad = THREE.MathUtils.degToRad(camera.fov);
  const pivotTarget = (pivotMode === 'gc') ? new THREE.Vector3(0, 0, 0) : EARTH_POS.clone();
  const { fitDistance, theta, phi } = computeFraming([EARTH_POS, pos], pivotTarget, fovRad);

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

  // griglia galattica: raggio pari alla distanza dell'oggetto selezionato,
  // moltiplicata per il fattore scelto nel menu dedicato (default 1×) —
  // resta ancorata alla Terra, non al perno
  applyGridScale();

  const infoContentEl = document.getElementById('infoContent');
  renderInfoPanel(infoContentEl, entry);
}

/* =============================================================================
   UI: selettore catalogo, perno, scala griglia
   ============================================================================= */
const select = document.getElementById('objectSelect');
populateObjectSelect(select, CATALOG);

select.addEventListener('change', () => {
  if (select.value === 'custom' && customEntry) {
    loadObject(customEntry);
  } else {
    loadObject(CATALOG[select.value]);
  }
});

const pivotSelect = document.getElementById('pivotSelect');
pivotSelect.addEventListener('change', () => {
  pivotMode = pivotSelect.value;
  if (currentEntry) {
    // loadObject resetta anche il fattore di scala della griglia (pensato
    // per il cambio oggetto, non per il cambio perno) — lo salvo e lo
    // ripristino per evitare l'effetto collaterale
    const savedGridScale = gridScaleFactor;
    loadObject(currentEntry);
    gridScaleFactor = savedGridScale;
    gridScaleSelect.value = String(savedGridScale);
    applyGridScale();
  }
});

const gridScaleSelect = document.getElementById('gridScaleSelect');
gridScaleSelect.addEventListener('change', () => {
  gridScaleFactor = parseFloat(gridScaleSelect.value);
  applyGridScale();
});

/* =============================================================================
   PANNELLO INFO COLLASSABILE + RESIZE
   ============================================================================= */
setupInfoPanelCollapse(document.getElementById('info'), document.getElementById('infoToggle'));
setupResizeHandler(camera, renderer, container);

/* =============================================================================
   RENDER LOOP
   ============================================================================= */
function animate() {
  requestAnimationFrame(animate);
  camera.updateMatrixWorld();
  updateArmLabels();
  updateGridLabels(gridLabelEls, galacticGrid, EARTH_POS, camera, container);
  renderer.render(scene, camera);
}
animate();

/* =============================================================================
   BOOTSTRAP DA QUERYSTRING — tre modalità, in ordine di priorità:
   1) ?ra=&dec=&dist=&name=   oggetto personalizzato, non fa parte del catalogo
   2) ?id=<id catalogo>       es. ?id=M42 (case-insensitive)
   3) ?pos=<indice numerico>  es. ?pos=3
   Se nessuna delle tre si applica: primo oggetto del catalogo.
   ============================================================================= */
const urlParams = new URLSearchParams(window.location.search);
const parsedCustom = parseCustomObjectFromQuery(urlParams);

if (parsedCustom) {
  customEntry = parsedCustom;
  showCustomOption(select, parsedCustom.name);
  loadObject(customEntry);
} else {
  const startIndex = resolveStartIndex(CATALOG, urlParams);
  select.value = startIndex;
  loadObject(CATALOG[startIndex]);
}
