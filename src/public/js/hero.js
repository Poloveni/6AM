/* ==========================================================
   6AM — medaillon 3D de la page d'accueil (Three.js)
   Aucune dependance externe : three est servi depuis /static/vendor.
   Le medaillon est ancre sur l'element .hero-emblem : il suit donc
   exactement la mise en page HTML, quelle que soit la taille d'ecran.
   ========================================================== */
import * as THREE from '/static/vendor/three.module.min.js';

const canvas = document.getElementById('hero-canvas');
if (canvas) init(canvas);

function supportsWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) { return false; }
}

function init(canvas) {
  if (!supportsWebGL()) {
    document.body.classList.add('no-webgl');
    canvas.remove();
    return;
  }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const host = canvas.parentElement;
  const anchor = host.querySelector('.hero-emblem');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.6;

  const scene = new THREE.Scene();

  const CAM_Z = 9;
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0, CAM_Z);

  // ---------- Medaillon ----------
  const medal = new THREE.Group();
  scene.add(medal);

  const RADIUS = 2;
  const loader = new THREE.TextureLoader();
  const logoTex = loader.load('/static/img/logo.png', (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    t.needsUpdate = true;
  });
  logoTex.colorSpace = THREE.SRGBColorSpace;

  const faceMat = new THREE.MeshStandardMaterial({
    map: logoTex,
    emissiveMap: logoTex,
    emissive: 0x51708f,
    emissiveIntensity: 0.55,
    metalness: 0.45,
    roughness: 0.42,
  });
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x24344a, metalness: 0.95, roughness: 0.25 });
  const backMat = new THREE.MeshStandardMaterial({ color: 0x101a26, metalness: 0.9, roughness: 0.45 });

  const coin = new THREE.Mesh(
    new THREE.CylinderGeometry(RADIUS, RADIUS, 0.2, 160, 1),
    [edgeMat, faceMat, backMat]
  );
  coin.rotation.x = Math.PI / 2;
  medal.add(coin);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(RADIUS + 0.02, 0.05, 24, 200),
    new THREE.MeshStandardMaterial({ color: 0x8caed2, metalness: 1, roughness: 0.16 })
  );
  medal.add(ring);

  // Halo diffus : degrade radial genere a la volee (pas de fichier externe)
  const haloTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d').createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0.00, 'rgba(140,180,225,0.85)');
    g.addColorStop(0.32, 'rgba(90,135,185,0.32)');
    g.addColorStop(0.65, 'rgba(50,85,130,0.10)');
    g.addColorStop(1.00, 'rgba(20,35,60,0)');
    const ctx = c.getContext('2d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: haloTex,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  halo.scale.setScalar(RADIUS * 5.2);
  halo.position.z = -0.7;
  medal.add(halo);

  // ---------- Lumieres ----------
  scene.add(new THREE.AmbientLight(0x4a5f78, 2.4));

  const key = new THREE.DirectionalLight(0xe8f2fb, 3.4);
  key.position.set(-4, 5, 7);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x7ea3c9, 1.9);
  fill.position.set(5, -2, 4);
  scene.add(fill);

  const sweep = new THREE.PointLight(0xcfe2f6, 30, 26, 2);
  sweep.position.set(3, 2, 5);
  scene.add(sweep);

  // ---------- Poussiere d'etoiles ----------
  const starCount = 340;
  const positions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i += 1) {
    positions[i * 3]     = (Math.random() - 0.5) * 30;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
    positions[i * 3 + 2] = -Math.random() * 14 - 2;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0x9dbcdb, size: 0.05, transparent: true, opacity: 0.5, sizeAttenuation: true,
  }));
  scene.add(stars);

  // ---------- Interaction ----------
  const pointer = { x: 0, y: 0 };
  const target = { x: 0, y: 0 };
  window.addEventListener('pointermove', (e) => {
    target.x = (e.clientX / window.innerWidth) * 2 - 1;
    target.y = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  let scrollY = window.scrollY || 0;
  window.addEventListener('scroll', () => { scrollY = window.scrollY || 0; }, { passive: true });

  // ---------- Ancrage sur la mise en page ----------
  const base = { x: 0, y: 0, scale: 1 };

  function layout() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;

    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    // Hauteur du plan visible a z = 0
    const visibleH = 2 * CAM_Z * Math.tan((camera.fov * Math.PI) / 360);
    const unit = h / visibleH;                    // pixels par unite 3D

    const hostRect = host.getBoundingClientRect();
    const rect = anchor ? anchor.getBoundingClientRect() : hostRect;

    const cxPx = rect.left + rect.width / 2 - (hostRect.left + hostRect.width / 2);
    const cyPx = rect.top + rect.height / 2 - (hostRect.top + hostRect.height / 2);

    base.x = cxPx / unit;
    base.y = -cyPx / unit;
    base.scale = (Math.min(rect.width, rect.height) / unit) / (RADIUS * 2);
  }

  window.addEventListener('resize', layout);
  if (window.ResizeObserver && anchor) new ResizeObserver(layout).observe(anchor);
  layout();

  // ---------- Boucle ----------
  let running = true;
  document.addEventListener('visibilitychange', () => { running = !document.hidden; });
  const clock = new THREE.Clock();

  function frame() {
    requestAnimationFrame(frame);
    if (!running) return;

    const t = clock.getElapsedTime();

    pointer.x += (target.x - pointer.x) * 0.05;
    pointer.y += (target.y - pointer.y) * 0.05;

    if (reduced) {
      medal.rotation.set(0, 0, 0);
    } else {
      medal.rotation.y = pointer.x * 0.34 + Math.sin(t * 0.28) * 0.07;
      medal.rotation.x = pointer.y * 0.22 + Math.cos(t * 0.23) * 0.05;
      medal.rotation.z = Math.sin(t * 0.16) * 0.03;

      sweep.position.x = Math.cos(t * 0.6) * 6;
      sweep.position.y = Math.sin(t * 0.45) * 4;
      stars.rotation.z = t * 0.008;
    }

    const fade = Math.min(1, scrollY / 620);
    const bob = reduced ? 0 : Math.sin(t * 0.55) * 0.06;

    medal.position.set(base.x, base.y + bob - fade * 0.6, -fade * 3);
    medal.scale.setScalar(base.scale * (1 - fade * 0.15));
    halo.material.opacity = 0.75 * (1 - fade);

    renderer.render(scene, camera);
  }
  frame();
}
