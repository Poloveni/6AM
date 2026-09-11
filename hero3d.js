/* 6AM — écusson 3D du haut de page (three.js r128, hébergé dans vendor/).
   Une pièce en acier dont les deux faces portent le logo, qui tourne seule
   et qu'on peut faire pivoter à la souris ou au doigt. */
(function () {
  const canvas = document.getElementById('hero3d');
  if (!canvas) return;
  if (typeof THREE === 'undefined') { document.documentElement.classList.add('no-3d'); return; }
  const hero = canvas.parentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); }
  catch { document.documentElement.classList.add('no-3d'); return; }   // WebGL indisponible
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0.2, 6.2);

  // ---- texture du logo
  const faceTex = new THREE.TextureLoader().load('assets/medallion.jpg');
  faceTex.encoding = THREE.sRGBEncoding;
  faceTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

  // ---- la pièce
  const R = 1.75, T = 0.16, SEG = 128;
  const steel = new THREE.MeshStandardMaterial({ color: 0x5d6f90, metalness: 0.95, roughness: 0.3 });
  const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, metalness: 0.45, roughness: 0.5, emissive: 0x0c1428, emissiveMap: faceTex, emissiveIntensity: 0.6 });
  const coin = new THREE.Group();
  const edge = new THREE.Mesh(new THREE.CylinderGeometry(R, R, T, SEG, 1, true), steel);
  edge.rotation.x = Math.PI / 2; coin.add(edge);
  const front = new THREE.Mesh(new THREE.CircleGeometry(R, SEG), faceMat); front.position.z = T / 2; coin.add(front);
  const back = new THREE.Mesh(new THREE.CircleGeometry(R, SEG), faceMat); back.position.z = -T / 2; back.rotation.y = Math.PI; coin.add(back);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.07, 24, SEG), new THREE.MeshStandardMaterial({ color: 0xb8c6de, metalness: 1, roughness: 0.2 }));
  coin.add(rim);
  // cannelures sur la tranche
  const reeds = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, T * 1.05, 0.06), new THREE.MeshStandardMaterial({ color: 0x33415e, metalness: 1, roughness: 0.4 }), 160);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < 160; i++) {
    const a = i / 160 * Math.PI * 2;
    p.set(Math.cos(a) * (R + 0.02), Math.sin(a) * (R + 0.02), 0);
    q.setFromEuler(new THREE.Euler(Math.PI / 2, 0, a));
    m.compose(p, q, s); reeds.setMatrixAt(i, m);
  }
  coin.add(reeds);
  scene.add(coin);

  // ---- lumières froides (lune + reflet bleu)
  scene.add(new THREE.AmbientLight(0x1c2640, 1.0));
  const key = new THREE.SpotLight(0xe4ecff, 2.3, 30, 0.6, 0.6, 1); key.position.set(4, 5, 6); scene.add(key);
  const rimL = new THREE.DirectionalLight(0x7f9fd8, 1.5); rimL.position.set(-5, 2, -4); scene.add(rimL);
  const fill = new THREE.PointLight(0x2e4470, 0.9, 20); fill.position.set(-3, -2, 4); scene.add(fill);
  const glow = new THREE.PointLight(0xa9c2f0, 0.0, 12); glow.position.set(0, 0, 2.5); scene.add(glow);

  // ---- poussière argentée
  const sprite = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(235,242,255,1)'); gr.addColorStop(.35, 'rgba(160,190,240,.6)'); gr.addColorStop(1, 'rgba(160,190,240,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const N = 650;
  const pos = new Float32Array(N * 3), spd = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - .5) * 16; pos[i * 3 + 1] = (Math.random() - .5) * 9; pos[i * 3 + 2] = (Math.random() - .5) * 8 - 1; spd[i] = 0.2 + Math.random() * 0.8; }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.065, map: sprite, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xc4d4f2, opacity: 0.8 }));
  scene.add(dust);

  // ---- halo derrière la pièce + deux traînées de lumière en orbite
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128); gr.addColorStop(0, 'rgba(150,185,245,.5)'); gr.addColorStop(.35, 'rgba(90,125,200,.2)'); gr.addColorStop(.7, 'rgba(40,60,110,.06)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(c); })();
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 }));
  scene.add(halo);

  const RING_N = 160, ringR = R + 0.32;
  const ringPos = new Float32Array(RING_N * 3), ringCol = new Float32Array(RING_N * 3);
  for (let i = 0; i < RING_N; i++) { const a = i / RING_N * Math.PI * 2; ringPos[i * 3] = Math.cos(a) * ringR; ringPos[i * 3 + 1] = Math.sin(a) * ringR; }
  const ringGeo = new THREE.BufferGeometry();
  ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPos, 3));
  ringGeo.setAttribute('color', new THREE.BufferAttribute(ringCol, 3));
  const ringMat = new THREE.PointsMaterial({ size: 0.16, map: sprite, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const ring = new THREE.Points(ringGeo, ringMat), ring2 = new THREE.Points(ringGeo, ringMat);
  scene.add(ring); scene.add(ring2);
  function updateRing(t) {
    const col = ringGeo.attributes.color.array, heads = [t * 0.45, t * 0.45 + Math.PI];
    for (let i = 0; i < RING_N; i++) {
      const a = i / RING_N * Math.PI * 2; let v = 0;
      for (const h of heads) { let d = (h - a) % (Math.PI * 2); if (d < 0) d += Math.PI * 2; v = Math.max(v, Math.exp(-d * 2.2)); }
      const g = 0.05 + v * 1.15;
      col[i * 3] = g * 0.7; col[i * 3 + 1] = g * 0.82; col[i * 3 + 2] = g;
    }
    ringGeo.attributes.color.needsUpdate = true;
  }

  // ---- interaction : glisser sur le haut de page (la molette reste pour la page)
  let dragging = false, lx = 0, ly = 0, velX = 0, velY = 0, rotX = 0, rotY = 0, autoSpin = true;
  const mouse = { x: 0, y: 0 };
  let coinX = 0, coinY = 0, coinScale = 1;
  function layout() {
    const w = hero.clientWidth, h = hero.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    if (w > 720) { coinX = Math.min(1.75, w / 780); coinY = 0.05; coinScale = Math.min(0.72, w / 1900); }
    else { coinX = 0; coinY = 1.05; coinScale = Math.min(0.42, w / 980); }
    coin.scale.setScalar(coinScale);
  }
  addEventListener('resize', layout); layout();

  canvas.addEventListener('pointerdown', e => { dragging = true; autoSpin = false; lx = e.clientX; ly = e.clientY; velX = velY = 0; canvas.setPointerCapture(e.pointerId); });
  addEventListener('pointermove', e => {
    mouse.x = (e.clientX / innerWidth - .5) * 2; mouse.y = (e.clientY / innerHeight - .5) * 2;
    if (!dragging) return;
    const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
    velY = dx * 0.006; velX = dy * 0.006; rotY += velY; rotX += velX;
  });
  const up = () => { if (!dragging) return; dragging = false; setTimeout(() => { if (!dragging) autoSpin = true; }, 2500); };
  addEventListener('pointerup', up); addEventListener('pointercancel', up);

  // pause quand le haut de page n'est plus visible (économise la batterie)
  let visible = true;
  if ('IntersectionObserver' in window) new IntersectionObserver(en => { visible = en[0].isIntersecting; }, { threshold: 0.02 }).observe(hero);

  const clock = new THREE.Clock();
  function tick() {
    requestAnimationFrame(tick);
    if (!visible) return;
    const t = clock.getElapsedTime();
    if (!dragging) { rotY += velY; rotX += velX; velX *= 0.94; velY *= 0.94; }
    if (autoSpin) rotY += reduce ? 0.0015 : 0.0045;
    rotX = THREE.MathUtils.clamp(rotX, -0.9, 0.9);
    coin.rotation.y = rotY;
    coin.rotation.x = rotX + Math.sin(t * 0.7) * 0.04;
    coin.position.set(coinX, coinY + Math.sin(t * 0.9) * 0.08, 0);
    halo.position.set(coinX + Math.sin(t * 0.5) * 0.12, coin.position.y + Math.cos(t * 0.4) * 0.1, -0.4);
    halo.scale.setScalar((R * 3.2 + Math.sin(t * 1.3) * 0.25) * coinScale);
    halo.material.opacity = 0.7 + Math.sin(t * 0.9) * 0.15;
    ring.position.copy(coin.position); ring2.position.copy(coin.position);
    ring.scale.setScalar(coinScale); ring2.scale.setScalar(coinScale);
    ring.rotation.set(0.35 + Math.sin(t * 0.3) * 0.1, t * 0.25, 0);
    ring2.rotation.set(-0.5 + Math.cos(t * 0.27) * 0.1, -t * 0.2 + 1.3, 0.3);
    updateRing(t);
    camera.position.x += ((mouse.x * 0.35) - camera.position.x) * 0.04;
    camera.position.y += ((-mouse.y * 0.25 + 0.2) - camera.position.y) * 0.04;
    camera.lookAt(0, 0, 0);
    const facing = Math.abs(Math.cos(rotY));
    glow.position.set(coinX, coinY, 2.5);
    glow.intensity = 0.4 + facing * 1.3 + Math.sin(t * 2) * 0.15;
    faceMat.emissiveIntensity = 0.4 + facing * 0.35;
    const a = dustGeo.attributes.position.array;
    for (let i = 0; i < N; i++) { a[i * 3 + 1] += spd[i] * 0.0025; if (a[i * 3 + 1] > 4.5) a[i * 3 + 1] = -4.5; }
    dustGeo.attributes.position.needsUpdate = true;
    dust.rotation.y = t * 0.02;
    renderer.render(scene, camera);
  }
  tick();
})();
