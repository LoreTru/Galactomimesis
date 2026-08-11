
import * as THREE from "https://cdnjs.cloudflare.com/ajax/libs/three.js/0.185.1/three.module.min.js";

/* =============================================================================
   CATALOGO OGGETTI
   Ogni voce: id, name, type, ra_deg, dec_deg (equatoriali J2000, in gradi
   decimali), distance_ly, distance_unc_ly (null se non nota/non riportata),
   source (citazione testuale della fonte).

   IMPORTANTE: aggiungere nuove voci solo con dati verificati (SIMBAD, VizieR,
   Wikipedia con infobox, letteratura primaria). Non inventare coordinate o
   distanze per riempire il catalogo — un valore sbagliato qui produce una
   posizione 3D sbagliata, silenziosamente.
   ============================================================================= */
/* Catalogo caricato da file esterno (catalog.json) invece di essere
   incorporato nel codice. Uso top-level await: essendo un modulo ES,
   l'esecuzione del resto dello script si sospende qui finché il fetch
   non è completo, poi prosegue normalmente dall'alto in basso — nessun
   cambiamento necessario al resto della logica che segue. */
const CATALOG = await fetch('./catalog.json').then(r => {
  if (!r.ok) throw new Error('catalog.json non trovato o non raggiungibile (' + r.status + ')');
  return r.json();
});

/* =============================================================================
   CONVERSIONE COORDINATE
   Equatoriali (RA, Dec, distanza) -> Cartesiane, origine = Terra/Sole,
   asse X verso (RA=0, Dec=0), asse Z verso il polo nord celeste.
   Formula standard, non è un dato da verificare (è definizione geometrica).
   ============================================================================= */
function raDecDistToCartesian(raDeg, decDeg, distance) {
  const ra = THREE.MathUtils.degToRad(raDeg);
  const dec = THREE.MathUtils.degToRad(decDeg);
  return new THREE.Vector3(
    distance * Math.cos(dec) * Math.cos(ra),
    distance * Math.cos(dec) * Math.sin(ra),
    distance * Math.sin(dec)
  );
}

/* =============================================================================
   SETUP SCENA
   ============================================================================= */
const container = document.getElementById('container');
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.insertBefore(renderer.domElement, container.firstChild);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.001, 1e9);
// Il sistema di coordinate sferiche dei controlli orbit (sotto) usa l'asse Z
// come polo (phi misurato da Z). Il vettore "up" di default di Three.js è
// invece l'asse Y: senza questa riga, camera.lookAt() userebbe Y come
// riferimento verticale, disallineato rispetto al polo reale della
// rotazione — è esattamente questo disallineamento a causare l'effetto di
// assi di trascinamento apparentemente scambiati.
camera.up.set(0, 0, 1);

