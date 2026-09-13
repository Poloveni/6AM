/* 6AM — organigramme de la famille, chargé depuis le QG (/api/org).
   Si le serveur ne répond pas (ex. site ouvert en fichier local), le contenu
   écrit dans accueil.html reste affiché. */
(function () {
  const chart = document.getElementById('org');
  if (!chart) return;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // icône du grade (assets/grades.svg) et « correspondance » (ancien nom) en petit
  const icon = r => r.icon ? `<span class="rank__icon" aria-hidden="true"><svg><use href="assets/grades.svg#g-${esc(r.icon)}"></use></svg></span>` : '';
  const title = r => `${esc(r.label)}${r.alias ? ` <small>${esc(r.alias)}</small>` : ''}`;

  // « petite » carte dès qu'une ligne en compte plus de deux, pour éviter les retours à la ligne
  function card(e, r, tier, petite) {
    return `<div class="rank rank--t${Math.min(tier, 3)} ${petite ? 'rank--small' : ''} ${e.is_open ? 'rank--open' : ''}">
      ${icon(r)}<span class="rank__title">${title(r)}</span>
      <span class="rank__name">${esc(e.name)}</span>
      ${e.subtitle ? `<span class="rank__age">${esc(e.subtitle)}</span>` : ''}
      ${r.devise ? `<span class="rank__devise">${esc(r.devise)}</span>` : ''}
    </div>`;
  }
  fetch('api/org').then(r => r.ok ? r.json() : null).then(data => {
    if (!data || !data.entries.length) return;
    const byRank = {};
    data.entries.forEach(e => (byRank[e.rank] = byRank[e.rank] || []).push(e));
    // les grades portant le même numéro de ligne s'affichent côte à côte
    const lignes = [];
    data.ranks.forEach(r => {
      if (!byRank[r.value]) return;
      const derniere = lignes[lignes.length - 1];
      if (derniere && derniere.row === r.row) derniere.grades.push(r);
      else lignes.push({ row: r.row, grades: [r] });
    });
    const parts = [];
    lignes.forEach((ligne, tier) => {
      // ligne « de côté » (ex. les gérants) : le trait vertical la longe sans relier la ligne suivante
      const cote = ligne.grades.every(r => r.branche);
      const precedenteDeCote = tier > 0 && lignes[tier - 1].grades.every(r => r.branche);
      if (parts.length && !precedenteDeCote) parts.push('<div class="org__line" aria-hidden="true"></div>');
      const nb = ligne.grades.reduce((n, r) => n + byRank[r.value].length, 0);
      const cartes = ligne.grades.flatMap(r => byRank[r.value].map(e => card(e, r, tier, tier >= 3 || nb > 2)));
      const row = !(tier < 3 && cartes.length === 1);
      // barre horizontale : rattache les cases « de côté » au trait qui descend du grade du dessus
      const barre = cote ? '<span class="org__cote-bar" aria-hidden="true"></span>' : '';
      parts.push(`<div class="org__tier ${row ? 'org__tier--row' : ''} ${cote ? 'org__tier--cote' : ''} reveal is-in">${barre}${cartes.join('')}</div>`);
      ligne.grades.forEach(r => {
        if (data.rankDesc[r.value]) parts.push(`<p class="org__desc reveal is-in">${esc(data.rankDesc[r.value])}</p>`);
      });
    });
    chart.innerHTML = parts.join('');
    gravite.rafraichir();
  }).catch(() => {});

  /* « Centre de gravité » : un point doré au cœur de l'organigramme et des cases qui
     s'inclinent doucement vers la souris. Désactivé sans souris (tactile) et si le
     visiteur a demandé moins d'animations dans son système. */
  const gravite = (() => {
    const actif = matchMedia('(hover: hover) and (pointer: fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!actif) return { rafraichir() {} };
    const PORTEE = 520;      // distance (px) au-delà de laquelle une case ne bouge plus
    const AMPLITUDE = 14;    // déplacement maximal d'une case (px)
    const point = document.createElement('span');
    point.className = 'org__gravite';
    point.setAttribute('aria-hidden', 'true');
    let cartes = [];         // { el, x, y, dx, dy } — position de repos du centre, décalage courant
    let souris = null;       // position de la souris par rapport à l'organigramme, ou null
    let boucle = 0;
    let centre = { x: 0, y: 0 };

    // position de repos d'une case dans l'organigramme, sans tenir compte des animations en cours
    function repos(el) {
      let x = el.offsetWidth / 2, y = el.offsetHeight / 2;
      for (let n = el; n && n !== chart; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; }
      return { x, y };
    }
    function rafraichir() {
      if (!point.isConnected) chart.appendChild(point);
      centre = { x: chart.offsetWidth / 2, y: chart.offsetHeight / 2 };
      const anciens = new Map(cartes.map(c => [c.el, c]));
      cartes = [...chart.querySelectorAll('.rank')].map(el => {
        const a = anciens.get(el);
        return { el, ...repos(el), dx: a ? a.dx : 0, dy: a ? a.dy : 0 };
      });
      point.style.left = `${centre.x}px`;
      point.style.top = `${centre.y}px`;
    }
    function animer() {
      let mouvement = false;
      for (const c of cartes) {
        let tx = 0, ty = 0;
        if (souris) {
          const ex = souris.x - c.x, ey = souris.y - c.y;
          const dist = Math.hypot(ex, ey) || 1;
          const force = Math.max(0, 1 - dist / PORTEE);
          const f = AMPLITUDE * force * force;   // les cases proches bougent, les lointaines à peine
          tx = ex / dist * f; ty = ey / dist * f;
        }
        c.dx += (tx - c.dx) * 0.12; c.dy += (ty - c.dy) * 0.12;
        if (Math.abs(c.dx) + Math.abs(c.dy) > 0.05) mouvement = true;
        c.el.style.transform = `translate(${c.dx.toFixed(2)}px,${c.dy.toFixed(2)}px)`;
      }
      if (!mouvement && !souris) cartes.forEach(c => { c.dx = c.dy = 0; c.el.style.transform = ''; });
      // le point glisse d'un cinquième du chemin vers la souris, sans jamais s'éloigner de plus de 90px
      const cible = souris ? { x: (souris.x - centre.x) * 0.2, y: (souris.y - centre.y) * 0.2 } : { x: 0, y: 0 };
      const norme = Math.hypot(cible.x, cible.y);
      if (norme > 90) { cible.x *= 90 / norme; cible.y *= 90 / norme; }
      const gx = parseFloat(chart.style.getPropertyValue('--gx')) || 0, gy = parseFloat(chart.style.getPropertyValue('--gy')) || 0;
      const nx = gx + (cible.x - gx) * 0.1, ny = gy + (cible.y - gy) * 0.1;
      chart.style.setProperty('--gx', `${nx.toFixed(2)}px`); chart.style.setProperty('--gy', `${ny.toFixed(2)}px`);
      if (Math.abs(nx - cible.x) + Math.abs(ny - cible.y) > 0.05) mouvement = true;
      chart.classList.toggle('org--attire', !!souris);
      boucle = mouvement || souris ? requestAnimationFrame(animer) : 0;
    }
    const lancer = () => { if (!boucle) boucle = requestAnimationFrame(animer); };
    chart.addEventListener('pointerenter', rafraichir);   // au cas où la page ait bougé (police chargée, redimensionnement…)
    chart.addEventListener('pointermove', e => {
      const base = chart.getBoundingClientRect();
      souris = { x: e.clientX - base.left, y: e.clientY - base.top };
      lancer();
    });
    chart.addEventListener('pointerleave', () => { souris = null; lancer(); });
    addEventListener('resize', () => { souris = null; rafraichir(); }, { passive: true });
    rafraichir();
    return { rafraichir };
  })();
})();
