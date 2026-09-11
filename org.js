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

  function card(e, r, tier) {
    return `<div class="rank rank--t${Math.min(tier, 3)} ${tier < 3 ? '' : 'rank--small'} ${e.is_open ? 'rank--open' : ''}">
      ${icon(r)}<span class="rank__title">${title(r)}</span>
      <span class="rank__name">${esc(e.name)}</span>
      ${e.subtitle ? `<span class="rank__age">${esc(e.subtitle)}</span>` : ''}
    </div>`;
  }
  fetch('api/org').then(r => r.ok ? r.json() : null).then(data => {
    if (!data || !data.entries.length) return;
    const byRank = {};
    data.entries.forEach(e => (byRank[e.rank] = byRank[e.rank] || []).push(e));
    const parts = [];
    data.ranks.forEach((r, tier) => {
      const value = r.value;
      const list = byRank[value]; if (!list) return;
      if (parts.length) parts.push('<div class="org__line" aria-hidden="true"></div>');
      const row = !(tier < 3 && list.length === 1);
      parts.push(`<div class="org__tier ${row ? 'org__tier--row' : ''} reveal is-in">${list.map(e => card(e, r, tier)).join('')}</div>`);
      if (data.rankDesc[value]) parts.push(`<p class="org__desc reveal is-in">${esc(data.rankDesc[value])}</p>`);
    });
    chart.innerHTML = parts.join('');
  }).catch(() => {});
})();