/* =============================================================================
   SFONDO GALATTICO — STRUTTURA A BRACCI DI SPIRALE (schematica)

   Questo NON è un catalogo di stelle reali con posizioni individuali verificate:
   è una distribuzione procedurale che segue la forma generale nota della Via
   Lattea, così che lo sfondo sia un disco a spirale e non una sfera uniforme.

   Parametri e cosa è verificato / cosa è scelta illustrativa:

   - Numero di bracci: 4. La maggioranza delle pubblicazioni favorisce un
     modello a 4 bracci maggiori (Scutum-Centaurus, Sagittario, Perseo, Norma),
     ma circa un sesto degli studi propende per un modello a 2 bracci — la
     struttura esatta è tuttora oggetto di dibattito in letteratura
     (Vallée 2014b/2017; Hou & Han 2014, arXiv:1810.08819).
   - Angolo di pitch: 12°, valore medio citato in più studi (Vallée), con
     variazioni da studio a studio.
   - Distanza Sole-Centro Galattico: 8,0 kpc (~26.100 al). Valore comunemente
     usato in letteratura; il range osservato è circa 7,5-8,5 kpc a seconda
     dello studio.
   - Posizione del Sole: in una regione interbraccio (il cosiddetto Braccio
     Locale/di Orione), tra il Braccio di Perseo e quello del Sagittario —
     dato riportato in più fonti (es. arXiv:1409.4801, arXiv:1810.12995).
   - Raggio interno/esterno dei bracci (3-13 kpc) e spessore verticale del
     disco: scelte illustrative per ottenere un aspetto visivamente plausibile,
     NON misure verificate puntualmente in questa sessione.
   - Verso di avvolgimento della spirale (chirale, orario/antiorario visto dal
     polo nord galattico): VERIFICATO in una sessione successiva, non più solo
     una scelta di implementazione. Il codice genera bracci con phi crescente
     insieme al raggio, cioè una spirale che si apre in senso antiorario
     vista dal polo nord galattico (asse Z della scena). Questo risulta
     coerente con più fonti dirette: NASA/Chandra descrive i bracci della Via
     Lattea come "corkscrewing counterclockwise"; Scientific American
     descrive il braccio Scutum-Centaurus come "winds outward in a
     counterclockwise direction"; astronoo.com mostra esplicitamente la Via
     Lattea vista da nord con questo verso. È anche coerente con una
     deduzione fisica indipendente (non solo osservativa): rotazione della
     Galassia in senso orario vista da nord (arXiv:2501.04075, esplicito) +
     bracci a trascinamento/"trailing" (arXiv:0910.0757, esplicito per la Via
     Lattea) + rotazione differenziale (radio interno più veloce di quello
     esterno) implicano matematicamente proprio un phi crescente col raggio.
     Cautela residua: alcune fonti secondarie di qualità inferiore danno il
     verso di ROTAZIONE (non della spirale) come antiorario invece che
     orario — le fonti dirette sul verso della spirale restano comunque
     concordi tra loro indipendentemente da questo dettaglio.

   La trasformazione da coordinate galattiche a equatoriali usa le costanti
   IAU standard (Hipparcos Explanatory Supplement), verificate in questa
   sessione: RA polo galattico nord = 192.85948°, Dec = 27.12825°,
   longitudine galattica del polo celeste nord = 122.93192°.
   ============================================================================= */
const ALPHA_G = THREE.MathUtils.degToRad(192.85948);
const DELTA_G = THREE.MathUtils.degToRad(27.12825);
const L_NCP   = THREE.MathUtils.degToRad(122.93192);

function galacticToEquatorial(lRad, bRad) {
  const sinDec = Math.sin(DELTA_G) * Math.sin(bRad) + Math.cos(DELTA_G) * Math.cos(bRad) * Math.cos(L_NCP - lRad);
  const dec = Math.asin(Math.max(-1, Math.min(1, sinDec)));
  const y = Math.cos(bRad) * Math.sin(L_NCP - lRad);
  const x = Math.sin(bRad) * Math.cos(DELTA_G) - Math.cos(bRad) * Math.sin(DELTA_G) * Math.cos(L_NCP - lRad);
  const ra = ALPHA_G + Math.atan2(y, x);
  return { ra: THREE.MathUtils.radToDeg(ra), dec: THREE.MathUtils.radToDeg(dec) };
}

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
   intrinseco del modello a 4 bracci equidistanti, te lo segnalo esplicitamente
   perché è l'unico punto dove lo scarto è abbastanza ampio da poter fuorviare
   se letto come dato invece che come schema. */
const ARM_NAMES = ["Norma", "Scutum-Centaurus", "Sagittario", "Perseo"];
const NORMA_CALIBRATION_OFFSET_DEG = 29.61; // calcolato per scansione numerica
  // (vedi nota sopra), non un valore scelto a occhio

function galacticPointToScenePosition(Xg, Yg, Zg) {
  const dist = Math.sqrt(Xg*Xg + Yg*Yg + Zg*Zg);
  const b = Math.asin(Zg / dist);
  const l = Math.atan2(Yg, Xg);
  const eq = galacticToEquatorial(l, b);
  return { pos: raDecDistToCartesian(eq.ra, eq.dec, dist), distance: dist };
}

