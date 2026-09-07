/* ==========================================================================
   6AM — Espace membres : deux micro-interactions, sans dependance.
     1. compteur anime sur les chiffres cles ;
     2. lueur tres diffuse qui suit la souris dans la zone centrale.
   Les deux respectent prefers-reduced-motion et ne font rien si la page
   n'est pas celle de l'espace membres.
   ========================================================================== */
(function () {
  'use strict';

  if (!document.body.classList.contains('page-app')) return;
  var doux = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------- compteur
  // Le texte peut valoir "11", "4 h", "12 500 $" : on isole le nombre, on
  // l'anime, et on le remet dans son habillage d'origine avec le meme
  // formatage francais (espaces insecables comprises).
  var MOTIF = /^(\D*?)([\d  \s]*\d)(.*)$/;

  function animerChiffre(el) {
    var brut = el.textContent.trim();
    var m = MOTIF.exec(brut);
    if (!m) return;

    var cible = parseInt(m[2].replace(/[^\d]/g, ''), 10);
    if (!isFinite(cible) || cible === 0) return;   // 0 : rien a animer

    var avant = m[1], apres = m[3];
    var duree = Math.min(900, 420 + Math.log10(cible + 1) * 170);
    var debut = null;

    el.style.minWidth = el.getBoundingClientRect().width + 'px';

    function pas(t) {
      if (debut === null) debut = t;
      var p = Math.min(1, (t - debut) / duree);
      var adouci = 1 - Math.pow(1 - p, 3);          // sortie cubique
      var v = Math.round(cible * adouci);
      el.textContent = avant + v.toLocaleString('fr-FR') + apres;
      if (p < 1) requestAnimationFrame(pas);
      else el.textContent = brut;                    // valeur exacte a la fin
    }
    el.textContent = avant + '0' + apres;
    requestAnimationFrame(pas);
  }

  var chiffres = document.querySelectorAll('.card.stat .stat-value');
  if (!doux && chiffres.length) {
    if (window.IntersectionObserver) {
      var io = new IntersectionObserver(function (entrees) {
        entrees.forEach(function (e) {
          if (!e.isIntersecting) return;
          animerChiffre(e.target);
          io.unobserve(e.target);
        });
      }, { threshold: 0.4 });
      chiffres.forEach(function (el) { io.observe(el); });
    } else {
      chiffres.forEach(animerChiffre);
    }
  }

  // ------------------------------------------------------------- lueur souris
  var zone = document.querySelector('.app-shell');
  if (!zone || doux || window.matchMedia('(hover: none)').matches) return;

  var x = 0, y = 0, enAttente = false;

  function appliquer() {
    enAttente = false;
    zone.style.setProperty('--mx', x + 'px');
    zone.style.setProperty('--my', y + 'px');
  }

  zone.addEventListener('pointermove', function (e) {
    // Le pseudo-element porteur de la lueur deborde de 40 px horizontalement
    // et 60 px verticalement : on decale d'autant pour viser juste.
    var r = zone.getBoundingClientRect();
    x = e.clientX - r.left + 40;
    y = e.clientY - r.top + 60;
    zone.classList.add('is-lit');
    if (!enAttente) { enAttente = true; requestAnimationFrame(appliquer); }
  }, { passive: true });

  zone.addEventListener('pointerleave', function () {
    zone.classList.remove('is-lit');
  });
})();
