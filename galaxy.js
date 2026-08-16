/* =============================================================================
   galaxy.js — struttura procedurale della galassia (bracci di spirale, barra)

   Verso di avvolgimento dei bracci: VERIFICATO (non solo assunto) — antiorario
   visto dal polo nord galattico. Coerente con più fonti dirette (NASA/Chandra:
   "corkscrewing counterclockwise"; Scientific American sul braccio
   Scutum-Centaurus; astronoo.com) e con una deduzione fisica indipendente:
   rotazione della Galassia in senso orario vista da nord (arXiv:2501.04075,
   esplicito) + bracci a trascinamento/"trailing" (arXiv:0910.0757, esplicito
   per la Via Lattea) + rotazione differenziale (raggio interno più veloce di
   quello esterno) implicano matematicamente proprio un phi crescente col
   raggio. Cautela residua: alcune fonti secondarie di qualità inferiore danno
   il verso di ROTAZIONE (non della spirale) come antiorario invece che
   orario — le fonti dirette sul verso della spirale restano comunque
   concordi tra loro indipendentemente da questo dettaglio.
   ============================================================================= */
import * as THREE from "https://cdnjs.cloudflare.com/ajax/libs/three.js/0.185.1/three.module.min.js";
import { LY_PER_KPC, raDecDistToCartesian, galacticDirToSceneDir, galacticPointToScenePosition } from './coords.js';

/* Nomi dei bracci, assegnati ai 4 bracci generati in ordine sequenziale a 90°
   l'uno dall'altro. Questo ordine (Norma -> Scutum-Centaurus -> Sagittario ->
   Perseo, ciascuno offset di 90°) non è arbitrario: riproduce la "condizione
   di similarità" usata in un modello pubblicato a 4 bracci simmetrici
   (Vallée 2017, "A guided map to the spiral arms in the galactic disk of the
   Milky Way", Astron. Rev. — the model explicitly offsets each arm by 90° in
   sequenza rispetto al Braccio di Norma).
   ATTENZIONE — cosa NON è verificato: la calibrazione assoluta di quale
   direzione del cielo corrisponda a "Norma" qui è approssimata (allineata
   grossolanamente alla tangente nota del Braccio di Norma, longitudine
   galattica ≈ -33°/327°, da Vallée 2017 e Melnik & Rautiainen 2011), ma dato
   che nella realtà i quattro bracci NON sono equidistanti in longitudine
   osservata (le tangenti reali sono a circa 49° Sagittario, 31° Scutum,
   -22,5° Perseo, -33° Norma — non spaziate di 90°), gli altri tre bracci di
   questo modello semplificato non cadranno esattamente sulle rispettive
   tangenti reali. L'ordine e il nome sono quindi corretti concettualmente,
   la direzione precisa nel cielo è approssimata.

   Calibrazione EFFETTIVAMENTE calcolata (non solo dichiarata a parole): ho
   risolto numericamente l'offset che porta il punto del Braccio di Norma a
   longitudine galattica ≈ -33° (nel punto in cui r=8 kpc, come proxy
   grossolano del punto di tangenza). Con questo unico punto calibrato, gli
   altri tre bracci del modello a spaziatura fissa di 90° cadono a:
   Scutum-Centaurus ≈ +12° (reale ≈ +31°, scarto ~19°), Sagittario ≈ +57°
   (reale ≈ +49°, scarto ~8°), Perseo ≈ -78° (reale ≈ -22,5°, scarto ~55°).
   Lo scarto su Perseo è quindi rilevante: la sua etichetta nel widget NON è
   vicina alla direzione reale del Braccio di Perseo nel cielo — limite
   intrinseco del modello a 4 bracci equidistanti, resta segnalato perché è
   l'unico punto dove lo scarto è abbastanza ampio da poter fuorviare se
   letto come dato invece che come schema. */
const ARM_NAMES = ["Norma", "Scutum-Centaurus", "Sagittario", "Perseo"];
const NORMA_CALIBRATION_OFFSET_DEG = 29.61; // calcolato per scansione numerica, non un valore scelto a occhio

function generateSpiralArms() {
  const numArms = 4;
  const pitch = THREE.MathUtils.degToRad(12);
  const pointsPerArm = 900;
  const rStartKpc = 3, rEndKpc = 13;
  const thetaSpan = Math.log(rEndKpc / rStartKpc) / Math.tan(pitch);
  const baseOffset = THREE.MathUtils.degToRad(NORMA_CALIBRATION_OFFSET_DEG);

  const positions = [];
  const arms = [];
  for (let arm = 0; arm < numArms; arm++) {
    const armOffset = baseOffset + (arm / numArms) * Math.PI * 2;
    let midPoint = null;
    for (let i = 0; i < pointsPerArm; i++) {
      const t = i / pointsPerArm;
      const theta = t * thetaSpan;
      const rKpc = rStartKpc * Math.exp(theta * Math.tan(pitch));

      // scatter per dare "spessore" visivo al braccio — non è un dato osservativo
      const angleScatter = (Math.random() - 0.5) * 0.25;
      const radiusScatter = 1 + (Math.random() - 0.5) * 0.15;
      const phi = theta + armOffset + angleScatter;
      const r = rKpc * radiusScatter * LY_PER_KPC;

      const Xc = r * Math.cos(phi);
      const Yc = r * Math.sin(phi);
      const scaleHeight = r * 0.02; // spessore del disco, scelta illustrativa
      const Zc = (Math.random() - 0.5) * scaleHeight * 2;

      // coordinate galattocentriche, ruotate (l'origine della scena E' il
      // Centro Galattico, quindi nessuna traslazione, solo rotazione)
      const { pos } = galacticPointToScenePosition(Xc, Yc, Zc);
      positions.push(pos.x, pos.y, pos.z);

      // punto di ancoraggio per l'etichetta: centro geometrico del braccio
      // (senza scatter), a metà del suo sviluppo
      if (i === Math.floor(pointsPerArm * 0.5)) {
        const rMidKpc = rStartKpc * Math.exp(theta * Math.tan(pitch));
        const phiMid = theta + armOffset;
        const rMid = rMidKpc * LY_PER_KPC;
        const { pos: midPos } = galacticPointToScenePosition(
          rMid * Math.cos(phiMid), rMid * Math.sin(phiMid), 0);
        midPoint = midPos;
      }
    }
    arms.push({ name: ARM_NAMES[arm], position: midPoint });
  }
  return { positions: new Float32Array(positions), arms };
}