function generateSpiralBackground() {
  const LY_PER_KPC = 3261.56;
  // Unificato con la voce "Sgr A*" del catalogo (GRAVITY/ESO): 26.670 al
  // ≈ 8,178 kpc, non più i precedenti 8,0 kpc tondi.
  const R_SUN_LY = 26670.0;
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

      // coordinate galattocentriche, ruotate (non più traslate: l'origine
      // della scena ora E' il Centro Galattico) verso gli assi equatoriali
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
  return { positions: new Float32Array(positions), arms, R_SUN_LY };
}

const galaxyStructure = generateSpiralBackground();

/* =============================================================================
   CAMBIO DI PERNO: origine della scena sul Centro Galattico, non più sulla
   Terra.

   Finora l'origine (0,0,0) della scena era la Terra, e ogni posizione veniva
   calcolata come vettore Terra->oggetto. Ora l'origine è il Centro Galattico:
   la Terra diventa un punto spostato (EARTH_POS), e ogni posizione si ottiene
   sommando EARTH_POS al vettore Terra->oggetto già calcolato come prima (la
   traslazione dell'origine non cambia direzione/lunghezza di un vettore
   relativo, si somma solo il nuovo offset).

   EARTH_POS = -(vettore Terra->Centro Galattico) — verificabile: se il Centro
   Galattico è all'origine, la Terra deve stare esattamente all'opposto del
   vettore che va da Terra al Centro Galattico.
   ============================================================================= */
const EARTH_POS = (function computeEarthPos() {
  const gc = galacticToEquatorial(0, 0);
  return raDecDistToCartesian(gc.ra, gc.dec, galaxyStructure.R_SUN_LY).multiplyScalar(-1);
})();

(function addSpiralBackground() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(galaxyStructure.positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0x5b7fb5, size: 2, sizeAttenuation: false, transparent: true, opacity: 0.75 });
  const points = new THREE.Points(geo, mat);
  points.renderOrder = -1;
  scene.add(points);
})();

/* =============================================================================
   BARRA CENTRALE (spirale barrata)

   La Via Lattea è considerata una spirale barrata: un struttura allungata di
   stelle al centro, non un bulge sferico. La implemento qui, non più come
   blob piatto ma come ellissoide allungato, orientato secondo l'angolo di
   inclinazione della barra rispetto alla linea Sole-Centro Galattico.

   Dati verificati in questa sessione (più fonti indipendenti concordano):
   - Angolo della barra rispetto alla linea Sole-Centro: ~20-30°, con stime
     più recenti e precise intorno a 27° (Wegg & Gerhard 2013: 27°±2°;
     un articolo del 2026 in ADS conferma 27,4°±1,5° per la componente "long
     bar"). Uso 27°.
   - Verso: l'estremo vicino della barra punta verso longitudini galattiche
     POSITIVE (riportato in più fonti: Gonzalez & Gadotti; Li et al. 2022,
     IOPscience). Ho verificato numericamente (script separato) quale segno
     di rotazione nel mio sistema di coordinate riproduce questo verso,
     prima di usarlo — non l'ho assunto.
   - Semiasse maggiore: ~5 kpc (Wegg et al. 2015 per la "long bar": semi-major
     ~5 kpc; altre stime per la barra "corta" danno 3,1-4,5 kpc — la barra
     reale ha probabilmente due componenti sovrapposte, qui ne uso una sola
     come semplificazione).
   - Rapporto tra gli assi: 1 : 0,4 : 0,3 (semiasse lungo : semiasse corto nel
     piano : semiasse verticale) — Gonzalez & Gadotti review.

   Cosa NON è verificato: la barra reale ha probabilmente una forma "a
   arachide/scatola" (peanut/box-shaped) vista di taglio, non un ellissoide
   liscio — qui uso un ellissoide come approssimazione grossolana della forma,
   non della sola orientazione/dimensione (quelle sono citate sopra).
   ============================================================================= */
