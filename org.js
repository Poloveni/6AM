/* 6AM — organigramme + dossiers des membres, chargés depuis le QG (/api/org).
   Si le serveur ne répond pas (ex. site ouvert en fichier local), le contenu
   écrit dans accueil.html reste affiché. */
(function () {
  const chart = document.getElementById('org'), dossiers = document.getElementById('dossiers');
  if (!chart) return;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const src = p => p && p.startsWith('/') ? p.slice(1) : p;   // chemins relatifs : marche aussi en sous-dossier

  function card(e, label, tier) {
    return `<div class="rank rank--t${Math.min(tier, 3)} ${tier < 3 ? '' : 'rank--small'} ${e.is_open ? 'rank--open' : ''}">
      <span class="rank__title">${esc(label)}</span>
      <span class="rank__name">${esc(e.name)}</span>
      ${e.subtitle ? `<span class="rank__age">${esc(e.subtitle)}</span>` : ''}
    </div>`;
  }
  function dossier(e, label) {
    const [first, ...rest] = String(e.description || '').split('\n').map(s => s.trim()).filter(Boolean);
    return `<article class="dossier reveal is-in">
      <div class="dossier__photo">${e.photo ? `<img src="${esc(src(e.photo))}" alt="Portrait de ${esc(e.name)}" width="480" height="640" loading="lazy">` : '<span class="dossier__nophoto" aria-hidden="true">6AM</span>'}</div>
      <div class="dossier__body">
        <p class="dossier__label">Dossier · Confidentiel</p>
        <span class="rank-tag">${esc(label)}</span>
        <h3 class="dossier__name">${esc(e.name)}</h3>
        ${e.subtitle ? `<p class="dossier__meta">${esc(e.subtitle)}</p>` : ''}
        ${first ? `<p>${esc(first)}</p>` : ''}
        ${rest.length ? `<details><summary>Lire la suite</summary>${rest.map(p => `<p>${esc(p)}</p>`).join('')}</details>` : ''}
      </div>
    </article>`;
  }

  fetch('api/org').then(r => r.ok ? r.json() : null).then(data => {
    if (!data || !data.entries.length) return;
    const byRank = {}, labels = {};
    data.ranks.forEach(r => labels[r.value] = r.label);
    data.entries.forEach(e => (byRank[e.rank] = byRank[e.rank] || []).push(e));
    const parts = [];
    data.ranks.forEach(({ value, label }, tier) => {
      const list = byRank[value]; if (!list) return;
      if (parts.length) parts.push('<div class="org__line" aria-hidden="true"></div>');
      const row = !(tier < 3 && list.length === 1);
      parts.push(`<div class="org__tier ${row ? 'org__tier--row' : ''} reveal is-in">${list.map(e => card(e, label, tier)).join('')}</div>`);
      if (data.rankDesc[value]) parts.push(`<p class="org__desc reveal is-in">${esc(data.rankDesc[value])}</p>`);
    });
    chart.innerHTML = parts.join('');
    // dossiers : tous les membres sauf les postes à pourvoir, dans l'ordre de la hiérarchie
    if (dossiers) dossiers.innerHTML = data.entries.filter(e => !e.is_open).map(e => dossier(e, labels[e.rank])).join('');
  }).catch(() => {});
})();
