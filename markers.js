/* =============================================================================
   markers.js — marcatori 3D e inquadratura camera

   Pensato per l'evolutiva multi-oggetto discussa ma non ancora implementata:
   - createObjectMarker() è una fabbrica, non una variabile globale fissa:
     oggi se ne crea una sola (l'oggetto selezionato), ma nulla nella
     funzione impedisce di chiamarla più volte per mostrare più oggetti.
   - computeFraming() accetta un ARRAY di punti, non due punti fissi
     (Terra+oggetto): con 2 punti si comporta esattamente come prima (il
     raggio della sfera-limite è il massimo delle due distanze dal perno,
     il punto medio è la media dei due punti — la stessa matematica di
     prima, solo generalizzata), ma è pronta a ricevere N punti se in futuro
     si mostrano più oggetti contemporaneamente.

   Quello che MANCA ancora per il multi-oggetto vero (non fatto qui, è
   lavoro a parte): un registro che tenga traccia di quali marcatori sono
   attivi (creare/distruggere in modo ordinato), colori distinti per
   oggetto, e una UI a selezione multipla — questo modulo fornisce i mattoni,
   non li assembla da solo.
   ============================================================================= */
import * as THREE from "https://cdnjs.cloudflare.com/ajax/libs/three.js/0.185.1/three.module.min.js";

/* Doppio livello per ciascun marcatore: una mesh 3D (cresce avvicinandosi)
   più un punto a dimensione fissa in pixel (sizeAttenuation:false,
   depthTest:false, renderOrder alto) — perché la sola mesh scende sotto il
   pixel e sparisce zoomando indietro. */
function createMarkerPair(scene, color) {
  const geo = new THREE.SphereGeometry(1, 24, 24);
  const mat = new THREE.MeshBasicMaterial({ color });
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);

  const dotMat = new THREE.PointsMaterial({ color, size: 7, sizeAttenuation: false, depthTest: false });
  const dotGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0)]);
  const dot = new THREE.Points(dotGeo, dotMat);
  dot.renderOrder = 999;
  scene.add(dot);

  return { mesh, dot };
}

/** Marcatore Terra — azzurro intenso, posizione fissa (EARTH_POS). */
export function createEarthMarker(scene, earthPos) {
  const marker = createMarkerPair(scene, 0x1ec8ff);
  marker.mesh.position.copy(earthPos);
  marker.dot.geometry.setFromPoints([earthPos]);
  return marker;
}

/** Marcatore di un oggetto (rosso intenso di default). Fabbrica riusabile:
    oggi ne viene creata una sola istanza (l'oggetto selezionato), ma può
    essere chiamata più volte per marcatori aggiuntivi. */
export function createObjectMarker(scene, color = 0xff2b2b) {
  const marker = createMarkerPair(scene, color);
  marker.line = null;
  return marker;
}

/** Aggiorna posizione e dimensione "naturale" (dipendente dalla distanza,
    solo per visibilità — non è la dimensione fisica reale) di un marcatore
    oggetto. La dimensione naturale è solo una base: viene poi limitata a un
    massimo in pixel a ogni frame da clampMarkerToMaxPixels(), altrimenti
    zoomando molto vicino la mesh crescerebbe senza limite riempiendo lo
    schermo. */
export function updateObjectMarker(marker, position, markerScale) {
  marker.mesh.position.copy(position);
  marker.baseScale = markerScale;
  marker.mesh.scale.setScalar(Math.max(markerScale, 0.001));
  marker.dot.geometry.setFromPoints([position]);
}