function galacticDirToSceneDir(Xg, Yg, Zg) {
  const l = Math.atan2(Yg, Xg);
  const b = Math.asin(Zg / Math.sqrt(Xg*Xg + Yg*Yg + Zg*Zg));
  const eq = galacticToEquatorial(l, b);
  return raDecDistToCartesian(eq.ra, eq.dec, 1);
}

(function addBar() {
  const LY_PER_KPC = 3261.56;
  const barAngle = THREE.MathUtils.degToRad(27);

  // Il Centro Galattico è ora l'origine della scena: la barra resta centrata
  // a (0,0,0), non serve più calcolare la posizione del Centro Galattico.
  const ngpDir = raDecDistToCartesian(192.85948, 27.12825, 1).normalize();

  // direzione dell'asse lungo della barra nel sistema galattico eliocentrico
  // (Xg,Yg,Zg): verificata numericamente per dare l'estremo vicino verso
  // longitudine positiva, vedi commento sopra
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
    // campionamento in un ellissoide unitario, con bias verso il centro
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
})();

/* =============================================================================
   ETICHETTE DEI BRACCI (overlay DOM, proiezione manuale — non uso
   CSS2DRenderer perché è un addon non incluso nel build core caricato da CDN)
   ============================================================================= */
const armLabelEls = galaxyStructure.arms.map(arm => {
  const el = document.createElement('div');
  el.className = 'armLabel';
  el.textContent = arm.name;
  document.getElementById('armLabels').appendChild(el);
  return { el, position: arm.position };
});

function updateArmLabels() {
  camera.updateMatrixWorld();
  const w = container.clientWidth, h = container.clientHeight;
  armLabelEls.forEach(({ el, position }) => {
    const viewSpace = position.clone().applyMatrix4(camera.matrixWorldInverse);
    if (viewSpace.z > 0) { el.style.display = 'none'; return; } // dietro la camera
    const ndc = position.clone().project(camera);
    if (ndc.x < -1.2 || ndc.x > 1.2 || ndc.y < -1.2 || ndc.y > 1.2) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.style.left = ((ndc.x + 1) / 2 * w) + 'px';
    el.style.top = ((1 - ndc.y) / 2 * h) + 'px';
  });
}

// Marcatore Terra (dimensione arbitraria, non in scala — vedi nota in UI)
// Colore azzurro intenso, distinguibile a colpo d'occhio dall'oggetto target
// Posizionato su EARTH_POS: l'origine della scena ora è il Centro Galattico,
// non più la Terra.
const earthGeo = new THREE.SphereGeometry(1, 24, 24);
const earthMat = new THREE.MeshBasicMaterial({ color: 0x1ec8ff });
const earthMesh = new THREE.Mesh(earthGeo, earthMat);
earthMesh.position.copy(EARTH_POS);
scene.add(earthMesh);

// Marcatore oggetto target — rosso intenso
const targetGeo = new THREE.SphereGeometry(1, 24, 24);
const targetMat = new THREE.MeshBasicMaterial({ color: 0xff2b2b });
const targetMesh = new THREE.Mesh(targetGeo, targetMat);
scene.add(targetMesh);

/* Punti "ancora" a dimensione fissa in pixel (sizeAttenuation:false):
   garantiscono che Terra e oggetto restino visibili anche quando, con lo
   zoom indietro, la mesh 3D scenderebbe sotto la dimensione di un pixel.
   depthTest:false + renderOrder alto: restano sempre in primo piano, mai
   nascosti da altri elementi della scena. */
const earthDotMat = new THREE.PointsMaterial({ color: 0x1ec8ff, size: 7, sizeAttenuation: false, depthTest: false });
const earthDotGeo = new THREE.BufferGeometry().setFromPoints([EARTH_POS]);
const earthDot = new THREE.Points(earthDotGeo, earthDotMat);
earthDot.renderOrder = 999;
scene.add(earthDot);

