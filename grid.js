/* =============================================================================
   grid.js — griglia di coordinate galattiche (centrata sulla Terra)

   Meridiani (longitudine costante, ogni 30°) e paralleli (latitudine
   costante, ogni 30°), più l'equatore galattico (b=0°) evidenziato — è la
   convenzione standard. Costruita come direzioni unitarie, poi scalata
   dinamicamente in base alla vista corrente (vedi applyGridScale) invece di
   avere un raggio fisso, per restare utile sia per oggetti vicini sia per
   oggetti lontanissimi.

   Ancorata a EARTH_POS, non all'origine della scena (che è il Centro
   Galattico): le coordinate galattiche sono per definizione centrate sul
   Sole/Terra — spostarle sul Centro Galattico le renderebbe fisicamente
   scorrette, non solo esteticamente diverse.
   ============================================================================= */
import * as THREE from "https://cdnjs.cloudflare.com/ajax/libs/three.js/0.185.1/three.module.min.js";
import { galacticToEquatorial, raDecDistToCartesian } from './coords.js';
import { projectLabelToScreen } from './label-utils.js';

function galacticGridPoint(lDeg, bDeg) {
  const l = THREE.MathUtils.degToRad(lDeg);
  const b = THREE.MathUtils.degToRad(bDeg);
  const eq = galacticToEquatorial(l, b);
  return raDecDistToCartesian(eq.ra, eq.dec, 1);
}

function buildGrid(scene, earthPos) {
  const galacticGrid = new THREE.Group();
  const gridMat = new THREE.LineBasicMaterial({ color: 0x3e6d3b, transparent: true, opacity: 0.35 });
  const equatorMat = new THREE.LineBasicMaterial({ color: 0x6fbf68, transparent: true, opacity: 0.6 });

  // meridiani: longitudine galattica costante, ogni 30°, da b=-90° a b=+90°
  for (let lDeg = 0; lDeg < 360; lDeg += 30) {
    const pts = [];
    for (let bDeg = -90; bDeg <= 90; bDeg += 5) pts.push(galacticGridPoint(lDeg, bDeg));
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    galacticGrid.add(new THREE.Line(geo, gridMat));
  }
  // paralleli: latitudine galattica costante, ogni 30° (poli esclusi, sono punti)
  for (let bDeg = -60; bDeg <= 60; bDeg += 30) {
    const pts = [];
    for (let lDeg = 0; lDeg <= 360; lDeg += 5) pts.push(galacticGridPoint(lDeg, bDeg));
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    galacticGrid.add(new THREE.LineLoop(geo, bDeg === 0 ? equatorMat : gridMat));
  }

  galacticGrid.position.copy(earthPos);
  scene.add(galacticGrid);
  return galacticGrid;
}

/* Longitudine 0°/90°/180°/270° sull'equatore galattico, più i due poli
   (b=+90°/-90°) e un'etichetta esplicita per l'equatore (b=0°) in un punto
   che non si sovrapponga alle etichette di longitudine. Le posizioni sono
   salvate come direzioni unitarie e moltiplicate per il raggio corrente
   della griglia a ogni frame — così restano ancorate ad essa anche quando
   il suo raggio cambia (cambio di oggetto selezionato). */
const GRID_LABEL_DEFS = [
  { l: 0,   b: 0,   text: 'l=0°'   },
  { l: 90,  b: 0,   text: 'l=90°'  },
  { l: 180, b: 0,   text: 'l=180°' },
  { l: 270, b: 0,   text: 'l=270°' },
  { l: 45,  b: 0,   text: 'b=0°'   },
  { l: 0,   b: 90,  text: 'b=+90° (N)' },
  { l: 0,   b: -90, text: 'b=−90° (S)' }
];

function buildGridLabels(labelsContainerEl) {
  return GRID_LABEL_DEFS.map(def => {
    const el = document.createElement('div');
    el.className = 'gridLabel';
    el.textContent = def.text;
    labelsContainerEl.appendChild(el);
    return { el, unitDir: galacticGridPoint(def.l, def.b) };
  });
}

/** Costruisce griglia + etichette e le aggiunge alla scena/DOM. Restituisce
    tutto ciò che serve per aggiornarla poi (applyGridScale, updateGridLabels). */
export function buildGalacticGrid(scene, earthPos, labelsContainerEl) {
  const galacticGrid = buildGrid(scene, earthPos);
  const gridLabelEls = buildGridLabels(labelsContainerEl);
  return { galacticGrid, gridLabelEls };
}

/** Raggio = distanza dell'oggetto selezionato x fattore scelto dal menu. */
export function applyGridScale(galacticGrid, distanceLy, factor) {
  galacticGrid.scale.setScalar(distanceLy * factor);
}

export function updateGridLabels(gridLabelEls, galacticGrid, earthPos, camera, container) {
  const radius = galacticGrid.scale.x;
  gridLabelEls.forEach(({ el, unitDir }) => {
    const position = unitDir.clone().multiplyScalar(radius).add(earthPos);
    projectLabelToScreen(el, position, camera, container);
  });
}