/* =============================================================================
   TETTO MASSIMO IN PIXEL PER LA MESH DEI MARCATORI

   La mesh (a differenza del "dot" a dimensione fissa, che serve solo a non
   sparire) cresce avvicinandosi, in base a baseScale — utile per un effetto
   di avvicinamento, ma senza un limite diventerebbe enorme quando la camera
   è molto vicina (controls.minRadius). Questa funzione ricalcola, a ogni
   frame, la scala massima in unità di mondo che corrisponde a maxPixels di
   diametro sullo schermo alla distanza ATTUALE della camera, e usa la più
   piccola tra quella e baseScale — quindi la mesh non supera mai maxPixels,
   ma può restare più piccola quando la distanza naturale lo prevede già.

   Formula: un oggetto di raggio r a distanza d dalla camera sottende un
   diametro in pixel pari a r * H / (d * tan(fov/2)), con H altezza del
   viewport in pixel — proiezione prospettica standard, non
   un'approssimazione grossolana. */
export function clampMarkerToMaxPixels(marker, camera, viewportHeightPx, maxPixels) {
  if (marker.baseScale === undefined) return;
  const fovRad = THREE.MathUtils.degToRad(camera.fov);
  const dist = camera.position.distanceTo(marker.mesh.position);
  const maxWorldRadius = (maxPixels * dist * Math.tan(fovRad / 2)) / viewportHeightPx;
  const cappedScale = Math.min(marker.baseScale, maxWorldRadius);
  marker.mesh.scale.setScalar(Math.max(cappedScale, 0.001));
}

/** Linea tra due punti, associata a un marcatore (rimuove quella precedente
    se presente — utile quando la posizione dell'oggetto cambia). */
export function updateMarkerLine(scene, marker, pointA, pointB, material) {
  if (marker.line) scene.remove(marker.line);
  const geo = new THREE.BufferGeometry().setFromPoints([pointA, pointB]);
  marker.line = new THREE.Line(geo, material);
  scene.add(marker.line);
}

export function removeObjectMarker(scene, marker) {
  scene.remove(marker.mesh);
  scene.remove(marker.dot);
  if (marker.line) scene.remove(marker.line);
}

/* =============================================================================
   INQUADRATURA AUTOMATICA — generalizzata a un numero qualsiasi di punti

   Una sfera immaginaria centrata sul perno, di raggio pari alla PIÙ GRANDE
   tra le distanze dal perno di tutti i punti forniti, contiene sempre tutti
   i punti. Una camera posizionata a distanza (raggio/sin(metà FOV)) da
   quella sfera, con margine, li vede sempre tutti — qualunque sia l'angolo
   di rotazione. Proprietà geometrica esatta, non un'approssimazione.

   Con esattamente 2 punti [EARTH_POS, posOggetto] si comporta in modo
   IDENTICO alla versione precedente (verificato: max di 2 distanze e media
   di 2 punti sono la stessa cosa scritta con Math.max/multiplyScalar(0.5)
   diretti, solo generalizzata). Pronta a ricevere più punti in futuro.
   ============================================================================= */
export function computeFraming(points, pivotTarget, fovRad) {
  const boundRadius = Math.max(...points.map(p => p.distanceTo(pivotTarget)));

  const sum = points.reduce((acc, p) => acc.add(p), new THREE.Vector3());
  const midPoint = sum.multiplyScalar(1 / points.length).sub(pivotTarget);
  const midDir = midPoint.lengthSq() > 1e-6 ? midPoint.normalize() : new THREE.Vector3(0, 0, 1);

  let refUp = new THREE.Vector3(0, 0, 1);
  if (Math.abs(midDir.dot(refUp)) > 0.98) refUp = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(midDir, refUp).normalize();
  const vert = new THREE.Vector3().crossVectors(midDir, side).normalize();
  const tiltRad = THREE.MathUtils.degToRad(25);
  const perpDir = new THREE.Vector3()
    .addScaledVector(side, Math.cos(tiltRad))
    .addScaledVector(vert, Math.sin(tiltRad))
    .normalize();

  const padding = 1.4;
  const fitDistance = (boundRadius * padding) / Math.sin(fovRad / 2);

  return {
    fitDistance,
    theta: Math.atan2(perpDir.y, perpDir.x),
    phi: Math.acos(perpDir.z)
  };
}