const targetDotMat = new THREE.PointsMaterial({ color: 0xff2b2b, size: 7, sizeAttenuation: false, depthTest: false });
const targetDotGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0)]);
const targetDot = new THREE.Points(targetDotGeo, targetDotMat);
targetDot.renderOrder = 999;
scene.add(targetDot);

// Linea Terra-oggetto
const lineMat = new THREE.LineBasicMaterial({ color: 0x556077 });
let lineObj = null;
let currentEntry = null;
let gridScaleFactor = 1;
let pivotMode = 'earth'; // 'earth' oppure 'gc'

function applyGridScale() {
  if (!currentEntry) return;
  galacticGrid.scale.setScalar(currentEntry.distance_ly * gridScaleFactor);
}

/* =============================================================================
   GRIGLIA DI COORDINATE GALATTICHE (centrata sulla Terra)
   Meridiani (longitudine costante, ogni 30°) e paralleli (latitudine
   costante, ogni 30°), più l'equatore galattico (b=0°) evidenziato — è la
   convenzione standard per una griglia di coordinate galattiche.
   Costruita come direzioni unitarie (Terra all'origine), poi scalata
   dinamicamente in base alla vista corrente (vedi loadObject) invece di
   avere un raggio fisso, per restare utile sia per oggetti vicini (M42) sia
   per oggetti lontanissimi (M31).
   ============================================================================= */
function galacticGridPoint(lDeg, bDeg) {
  const l = THREE.MathUtils.degToRad(lDeg);
  const b = THREE.MathUtils.degToRad(bDeg);
  const eq = galacticToEquatorial(l, b);
  return raDecDistToCartesian(eq.ra, eq.dec, 1);
}

const galacticGrid = new THREE.Group();
(function buildGalacticGrid() {
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
})();
// Ancorata a EARTH_POS: le coordinate galattiche (l, b) sono per definizione
// centrate sul Sole/Terra, non sul Centro Galattico — anche se ora è
// quest'ultimo l'origine della scena, la griglia deve restare sulla Terra
// per avere ancora un significato fisico corretto.
galacticGrid.position.copy(EARTH_POS);
scene.add(galacticGrid);

/* =============================================================================
   ETICHETTE DI COORDINATE SULLA GRIGLIA
   Longitudine 0°/90°/180°/270° sull'equatore galattico, più i due poli
   (b=+90°/-90°) e un'etichetta esplicita per l'equatore (b=0°) in un punto
   che non si sovrapponga alle etichette di longitudine.
   Le posizioni sono salvate come direzioni unitarie e moltiplicate per il
   raggio corrente di galacticGrid ad ogni frame — così restano ancorate alla
   griglia anche quando il suo raggio cambia (cambio di oggetto selezionato).
   ============================================================================= */
const GRID_LABEL_DEFS = [
  { l: 0,   b: 0,  text: 'l=0°'   },
  { l: 90,  b: 0,  text: 'l=90°'  },
  { l: 180, b: 0,  text: 'l=180°' },
  { l: 270, b: 0,  text: 'l=270°' },
  { l: 45,  b: 0,  text: 'b=0°'   },
  { l: 0,   b: 90, text: 'b=+90° (N)' },
  { l: 0,   b: -90, text: 'b=−90° (S)' }
];
const gridLabelEls = GRID_LABEL_DEFS.map(def => {
  const el = document.createElement('div');
  el.className = 'gridLabel';
  el.textContent = def.text;
  document.getElementById('armLabels').appendChild(el);
  return { el, unitDir: galacticGridPoint(def.l, def.b) };
});

