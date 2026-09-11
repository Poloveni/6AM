/* 6AM — galerie publique : les photos écrites dans accueil.html, suivies de
   celles postées par les membres depuis le QG. Clic = affichage en grand. */
(function () {
  const grid = document.getElementById('galerieGrid');
  if (!grid) return;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const lb = document.getElementById('lightbox'), img = document.getElementById('lbImg'), cap = document.getElementById('lbCap');
  let photos = [], cur = 0, lastFocus = null;

  function collect() {
    photos = [...grid.querySelectorAll('.galerie__item')].map((f, i) => {
      f.querySelector('button').dataset.i = i;
      return { url: f.dataset.photo, caption: f.dataset.caption || '', author: f.dataset.author || '', rank: f.dataset.rank || '' };
    });
  }
  function show(i) {
    cur = (i + photos.length) % photos.length; const p = photos[cur];
    img.src = p.url; img.alt = p.caption || 'Photo de la 6AM';
    cap.innerHTML = [p.caption && `<i>${esc(p.caption)}</i>`, p.author && `<b>${esc(p.author)}</b>${p.rank ? ` <span>${esc(p.rank)}</span>` : ''}`].filter(Boolean).join(' — ');
    if (lb.hidden) { lastFocus = document.activeElement; lb.hidden = false; document.body.style.overflow = 'hidden'; document.getElementById('lbClose').focus(); }
  }
  const close = () => { lb.hidden = true; document.body.style.overflow = ''; if (lastFocus) lastFocus.focus(); };
  document.getElementById('lbClose').onclick = close;
  document.getElementById('lbPrev').onclick = () => show(cur - 1);
  document.getElementById('lbNext').onclick = () => show(cur + 1);
  lb.addEventListener('click', e => { if (e.target === lb) close(); });
  addEventListener('keydown', e => { if (lb.hidden) return; if (e.key === 'Escape') close(); if (e.key === 'ArrowLeft') show(cur - 1); if (e.key === 'ArrowRight') show(cur + 1); });
  grid.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) show(Number(b.dataset.i)); });
  collect();

  // photos postées depuis le QG : ajoutées en tête de la galerie
  fetch('api/gallery?limit=48').then(r => r.ok ? r.json() : []).then(list => {
    if (!Array.isArray(list) || !list.length) return;
    grid.insertAdjacentHTML('afterbegin', list.map(p => `
      <figure class="galerie__item reveal is-in ${p.width > p.height * 1.4 ? 'is-wide' : ''}" data-photo="${esc(p.url.slice(1))}" data-caption="${esc(p.caption)}" data-author="${esc(p.author.displayName)}" data-rank="${esc(p.author.rankLabel)}">
        <button type="button" aria-label="Agrandir la photo${p.caption ? ' : ' + esc(p.caption) : ''}"><img src="${esc(p.thumb.slice(1))}" alt="${esc(p.caption)}" loading="lazy" width="${p.width}" height="${p.height}"></button>
        <figcaption>${p.caption ? `<i>${esc(p.caption)}</i>` : ''}<b>${esc(p.author.displayName)}</b></figcaption>
      </figure>`).join(''));
    collect();
  }).catch(() => {});
})();
