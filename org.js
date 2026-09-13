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
  }).catch(() => {});
})();