function updateGridLabels() {
  const w = container.clientWidth, h = container.clientHeight;
  const radius = galacticGrid.scale.x;
  gridLabelEls.forEach(({ el, unitDir }) => {
    const position = unitDir.clone().multiplyScalar(radius).add(EARTH_POS);
    const viewSpace = position.clone().applyMatrix4(camera.matrixWorldInverse);
    if (viewSpace.z > 0) { el.style.display = 'none'; return; }
    const ndc = position.clone().project(camera);
    if (ndc.x < -1.2 || ndc.x > 1.2 || ndc.y < -1.2 || ndc.y > 1.2) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.style.left = ((ndc.x + 1) / 2 * w) + 'px';
    el.style.top = ((1 - ndc.y) / 2 * h) + 'px';
  });
}

/* =============================================================================
   CONTROLLI ORBIT MANUALI (drag per ruotare, rotella per zoom, pinch per zoom
   touch)
   Implementati senza dipendere da THREE.OrbitControls, che non è incluso nel
   build core three.min.js e richiederebbe un addon separato non garantito
   sulla stessa CDN.
   ============================================================================= */
const controls = {
  target: new THREE.Vector3(0, 0, 0),
  radius: 10,
  minRadius: 0.1,
  maxRadius: 1e8,
  theta: Math.PI / 4,   // angolo azimutale
  phi: Math.PI / 3,     // angolo polare
  dragging: false,
  lastX: 0, lastY: 0,

  update() {
    const sinPhi = Math.sin(this.phi);
    camera.position.set(
      this.target.x + this.radius * sinPhi * Math.cos(this.theta),
      this.target.y + this.radius * sinPhi * Math.sin(this.theta),
      this.target.z + this.radius * Math.cos(this.phi)
    );
    camera.lookAt(this.target);
  }
};

/* Tracciamento multi-pointer: con 1 dito/puntatore attivo si ruota (come
   prima), con 2 si passa automaticamente al pinch-to-zoom. Il mouse con
   rotellina resta gestito separatamente più sotto (evento 'wheel', che sui
   touch screen non esiste mai — da qui il bug: lo zoom mancava del tutto su
   Android, non era invertito né rotto, semplicemente non era implementato
   per il touch). */
const activePointers = new Map(); // pointerId -> {x, y}
let pinching = false;
let lastPinchDistance = 0;

function pinchDistance() {
  const pts = Array.from(activePointers.values());
  return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (activePointers.size === 1) {
    controls.dragging = true;
    controls.lastX = e.clientX;
    controls.lastY = e.clientY;
  } else if (activePointers.size === 2) {
    controls.dragging = false;
    pinching = true;
    lastPinchDistance = pinchDistance();
  }
});
window.addEventListener('pointerup', (e) => {
  activePointers.delete(e.pointerId);
  if (activePointers.size === 1) {
    // resta un dito: riprende la rotazione da qui, senza salti
    const [remaining] = activePointers.values();
    pinching = false;
    controls.dragging = true;
    controls.lastX = remaining.x;
    controls.lastY = remaining.y;
  } else if (activePointers.size === 0) {
    pinching = false;
    controls.dragging = false;
  }
});
window.addEventListener('pointercancel', (e) => {
  activePointers.delete(e.pointerId);
  if (activePointers.size < 2) pinching = false;
  if (activePointers.size === 0) controls.dragging = false;
});
window.addEventListener('pointermove', (e) => {
  if (!activePointers.has(e.pointerId)) return;
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pinching && activePointers.size === 2) {
    const dist = pinchDistance();
    const ratio = dist / lastPinchDistance;
    lastPinchDistance = dist;
    controls.radius = Math.max(controls.minRadius, Math.min(controls.maxRadius, controls.radius / ratio));
    controls.update();
    return;
  }

  if (!controls.dragging) return;
  const dx = e.clientX - controls.lastX;
  const dy = e.clientY - controls.lastY;
  controls.lastX = e.clientX;
  controls.lastY = e.clientY;
  controls.theta -= dx * 0.005;
  controls.phi -= dy * 0.005;
  controls.phi = Math.max(0.05, Math.min(Math.PI - 0.05, controls.phi));
  controls.update();
});
renderer.domElement.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = Math.pow(1.1, e.deltaY > 0 ? 1 : -1);
  controls.radius = Math.max(controls.minRadius, Math.min(controls.maxRadius, controls.radius * factor));
  controls.update();
}, { passive: false });

