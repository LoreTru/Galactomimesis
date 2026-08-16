/* =============================================================================
   label-utils.js — proiezione di un'etichetta DOM da una posizione 3D

   Overlay DOM con proiezione manuale (non CSS2DRenderer, addon non incluso
   nel build core caricato da CDN). Usato sia dalle etichette dei bracci sia
   da quelle della griglia, per non duplicare la stessa logica due volte.
   ============================================================================= */

/** Aggiorna la posizione a schermo di un'etichetta DOM data una posizione 3D
    nel mondo. Nasconde l'etichetta se il punto è dietro la camera o troppo
    fuori dal campo visivo. Il chiamante deve aver già invocato
    camera.updateMatrixWorld() nel frame corrente. */
export function projectLabelToScreen(el, worldPosition, camera, container) {
  const w = container.clientWidth, h = container.clientHeight;
  const viewSpace = worldPosition.clone().applyMatrix4(camera.matrixWorldInverse);
  if (viewSpace.z > 0) { el.style.display = 'none'; return; } // dietro la camera
  const ndc = worldPosition.clone().project(camera);
  if (ndc.x < -1.2 || ndc.x > 1.2 || ndc.y < -1.2 || ndc.y > 1.2) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.style.left = ((ndc.x + 1) / 2 * w) + 'px';
  el.style.top = ((1 - ndc.y) / 2 * h) + 'px';
}
