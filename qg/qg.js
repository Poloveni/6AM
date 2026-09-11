/* 6AM — le QG : outils partagés par toutes les pages de l'espace membres.
   - QG.api()     : appel au serveur (redirige vers la connexion si besoin)
   - QG.me()      : le membre connecté (et vérifie qu'il est validé)
   - QG.confirm() : fenêtre de confirmation
   - QG.toast()   : petit message en bas de l'écran
   - le menu du haut est ajouté automatiquement sur les pages qui ont
     <body data-page="...">                                             */
(function () {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function api(url, opt = {}) {
    const isForm = opt.body instanceof FormData;
    const r = await fetch(url, { credentials: 'same-origin', ...opt, headers: isForm ? opt.headers : { 'Content-Type': 'application/json', ...(opt.headers || {}) } });
    if (r.status === 401) { location.replace('./'); throw new Error('unauthenticated'); }
    const data = await r.json().catch(() => ({}));
    if (r.status === 403 && data.error === 'pending') { location.replace('attente.html'); throw new Error('pending'); }
    if (!r.ok) throw new Error(data.error || `Erreur ${r.status}`);
    return data;
  }

  // Le membre connecté. Par défaut, un compte non validé est envoyé vers la page d'attente.
  async function me({ approved = true } = {}) {
    const m = await api('../api/me');
    if (approved && m.status !== 'approved') { location.replace('attente.html'); throw new Error('pending'); }
    showNav(m);
    return m;
  }

  // ---------- menu du haut ----------
  const LINKS = [
    { page: 'profil', href: 'profil.html', label: 'Mon profil' },
    { page: 'membres', href: 'membres.html', label: 'Les membres' },
    { page: 'salon', href: 'salon.html', label: 'Le Salon', badge: true },
    { page: 'galerie', href: 'galerie.html', label: 'Galerie' },
    { page: 'dossier', href: 'dossier.html', label: 'Le Dossier' },
  ];
  function header(active) {
    const h = document.createElement('header');
    h.className = 'nav is-scrolled'; h.id = 'nav';
    const cur = p => p === active ? ' class="is-active" aria-current="page"' : '';
    h.innerHTML = `
      <a class="nav__brand" href="../accueil.html"><img src="../assets/logo-sm.webp" alt="" width="42" height="42"><span>6AM</span></a>
      <button class="nav__burger" id="burger" aria-label="Ouvrir le menu" aria-expanded="false" aria-controls="navLinks"><span></span><span></span><span></span></button>
      <nav class="nav__links qg-nav" id="navLinks" aria-label="Menu du QG">
        ${LINKS.map(l => `<a href="${l.href}"${cur(l.page)}>${l.label}${l.badge ? '<span class="nav__badge" id="chatBadge" hidden></span>' : ''}</a>`).join('')}
        <div class="nav__group" id="gestion" hidden>
          <button class="nav__group-btn ${['admin', 'hierarchie', 'bot'].includes(active) ? 'is-active' : ''}" type="button" aria-expanded="false" aria-controls="gestionMenu">Gestion <i>▾</i></button>
          <div class="nav__menu" id="gestionMenu">
            <a href="admin.html"${cur('admin')}>Administration</a>
            <a href="hierarchie.html" id="orgLink"${cur('hierarchie')} hidden>Hiérarchie du site</a>
            <a href="bot.html"${cur('bot')}>Le Bot</a>
          </div>
        </div>
        <a href="../accueil.html">Le site</a>
        <button class="nav__cta qg-logout" type="button" id="logout">Déconnexion</button>
      </nav>`;
    document.body.prepend(h);

    const burger = h.querySelector('#burger');
    const setOpen = open => { h.classList.toggle('is-open', open); burger.setAttribute('aria-expanded', open); burger.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu'); };
    burger.addEventListener('click', () => setOpen(!h.classList.contains('is-open')));

    const g = h.querySelector('#gestion'), gb = g.querySelector('.nav__group-btn');
    const closeG = () => { g.classList.remove('is-open'); gb.setAttribute('aria-expanded', 'false'); };
    gb.addEventListener('click', e => { e.stopPropagation(); const o = g.classList.toggle('is-open'); gb.setAttribute('aria-expanded', o); });
    document.addEventListener('click', e => { if (!g.contains(e.target)) closeG(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeG(); setOpen(false); } });

    h.querySelector('#logout').addEventListener('click', logout);
  }
  function showNav(m) {
    const g = document.getElementById('gestion'); if (!g || !m) return;
    if (m.isAdmin) g.hidden = false;
    if (m.isTop) document.getElementById('orgLink').hidden = false;
  }
  async function logout() {
    try { await fetch('../auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch {}
    location.href = './';
  }

  // ---------- pastille « non lus » sur Le Salon ----------
  async function unread() {
    const b = document.getElementById('chatBadge'); if (!b) return;
    try {
      const r = await fetch('../api/chat/unread', { credentials: 'same-origin' }); if (!r.ok) return;
      const d = await r.json();
      if (d.unread > 0) {
        b.textContent = d.unread > 99 ? '99+' : d.unread;
        b.classList.toggle('is-mention', d.mentions > 0);
        b.title = d.mentions ? `${d.mentions} mention${d.mentions > 1 ? 's' : ''} de toi` : `${d.unread} nouveau${d.unread > 1 ? 'x' : ''} message${d.unread > 1 ? 's' : ''}`;
        b.hidden = false;
      } else b.hidden = true;
    } catch {}
  }

  // ---------- fenêtre de confirmation (remplace window.confirm) ----------
  function confirm(message, { title = 'Confirmer', ok = 'Confirmer', cancel = 'Annuler', danger = false } = {}) {
    return new Promise(resolve => {
      const last = document.activeElement;
      const wrap = document.createElement('div');
      wrap.className = 'modal';
      wrap.innerHTML = `
        <div class="modal__box" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
          <p class="eyebrow">6AM</p>
          <h3 class="modal__title" id="modalTitle"></h3>
          <p class="modal__text"></p>
          <div class="modal__actions">
            <button class="btn btn--ghost" type="button" data-cancel></button>
            <button class="btn ${danger ? 'btn--ghost btn--danger' : 'btn--steel'}" type="button" data-ok></button>
          </div>
        </div>`;
      wrap.querySelector('.modal__title').textContent = title;
      wrap.querySelector('.modal__text').textContent = message;
      wrap.querySelector('[data-cancel]').textContent = cancel;
      wrap.querySelector('[data-ok]').textContent = ok;
      const close = v => { wrap.classList.remove('is-open'); setTimeout(() => wrap.remove(), 200); document.removeEventListener('keydown', onKey); if (last) last.focus(); resolve(v); };
      const onKey = e => { if (e.key === 'Escape') close(false); };
      wrap.querySelector('[data-cancel]').onclick = () => close(false);
      wrap.querySelector('[data-ok]').onclick = () => close(true);
      wrap.onclick = e => { if (e.target === wrap) close(false); };
      document.addEventListener('keydown', onKey);
      document.body.appendChild(wrap);
      requestAnimationFrame(() => { wrap.classList.add('is-open'); wrap.querySelector(danger ? '[data-cancel]' : '[data-ok]').focus(); });
    });
  }

  // ---------- petit message en bas de page ----------
  function toast(message, ok = true) {
    let t = document.getElementById('qgToast');
    if (!t) { t = document.createElement('div'); t.id = 'qgToast'; t.className = 'toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite'); document.body.appendChild(t); }
    t.textContent = message; t.classList.toggle('toast--error', !ok); t.classList.add('is-on');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('is-on'), ok ? 3200 : 5200);
  }

  const date = (d, opts = { day: 'numeric', month: 'long', year: 'numeric' }) => d ? new Date(d).toLocaleDateString('fr-FR', opts) : '—';
  const avatar = url => url || '../assets/logo-sm.webp';

  window.QG = { api, me, confirm, toast, esc, date, avatar, logout, unread };

  // qg.js est chargé en bas de page : le <body> existe déjà, on pose le menu tout de suite
  const page = document.body && document.body.dataset.page;
  if (page) {
    header(page);
    if (page !== 'salon') {            // le Salon gère lui-même ses non-lus
      unread(); setInterval(unread, 30000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) unread(); });
    }
  }
})();