/* =============================================================================
   INQUADRATURA AUTOMATICA PER OGGETTO SELEZIONATO

   Il perno di rotazione (controls.target) è sempre la Terra, non il punto
   medio del segmento Terra-oggetto: ruotando, la Terra resta sempre al centro
   dello schermo. Di conseguenza l'oggetto NON è garantito visibile per
   qualunque angolo di rotazione (lo sarebbe stato solo ancorando al punto
   medio) — è una scelta esplicita, coerente con la richiesta di ancorare
   sulla Terra.

   Per la vista iniziale, la posizione della camera è scelta in modo che la
   direzione Terra-camera sia ESATTAMENTE perpendicolare alla direzione
   Terra-oggetto: in questa configurazione lo scostamento angolare
   dell'oggetto dal centro schermo è esattamente atan(distanza/raggioCamera)
   (relazione geometrica esatta, non un'approssimazione), il che permette di
   scegliere il raggio della camera per ottenere una composizione prevedibile.
   ============================================================================= */
function loadObject(entry) {
  currentEntry = entry;
  // cambiando oggetto, il fattore di scala della griglia torna a 1×
  gridScaleFactor = 1;
  const gridScaleSelectEl = document.getElementById('gridScaleSelect');
  if (gridScaleSelectEl) gridScaleSelectEl.value = '1';

  // vettore Terra->oggetto (invariato: dipende solo da RA/Dec/distanza,
  // non dall'origine della scena), poi sommato a EARTH_POS per ottenere la
  // posizione assoluta nel sistema centrato sul Centro Galattico
  const posFromEarth = raDecDistToCartesian(entry.ra_deg, entry.dec_deg, entry.distance_ly);
  const pos = posFromEarth.clone().add(EARTH_POS);
  targetMesh.position.copy(pos);
  targetDot.geometry.setFromPoints([pos]);

  // dimensione marcatori scalata sulla distanza, SOLO per visibilità — non è
  // la dimensione fisica reale dell'oggetto né della Terra
  const markerScale = entry.distance_ly * 0.01;
  earthMesh.scale.setScalar(Math.max(markerScale, 0.001));
  targetMesh.scale.setScalar(Math.max(markerScale, 0.001));

  if (lineObj) scene.remove(lineObj);
  const lineGeo = new THREE.BufferGeometry().setFromPoints([EARTH_POS, pos]);
  lineObj = new THREE.Line(lineGeo, lineMat);
  scene.add(lineObj);

  const fovRad = THREE.MathUtils.degToRad(camera.fov);

  /* Inquadratura camera con perno parametrico (Terra o Centro Galattico,
     scelto dall'utente in #pivotSelect). Stessa formula a sfera-limite in
     entrambi i casi: una sfera centrata sul perno, di raggio pari alla PIÙ
     GRANDE delle due distanze dal perno (Terra e oggetto), contiene sempre
     entrambi i punti — una camera a distanza (raggio/sin(metà FOV)) da quella
     sfera li vede sempre entrambi, qualunque sia l'angolo di rotazione.

     Quando il perno è la Terra, questa stessa formula si riduce da sola al
     comportamento della versione precedente: la "distanza Terra-perno" è
     zero, quindi il raggio della sfera-limite è semplicemente la distanza
     dell'oggetto — non serve una logica separata per i due casi. */
  const pivotTarget = (pivotMode === 'gc') ? new THREE.Vector3(0, 0, 0) : EARTH_POS.clone();
  const boundRadius = Math.max(EARTH_POS.distanceTo(pivotTarget), pos.distanceTo(pivotTarget));

  const midPoint = EARTH_POS.clone().add(pos).multiplyScalar(0.5).sub(pivotTarget);
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

  controls.target.copy(pivotTarget);
  controls.radius = fitDistance;
  controls.minRadius = fitDistance * 0.02;
  controls.maxRadius = fitDistance * 80;
  controls.theta = Math.atan2(perpDir.y, perpDir.x);
  controls.phi = Math.acos(perpDir.z);
  camera.near = fitDistance * 0.0005;
  camera.far = fitDistance * 500;
  camera.updateProjectionMatrix();
  controls.update();

  // griglia galattica: raggio pari alla distanza dell'oggetto selezionato,
  // moltiplicata per il fattore scelto nel menu dedicato (default 1×) —
  // resta ancorata alla Terra (vedi galacticGrid.position), non al perno
  applyGridScale();

  updateInfoPanel(entry);
}


