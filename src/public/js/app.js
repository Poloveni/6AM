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
