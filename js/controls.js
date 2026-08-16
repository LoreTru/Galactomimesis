/* =============================================================================
   controls.js — controlli orbit manuali (drag per ruotare, rotella/pinch per
   zoom)

   Implementati senza dipendere da THREE.OrbitControls, che non è incluso nel
   build core three.module.min.js caricato da CDN e richiederebbe un addon
   separato non garantito sulla stessa fonte.

   Scritto come fabbrica (createOrbitControls) invece che come stato globale
   implicito: riceve camera e domElement come parametri invece di leggerli da
   variabili di modulo esterne — più facile da testare in isolamento e da
   riusare se in futuro serve più di una vista.
   ============================================================================= */
import * as THREE from "https://cdnjs.cloudflare.com/ajax/libs/three.js/0.185.1/three.module.min.js";

export function createOrbitControls(camera, domElement) {
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

  /* Tracciamento multi-pointer: con 1 dito/puntatore attivo si ruota, con 2
     si passa automaticamente al pinch-to-zoom. Il mouse con rotellina resta
     gestito separatamente più sotto (evento 'wheel', che sui touch screen
     non esiste mai — da qui il fix storico: lo zoom mancava del tutto su
     Android, non era invertito né rotto, semplicemente non era implementato
     per il touch). */
  const activePointers = new Map(); // pointerId -> {x, y}
  let pinching = false;
  let lastPinchDistance = 0;

  function pinchDistance() {
    const pts = Array.from(activePointers.values());
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  domElement.addEventListener('pointerdown', (e) => {
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
  domElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = Math.pow(1.1, e.deltaY > 0 ? 1 : -1);
    controls.radius = Math.max(controls.minRadius, Math.min(controls.maxRadius, controls.radius * factor));
    controls.update();
  }, { passive: false });

  return controls;
}