function updateInfoPanel(entry) {
  const infoContent = document.getElementById('infoContent');
  const uncStr = entry.distance_unc_ly
    ? ` ± ${entry.distance_unc_ly.toLocaleString('it-IT')}`
    : '';
  const distStr = entry.distance_ly >= 1e6
    ? (entry.distance_ly / 1e6).toLocaleString('it-IT', {maximumFractionDigits: 2}) + ' milioni di anni luce'
    : entry.distance_ly.toLocaleString('it-IT') + uncStr + ' anni luce';
  infoContent.innerHTML = `
    <h3>${entry.name}</h3>
    <div class="row">${entry.type}</div>
    <div class="row">Distanza dalla Terra: ${distStr}</div>
    <div class="row">RA: ${entry.ra_deg.toFixed(4)}°  Dec: ${entry.dec_deg.toFixed(4)}° (J2000)</div>
    <div class="warn">I marcatori 3D non sono in scala rispetto alla distanza reale (altrimenti sarebbero invisibili); indicano solo la posizione relativa.</div>
    <div class="src">Fonte: ${entry.source}</div>
  `;
}

/* =============================================================================
   PANNELLO INFO COLLASSABILE
   Lo stato (collassato/espanso) non viene resettato cambiando oggetto — resta
   come l'utente l'ha impostato, è una preferenza di interfaccia, non legata
   al singolo oggetto.
   ============================================================================= */
const infoEl = document.getElementById('info');
const infoToggle = document.getElementById('infoToggle');
let infoCollapsed = false;

function setInfoCollapsed(collapsed) {
  infoCollapsed = collapsed;
  infoEl.classList.toggle('collapsed', collapsed);
  infoToggle.textContent = collapsed ? 'i' : '−';
  infoToggle.title = collapsed ? 'Espandi' : 'Comprimi';
}

infoToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  setInfoCollapsed(!infoCollapsed);
});
infoEl.addEventListener('click', () => {
  if (infoCollapsed) setInfoCollapsed(false);
});

/* =============================================================================
   UI: selettore catalogo
   ============================================================================= */
const select = document.getElementById('objectSelect');
CATALOG.forEach((entry, i) => {
  const opt = document.createElement('option');
  opt.value = i;
  opt.textContent = entry.name;
  select.appendChild(opt);
});
select.addEventListener('change', () => loadObject(CATALOG[select.value]));

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
   RESIZE + RENDER LOOP
   ============================================================================= */
function onResize() {
  const w = container.clientWidth, h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener('resize', onResize);
onResize();

function animate() {
  requestAnimationFrame(animate);
  updateArmLabels();
  updateGridLabels();
  renderer.render(scene, camera);
}
animate();

// leggo oggetto da querystring
const urlParams = new URLSearchParams(window.location.search);
const presetValue = urlParams.get('obj');
if (presetValue !== null) {
  // Trova la select tramite il suo ID
  const selectElement = document.getElementById('objectSelect');
  if (selectElement) {
    selectElement.value = presetValue;
  }
  loadObject(CATALOG[Number(presetValue)]);
} else {
	// avvio con il primo oggetto del catalogo
	loadObject(CATALOG[0]);
}
