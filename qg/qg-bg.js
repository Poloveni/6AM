/* 6AM — fond animé du QG : poussière argentée derrière le contenu (canvas 2D) */
(function () {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const soft = document.body.dataset.fx === 'soft';          // version discrète (Salon)
  const cv = document.createElement('canvas');
  cv.className = 'qg-fx'; cv.setAttribute('aria-hidden', 'true');
  document.body.prepend(cv);
  const ctx = cv.getContext('2d');
  let W, H, P = [];
  const mouse = { x: -1e4, y: -1e4 };
  addEventListener('pointermove', e => { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
  const mk = init => { const z = Math.random(); return { x: Math.random() * W, y: init ? Math.random() * H : H + 10, z, r: .5 + z * 2, v: (.1 + z * .45) * (reduce ? .3 : 1), sw: Math.random() * 6.28, a: (.2 + z * .55) * (soft ? .5 : 1), hue: 212 + Math.random() * 16 }; };
  function resize() {
    const dpr = Math.min(devicePixelRatio, 2);
    W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    P = []; const n = Math.round(W * H / (soft ? 16000 : 9000)); for (let i = 0; i < n; i++) P.push(mk(true));
  }
  addEventListener('resize', resize); resize();
  let last = 0, visible = true;
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; });
  function draw(now) {
    requestAnimationFrame(draw);
    if (!visible) return;
    const t = now / 1000, dt = Math.min((now - last) / 1000, .05); last = now;
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (const p of P) {
      p.y -= p.v * 60 * dt; p.x += Math.sin(t * .7 + p.sw) * .15 * p.z;
      const dx = p.x - mouse.x, dy = p.y - mouse.y, d2 = dx * dx + dy * dy;
      if (d2 < 25600 && d2 > 1) { const d = Math.sqrt(d2), f = (1 - d / 160) * .9; p.x += dx / d * f; p.y += dy / d * f; }
      if (p.y < -10) Object.assign(p, mk(false));
      const tw = .6 + .4 * Math.sin(t * 2 + p.sw * 3);
      ctx.fillStyle = `hsla(${p.hue},45%,${62 + p.z * 25}%,${p.a * tw})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.28); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  requestAnimationFrame(draw);
})();
