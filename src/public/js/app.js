/* ==========================================================
   6AM — interactions communes (aucune dependance)
   ========================================================== */
(function () {
  'use strict';

  // --- Menu mobile ---
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('.nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', nav.classList.contains('is-open') ? 'true' : 'false');
    });
  }

  // --- Confirmation en ligne (pas de fenetre modale navigateur) ---
  document.querySelectorAll('[data-confirm]').forEach(function (btn) {
    var original = btn.textContent;
    var armed = false;
    var timer = null;

    btn.addEventListener('click', function (e) {
      if (armed) return;             // 2e clic : on laisse partir la soumission
      e.preventDefault();
      armed = true;
      btn.textContent = btn.getAttribute('data-confirm') || 'Confirmer ?';
      btn.classList.add('btn-danger');
      timer = setTimeout(function () {
        armed = false;
        btn.textContent = original;
        btn.classList.remove('btn-danger');
      }, 4000);
    });

    btn.addEventListener('blur', function () {
      if (!armed) return;
      clearTimeout(timer);
      armed = false;
      btn.textContent = original;
      btn.classList.remove('btn-danger');
    });
  });

  // --- Disparition automatique des alertes ---
  document.querySelectorAll('.alert[data-auto-hide]').forEach(function (el) {
    setTimeout(function () {
      el.style.transition = 'opacity .4s';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 420);
    }, 5000);
  });

  // --- Soumission automatique des filtres ---
  document.querySelectorAll('[data-auto-submit]').forEach(function (el) {
    el.addEventListener('change', function () { el.form && el.form.submit(); });
  });
})();

/* ==========================================================
   Vitrine : nav collante, ancre active, apparition au defilement
   ========================================================== */
(function () {
  'use strict';
  var header = document.getElementById('site-header');
  if (!header) return;

  // --- Fond plein des que l'on quitte le haut de page ---
  var onScroll = function () {
    header.classList.toggle('is-scrolled', (window.scrollY || 0) > 40);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // --- Apparition des sections ---
  var reveals = document.querySelectorAll('.reveal');
  if (!window.IntersectionObserver) {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -60px 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  }

  // --- Ancre active dans la navigation ---
  var liens = [].slice.call(document.querySelectorAll('.nav a[data-anchor]'));
  var cibles = liens
    .map(function (a) { return document.getElementById(a.dataset.anchor); })
    .filter(Boolean);
  if (!cibles.length || !window.IntersectionObserver) return;

  var spy = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      liens.forEach(function (a) {
        a.classList.toggle('is-active', a.dataset.anchor === entry.target.id);
      });
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  cibles.forEach(function (el) { spy.observe(el); });
})();

/* ==========================================================
   Vitrine : parallaxe tres legere sur les couches decoratives
   Quelques pixels seulement, uniquement pour donner de la
   profondeur. Aucune dependance, aucune animation permanente :
   on ne calcule que pendant le defilement et seulement pour
   les elements visibles.
   ========================================================== */
(function () {
  'use strict';
  var couches = [].slice.call(document.querySelectorAll('[data-parallaxe]'));
  if (!couches.length) return;

  var doux = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  if (doux && doux.matches) return;

  var visibles = couches;
  if (window.IntersectionObserver) {
    visibles = [];
    var io = new IntersectionObserver(function (entrees) {
      entrees.forEach(function (e) {
        var i = visibles.indexOf(e.target);
        if (e.isIntersecting && i === -1) visibles.push(e.target);
        else if (!e.isIntersecting && i !== -1) visibles.splice(i, 1);
      });
    }, { rootMargin: '120px 0px' });
    couches.forEach(function (el) { io.observe(el); });
  }

  var enAttente = false;
  function placer() {
    enAttente = false;
    var h = window.innerHeight || 1;
    visibles.forEach(function (el) {
      var r = el.getBoundingClientRect();
      // -1 quand l'element est en bas de l'ecran, +1 quand il est en haut
      var t = ((h / 2) - (r.top + r.height / 2)) / h;
      var amplitude = parseFloat(el.getAttribute('data-parallaxe')) || 10;
      el.style.transform = 'translate3d(0,' + (t * amplitude).toFixed(2) + 'px,0)';
    });
  }
  function auDefilement() {
    if (enAttente) return;
    enAttente = true;
    requestAnimationFrame(placer);
  }

  window.addEventListener('scroll', auDefilement, { passive: true });
  window.addEventListener('resize', auDefilement, { passive: true });
  placer();
})();
