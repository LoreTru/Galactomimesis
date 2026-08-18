/* =============================================================================
   coords.js — conversioni di coordinate e costanti astrometriche

   Nessuna dipendenza da scena, camera o DOM: solo matematica. Pensato per
   restare stabile anche quando il resto dell'architettura cambia (es. verso
   il multi-oggetto) — le formule qui dentro non dipendono da quanti oggetti
   sono visualizzati contemporaneamente.
   ============================================================================= */
import * as THREE from "https://cdnjs.cloudflare.com/ajax/libs/three.js/0.185.1/three.module.min.js";

export const LY_PER_KPC = 3261.56;

// Distanza Sole-Centro Galattico: unificata con la voce "Sgr A*" del
// catalogo (GRAVITY/ESO, 8,178 kpc), non più gli 8,0 kpc tondi di una
// versione precedente.
export const R_SUN_LY = 26670.0;

// Costanti IAU per la trasformazione galattico -> equatoriale (Hipparcos
// Explanatory Supplement). Verificate in una sessione precedente contro due
// punti di controllo noti: il Centro Galattico (RA/Dec di Sagittarius A*) e
// il Polo Nord Galattico stesso.
const ALPHA_G = THREE.MathUtils.degToRad(192.85948);
const DELTA_G = THREE.MathUtils.degToRad(27.12825);
const L_NCP   = THREE.MathUtils.degToRad(122.93192);

/** Equatoriali (RA, Dec, distanza) -> Cartesiane, origine Terra/Sole. */
export function raDecDistToCartesian(raDeg, decDeg, distance) {
  const ra = THREE.MathUtils.degToRad(raDeg);
  const dec = THREE.MathUtils.degToRad(decDeg);
  return new THREE.Vector3(
    distance * Math.cos(dec) * Math.cos(ra),
    distance * Math.cos(dec) * Math.sin(ra),
    distance * Math.sin(dec)
  );
}

/** Galattiche (l, b in radianti) -> equatoriali {ra, dec} in gradi. */
export function galacticToEquatorial(lRad, bRad) {
  const sinDec = Math.sin(DELTA_G) * Math.sin(bRad) + Math.cos(DELTA_G) * Math.cos(bRad) * Math.cos(L_NCP - lRad);
  const dec = Math.asin(Math.max(-1, Math.min(1, sinDec)));
  const y = Math.cos(bRad) * Math.sin(L_NCP - lRad);
  const x = Math.sin(bRad) * Math.cos(DELTA_G) - Math.cos(bRad) * Math.sin(DELTA_G) * Math.cos(L_NCP - lRad);
  const ra = ALPHA_G + Math.atan2(y, x);
  return { ra: THREE.MathUtils.radToDeg(ra), dec: THREE.MathUtils.radToDeg(dec) };
}

/** Direzione (Xg,Yg,Zg) nel sistema galattico -> direzione unitaria nella scena. */
export function galacticDirToSceneDir(Xg, Yg, Zg) {
  const l = Math.atan2(Yg, Xg);
  const b = Math.asin(Zg / Math.sqrt(Xg * Xg + Yg * Yg + Zg * Zg));
  const eq = galacticToEquatorial(l, b);
  return raDecDistToCartesian(eq.ra, eq.dec, 1);
}

/** Punto (Xg,Yg,Zg) nel sistema galattico -> {pos, distance} nella scena. */
export function galacticPointToScenePosition(Xg, Yg, Zg) {
  const dist = Math.sqrt(Xg * Xg + Yg * Yg + Zg * Zg);
  const b = Math.asin(Zg / dist);
  const l = Math.atan2(Yg, Xg);
  const eq = galacticToEquatorial(l, b);
  return { pos: raDecDistToCartesian(eq.ra, eq.dec, dist), distance: dist };
}

/** Posizione della Terra nel sistema con origine sul Centro Galattico. */
export function computeEarthPos() {
  const gc = galacticToEquatorial(0, 0);
  return raDecDistToCartesian(gc.ra, gc.dec, R_SUN_LY).multiplyScalar(-1);
}