function addSpiralBackground(scene, positions) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0x5b7fb5, size: 2, sizeAttenuation: false, transparent: true, opacity: 0.75 });
  const points = new THREE.Points(geo, mat);
  points.renderOrder = -1;
  scene.add(points);
}

/* =============================================================================
   BARRA CENTRALE (spirale barrata)

   La Via Lattea è considerata una spirale barrata: una struttura allungata di
   stelle al centro, non un bulge sferico. Ellissoide allungato, orientato
   secondo l'angolo di inclinazione della barra rispetto alla linea
   Sole-Centro Galattico.

   Dati verificati (più fonti indipendenti concordano):
   - Angolo della barra rispetto alla linea Sole-Centro: ~20-30°, con stime
     più recenti e precise intorno a 27° (Wegg & Gerhard 2013: 27°±2°; un
     articolo del 2026 in ADS conferma 27,4°±1,5° per la componente "long
     bar"). Uso 27°.
   - Verso: l'estremo vicino della barra punta verso longitudini galattiche
     POSITIVE (Gonzalez & Gadotti; Li et al. 2022, IOPscience). Verificato
     NUMERICAMENTE (script separato) quale segno di rotazione nel sistema di
     coordinate riproduce questo verso, non assunto.
   - Semiasse maggiore: ~5 kpc (Wegg et al. 2015 per la "long bar"; la barra
     reale ha probabilmente due componenti sovrapposte, qui ne uso una sola
     come semplificazione).
   - Rapporto tra gli assi: 1 : 0,4 : 0,3 (Gonzalez & Gadotti review).

   Cosa NON è verificato: la barra reale ha probabilmente una forma "a
   arachide/scatola" vista di taglio, non un ellissoide liscio — qui è
   un'approssimazione grossolana della forma, non della sola
   orientazione/dimensione (quelle sono citate sopra).
   ============================================================================= */
function addBar(scene) {
  const barAngle = THREE.MathUtils.degToRad(27);

  // Il Centro Galattico è l'origine della scena: la barra resta centrata a
  // (0,0,0), non serve calcolare la sua posizione.
  const ngpDir = raDecDistToCartesian(192.85948, 27.12825, 1).normalize();

  const barLongDirGalactic = [Math.cos(barAngle), -Math.sin(barAngle), 0];
  const barLongDirScene = galacticDirToSceneDir(...barLongDirGalactic).normalize();
  const barShortDirScene = new THREE.Vector3().crossVectors(ngpDir, barLongDirScene).normalize();

  const basis = new THREE.Matrix4().makeBasis(barLongDirScene, barShortDirScene, ngpDir);
  const barQuaternion = new THREE.Quaternion().setFromRotationMatrix(basis);

  const semiLong = 5.0 * LY_PER_KPC;
  const semiInPlane = semiLong * 0.4;
  const semiVertical = semiLong * 0.3;

  const geo = new THREE.SphereGeometry(1, 32, 24);

  const barMat = new THREE.MeshBasicMaterial({ color: 0xffcf8a, transparent: true, opacity: 0.28 });
  const bar = new THREE.Mesh(geo, barMat);
  bar.scale.set(semiLong, semiInPlane, semiVertical);
  bar.quaternion.copy(barQuaternion);
  scene.add(bar);

  const nucleusMat = new THREE.MeshBasicMaterial({ color: 0xffe6b3, transparent: true, opacity: 0.55 });
  const nucleus = new THREE.Mesh(geo, nucleusMat);
  const nucleusSize = semiLong * 0.12;
  nucleus.scale.setScalar(nucleusSize);
  scene.add(nucleus);

  // nube di punti entro il volume della barra, per un aspetto granulare
  // invece di un blob liscio — densità maggiore verso il centro
  const count = 1600;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    let u, v, w, r2;
    do {
      u = (Math.random() * 2 - 1);
      v = (Math.random() * 2 - 1);
      w = (Math.random() * 2 - 1);
      r2 = u*u + v*v + w*w;
    } while (r2 > 1);
    const bias = Math.pow(Math.random(), 0.6); // 0..1, concentra punti verso il centro
    const local = new THREE.Vector3(u, v, w).normalize().multiplyScalar(bias);
    local.set(local.x * semiLong, local.y * semiInPlane, local.z * semiVertical);
    local.applyQuaternion(barQuaternion);
    positions[i*3] = local.x; positions[i*3+1] = local.y; positions[i*3+2] = local.z;
  }
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const pmat = new THREE.PointsMaterial({ color: 0xffdca8, size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0.8 });
  scene.add(new THREE.Points(pgeo, pmat));
}

/** Costruisce l'intera struttura procedurale (bracci + barra) e la aggiunge
    alla scena. Restituisce i dati dei bracci (nome + posizione), usati per
    le etichette. */
export function buildGalaxy(scene) {
  const { positions, arms } = generateSpiralArms();
  addSpiralBackground(scene, positions);
  addBar(scene);
  return { arms };
}
