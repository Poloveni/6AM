/* ==========================================================
   6AM — page d'entree
   Passage direct si l'on est deja entre pendant la session,
   depart en fondu, et une poussiere d'etoiles bleu acier.
   ========================================================== */
(function () {
  'use strict';

  var CLE = '6am-entre';
  var SUITE = '/accueil';

  // Deja entre pendant cette session : on ne rejoue pas l'ecran.
  try {
    if (sessionStorage.getItem(CLE) && !location.hash) {
      location.replace(SUITE);
      return;
    }
  } catch (e) { /* navigation privee : on affiche l'ecran, sans plus */ }

  var ecran = document.getElementById('entree');
  var bouton = document.getElementById('entree-btn');
  if (!ecran || !bouton) return;

  function entrer(e) {
    if (e) e.preventDefault();
    try { sessionStorage.setItem(CLE, '1'); } catch (err) { /* sans consequence */ }
    ecran.classList.add('part');
    setTimeout(function () { location.href = SUITE; }, 620);
  }

  bouton.addEventListener('click', entrer);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      if (document.activeElement === bouton) return; // le clavier gere deja le lien
      entrer(e);
    }
  });

  // ---------- Poussiere d'etoiles ----------
  var cv = document.getElementById('entree-fx');
  if (!cv || !cv.getContext) return;
  var ctx = cv.getContext('2d');
  var doux = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var L = 0, H = 0, points = [];
  var souris = { x: -99999, y: -99999 };

  window.addEventListener('pointermove', function (e) {
    souris.x = e.clientX; souris.y = e.clientY;
  }, { passive: true });

  function grain(neuf) {
    var z = Math.random();
    return {
      x: Math.random() * L,
      y: neuf ? Math.random() * H : H + 10,
      z: z,
      r: 0.5 + z * 1.9,
      v: (0.10 + z * 0.42) * (doux ? 0.3 : 1),
      d: Math.random() * 6.28,
      a: 0.20 + z * 0.55,
    };
  }

  function dimensionner() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    L = window.innerWidth; H = window.innerHeight;
    cv.width = L * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    points = [];
    var n = Math.min(240, Math.round(L * H / 9000));
    for (var i = 0; i < n; i++) points.push(grain(true));
  }
  window.addEventListener('resize', dimensionner);
  dimensionner();

  var precedent = 0;
  (function dessiner(maintenant) {
    requestAnimationFrame(dessiner);
    var t = maintenant / 1000;
    var dt = Math.min((maintenant - precedent) / 1000, 0.05);
    precedent = maintenant;

    ctx.clearRect(0, 0, L, H);

    var halo = ctx.createRadialGradient(L / 2, H * 0.44, 0, L / 2, H * 0.44, Math.max(L, H) * 0.5);
    halo.addColorStop(0, 'rgba(90,140,195,' + (0.07 + Math.sin(t * 0.55) * 0.02) + ')');
    halo.addColorStop(0.5, 'rgba(50,85,130,.03)');
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, L, H);

    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      p.y -= p.v * 60 * dt;
      p.x += Math.sin(t * 0.6 + p.d) * 0.14 * p.z;

      var dx = p.x - souris.x, dy = p.y - souris.y, d2 = dx * dx + dy * dy;
      if (d2 < 22500 && d2 > 1) {
        var d = Math.sqrt(d2), f = (1 - d / 150) * 0.8;
        p.x += dx / d * f; p.y += dy / d * f;
      }
      if (p.y < -10) points[i] = grain(false);

      var scint = 0.6 + 0.4 * Math.sin(t * 1.8 + p.d * 3);
      ctx.fillStyle = 'rgba(' + Math.round(150 + p.z * 70) + ',' + Math.round(185 + p.z * 45) + ',225,' + (p.a * scint) + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.28); ctx.fill();

      if (p.z > 0.78) {
        ctx.fillStyle = 'rgba(160,200,240,' + (0.05 * scint) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 5, 0, 6.28); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  })(0);
})();
