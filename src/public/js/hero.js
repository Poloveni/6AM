// 6AM cinematic scene. Three.js and the logo are served locally.
const host = document.querySelector('.sixam');
if (host) {
  const word = host.querySelector('[data-sixam-word]');
  const label = host.querySelector('[data-sixam-label]');
  const sub = host.querySelector('[data-sixam-sub]');
  const note = host.querySelector('[data-sixam-note]');
  const buttons = [...host.querySelectorAll('[data-sixam-chapter]')];
  const pause = host.querySelector('[data-sixam-pause]');
  const status = host.querySelector('[data-sixam-status]');
  const chapters = [
    { word: word.firstChild.textContent, label: label.textContent, sub: sub.textContent, note: note.textContent },
    { word: 'LOYALTY', label: 'LA PAROLE ENGAGE.', sub: 'Le silence protège.', note: 'Le respect se gagne. La loyauté se prouve.' },
    { word: 'LEGACY', label: 'AVANT QUE LE JOUR SE LÈVE.', sub: 'Notre nom reste.', note: 'Pas besoin de faire du bruit pour laisser une trace.' },
  ];
  let chapter = 0;
  let paused = false;
  let cleanup = () => {};
  buttons.forEach((button, index) => button.addEventListener('click', () => {
    chapter = index;
    const content = chapters[index];
    word.firstChild.textContent = content.word;
    word.classList.toggle('is-long', index !== 0);
    label.textContent = content.label;
    sub.textContent = content.sub;
    note.textContent = content.note;
    buttons.forEach((item, i) => {
      if (i === index) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
  }));
  pause.addEventListener('click', () => {
    paused = !paused;
    pause.textContent = paused ? '▶' : 'Ⅱ';
    pause.setAttribute('aria-pressed', String(paused));
    pause.setAttribute('aria-label', paused ? 'Reprendre l’animation' : 'Mettre l’animation en pause');
  });

  function fallback() {
    host.classList.remove('is-ready');
    pause.hidden = true;
    status.textContent = 'FIVEM ROLEPLAY';
  }
  // Keep the static emblem and chapter navigation usable if WebGL cannot load.
  import('/static/vendor/three.module.min.js').then(THREE => {
    try { start(THREE); } catch (error) { cleanup(); fallback(); }
  }).catch(fallback);

  function start(THREE) {
    const canvas = host.querySelector('canvas');
    const anchor = host.querySelector('.sixam-anchor');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    renderer.setClearColor(0x03070c, 0);
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050b13, .035);
    const camera = new THREE.PerspectiveCamera(40, 1, .1, 100);
    camera.position.z = 13;
    let frameId = 0, disposed = false, loaded = false, inView = true, contextLost = false;
    const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
    const texture = new THREE.TextureLoader().load('/static/img/logo.png', () => {
      if (disposed) return;
      loaded = true;
      host.classList.add('is-ready');
      pause.hidden = motionPreference.matches;
      status.textContent = motionPreference.matches ? 'FIVEM ROLEPLAY' : 'DÉPLACEZ LA SOURIS POUR EXPLORER';
    }, undefined, fallback);
    texture.colorSpace = THREE.SRGBColorSpace;
    scene.add(new THREE.AmbientLight(0xa2bedb, 1.4));
    const light = new THREE.PointLight(0xc2e4ff, 80, 25);
    light.position.set(-3, 4, 5); scene.add(light);
    const blue = new THREE.PointLight(0x447dff, 55, 20);
    blue.position.set(5, -2, 4); scene.add(blue);
    const emblem = new THREE.Group(); scene.add(emblem);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(2.55, 2.55, .16, 128), new THREE.MeshStandardMaterial({ color: 0x657f98, metalness: .95, roughness: .25 }));
    body.rotation.x = Math.PI / 2; emblem.add(body);
    const face = new THREE.Mesh(new THREE.CircleGeometry(2.54, 128), new THREE.MeshBasicMaterial({ map: texture }));
    face.position.z = .09; emblem.add(face);
    emblem.add(new THREE.Mesh(new THREE.TorusGeometry(2.57, .018, 8, 180), new THREE.MeshStandardMaterial({ color: 0xb8d8f1, metalness: 1, roughness: .25 })));
    const orbit = new THREE.Group(); scene.add(orbit);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.05 + i * .25, .005, 4, 160), new THREE.MeshBasicMaterial({ color: 0x658eb3, transparent: true, opacity: .22 - i * .04 }));
      ring.rotation.set(.2 + i * .14, .2 + i * .17, 0); orbit.add(ring);
    }
    const positions = new Float32Array(700 * 6);
    for (let i = 0; i < 700; i++) {
      const x = (Math.random() - .5) * 35, y = (Math.random() - .5) * 25, z = (Math.random() - .5) * 22;
      positions.set([x, y, z, x - .025, y + .18, z], i * 6);
    }
    const rainGeometry = new THREE.BufferGeometry();
    rainGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const rain = new THREE.LineSegments(rainGeometry, new THREE.LineBasicMaterial({ color: 0x8daecb, transparent: true, opacity: .18 })); scene.add(rain);
    const dustGeometry = new THREE.BufferGeometry(), dustPositions = new Float32Array(900);
    for (let i = 0; i < dustPositions.length; i++) dustPositions[i] = (Math.random() - .5) * 32;
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: 0xc5e0ff, size: .022, transparent: true, opacity: .6 })); scene.add(dust);
    const pointer = { x: 0, y: 0 }, base = { x: 0, y: 0 };
    function move(event) {
      const rect = host.getBoundingClientRect();
      pointer.x = (event.clientX - rect.left) / rect.width - .5;
      pointer.y = (event.clientY - rect.top) / rect.height - .5;
    }
    function resetPointer() { pointer.x = pointer.y = 0; }
    function layout() {
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
      const unit = h / (2 * camera.position.z * Math.tan(camera.fov * Math.PI / 360));
      const rect = host.getBoundingClientRect(), a = anchor.getBoundingClientRect();
      base.x = (a.left + a.width / 2 - rect.left - w / 2) / unit;
      base.y = -(a.top + a.height / 2 - rect.top - h / 2) / unit;
      const scale = Math.min(a.width, a.height) / unit / 5.1;
      emblem.scale.setScalar(scale); orbit.scale.setScalar(scale);
      emblem.position.set(base.x, base.y, 0); orbit.position.copy(emblem.position);
    }
    host.addEventListener('pointermove', move, { passive: true });
    host.addEventListener('pointerleave', resetPointer);
    window.addEventListener('resize', layout);
    const resize = new ResizeObserver(layout); resize.observe(host); resize.observe(anchor);
    const intersection = new IntersectionObserver(entries => { inView = entries[0].isIntersecting; });
    intersection.observe(host);
    function lost(event) { event.preventDefault(); contextLost = true; fallback(); }
    function restored() { contextLost = false; if (loaded) { host.classList.add('is-ready'); pause.hidden = motionPreference.matches; } }
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    layout();
    let time = 0, last = performance.now();
    function frame(now) {
      frameId = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, .04); last = now;
      if (document.hidden || !inView || contextLost || !loaded) return;
      pause.hidden = motionPreference.matches;
      if (!paused && !motionPreference.matches) {
        time += dt;
        // Wrap each streak separately to avoid a full-field jump.
        for (let i = 0; i < positions.length; i += 6) {
          positions[i + 1] -= dt * .7; positions[i + 4] -= dt * .7;
          if (positions[i + 1] < -12.5) { positions[i + 1] += 25; positions[i + 4] += 25; }
        }
        rainGeometry.attributes.position.needsUpdate = true;
        dust.rotation.y = time * .012; orbit.rotation.z = time * .035;
        emblem.rotation.y += (pointer.x * .3 + chapter * .16 - emblem.rotation.y) * .04;
        emblem.rotation.x += (-pointer.y * .17 - emblem.rotation.x) * .04;
        emblem.position.y = base.y + Math.sin(time * .7) * .08;
        orbit.position.copy(emblem.position);
      }
      renderer.render(scene, camera);
    }
    cleanup = () => {
      if (disposed) return; disposed = true;
      cancelAnimationFrame(frameId); resize.disconnect(); intersection.disconnect();
      host.removeEventListener('pointermove', move); host.removeEventListener('pointerleave', resetPointer);
      window.removeEventListener('resize', layout);
      canvas.removeEventListener('webglcontextlost', lost); canvas.removeEventListener('webglcontextrestored', restored);
      scene.traverse(object => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => material.dispose());
      });
      texture.dispose(); renderer.dispose();
    };
    window.addEventListener('pagehide', event => { if (!event.persisted) cleanup(); });
    frameId = requestAnimationFrame(frame);
  }
}
