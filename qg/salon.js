/* 6AM — le Salon : discussion en direct entre membres.
   Les nouveaux messages arrivent sans recharger la page (Server-Sent Events). */
(function () {
  const $ = id => document.getElementById(id), esc = QG.esc;
  const log = $('log'), input = $('input');
  let me, oldest = null, lastDay = null, lastAuthor = null, members = [], es;

  const time = d => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const day = d => new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const isMentioned = c => new RegExp('@(' + [me.displayName, me.username].filter(Boolean).map(escapeRe).join('|') + ')(?![\\w-])', 'i').test(c);
  // liens cliquables + @mentions en surbrillance (le texte est échappé AVANT)
  let mentionRe = null;   // construit à partir des noms des membres (les plus longs d'abord)
  const format = s => {
    let h = esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    if (mentionRe) h = h.replace(mentionRe, (all, n) => `<span class="mention">@${n}</span>`);
    return h;
  };

  const atBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  const scrollDown = () => { log.scrollTop = log.scrollHeight; };

  function msgHtml(m, grouped) {
    const mine = m.author.id === me.id, canDel = mine || me.isAdmin;
    return `<article class="msg ${mine ? 'msg--mine' : ''} ${grouped ? 'msg--grouped' : ''} ${!mine && isMentioned(m.content) ? 'msg--mention' : ''}" data-id="${m.id}">
      <img class="msg__avatar" src="${esc(QG.avatar(m.author.avatarUrl))}" alt="">
      <div class="msg__body">
        <header class="msg__head"><b class="msg__name">${esc(m.author.displayName)}</b><span class="msg__rank" data-tier="${m.author.tier}">${esc(m.author.rankLabel)}</span><time datetime="${esc(m.createdAt)}">${time(m.createdAt)}</time>${canDel ? `<button class="msg__del" type="button" data-del="${m.id}" aria-label="Supprimer ce message">✕</button>` : ''}</header>
        <p class="msg__text">${format(m.content)}</p>
      </div>
    </article>`;
  }
  const dayHtml = d => `<div class="chat__day"><span>${day(d)}</span></div>`;

  function append(m) {
    $('empty').hidden = true;
    const stick = atBottom();
    const d = new Date(m.createdAt).toDateString();
    let html = '';
    if (d !== lastDay) { html += dayHtml(m.createdAt); lastDay = d; lastAuthor = null; }
    html += msgHtml(m, lastAuthor === m.author.id);
    lastAuthor = m.author.id;
    log.insertAdjacentHTML('beforeend', html);
    if (stick || m.author.id === me.id) scrollDown();
    markRead(m.id);
  }
  function prepend(list) {
    if (!list.length) { $('more').hidden = true; return; }
    const prevHeight = log.scrollHeight;
    let html = '', prevDay = null, prevAuthor = null;
    for (const m of list) {
      const d = new Date(m.createdAt).toDateString();
      if (d !== prevDay) { html += dayHtml(m.createdAt); prevDay = d; prevAuthor = null; }
      html += msgHtml(m, prevAuthor === m.author.id); prevAuthor = m.author.id;
    }
    $('more').insertAdjacentHTML('afterend', html);
    oldest = list[0].id;
    $('more').hidden = list.length < 60;
    log.scrollTop += log.scrollHeight - prevHeight;
  }

  // messages lus (pour la pastille du menu)
  let lastMarked = 0, markTimer = null;
  function markRead(id) {
    if (document.hidden || id <= lastMarked) return;
    lastMarked = id; clearTimeout(markTimer);
    markTimer = setTimeout(() => QG.api('../api/chat/read', { method: 'POST', body: JSON.stringify({ lastId: id }) }).catch(() => {}), 400);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    const all = log.querySelectorAll('.msg'); const last = all[all.length - 1];
    if (last) { lastMarked = 0; markRead(Number(last.dataset.id)); }
  });

  function renderOnline(list) {
    $('onlineCount').textContent = list.length;
    $('online').innerHTML = list.map(u => `<li><img src="${esc(QG.avatar(u.avatarUrl))}" alt=""><span>${esc(u.displayName)}</span><i data-tier="${u.tier}">${esc(u.rankLabel)}</i></li>`).join('');
  }

  function connect() {
    es = new EventSource('../api/chat/stream');
    es.onopen = () => { $('status').hidden = true; };
    es.onerror = () => { $('status').hidden = false; $('status').textContent = 'Connexion perdue, nouvelle tentative…'; };
    es.addEventListener('message', e => append(JSON.parse(e.data)));
    es.addEventListener('presence', e => renderOnline(JSON.parse(e.data)));
    es.addEventListener('delete', e => { const { id } = JSON.parse(e.data); const el = log.querySelector(`[data-id="${id}"]`); if (el) el.remove(); });
  }

  async function init() {
    me = await QG.me();
    members = await QG.api('../api/chat/mentions').catch(() => []);
    const names = [...new Set(members.flatMap(u => [u.name, u.username]))].filter(Boolean).sort((a, b) => b.length - a.length).map(n => escapeRe(esc(n)));
    if (names.length) mentionRe = new RegExp('@(' + names.join('|') + ')(?![\\w-])', 'gi');
    const first = await QG.api('../api/chat/messages');
    first.forEach(append);
    if (first.length) { oldest = first[0].id; $('more').hidden = first.length < 60; } else $('empty').hidden = false;
    scrollDown();
    connect();
    input.focus();
  }

  async function send() {
    const content = input.value.trim();
    if (!content) return;
    input.value = ''; input.style.height = '';
    try { await QG.api('../api/chat/messages', { method: 'POST', body: JSON.stringify({ content }) }); }
    catch (e) { input.value = content; QG.toast('Message non envoyé : ' + e.message, false); }
  }
  $('form').addEventListener('submit', e => { e.preventDefault(); send(); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
  input.addEventListener('input', () => { input.style.height = ''; input.style.height = Math.min(input.scrollHeight, 160) + 'px'; autocomplete(); });

  // autocomplétion des @mentions
  const ac = document.createElement('div'); ac.className = 'chat__ac'; ac.hidden = true; $('form').appendChild(ac);
  let acItems = [], acIdx = 0, acStart = -1;
  function autocomplete() {
    const v = input.value.slice(0, input.selectionStart);
    const m = v.match(/(?:^|\s)@([^\s@]{0,30})$/);
    if (!m) { ac.hidden = true; return; }
    acStart = v.length - m[1].length - 1;
    const q = m[1].toLowerCase();
    acItems = members.filter(u => u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q)).slice(0, 8);
    if (!acItems.length) { ac.hidden = true; return; }
    acIdx = 0;
    ac.innerHTML = acItems.map((u, i) => `<button type="button" data-i="${i}" class="${i === 0 ? 'is-on' : ''}"><span>${esc(u.name)}</span><small>@${esc(u.username)}</small></button>`).join('');
    ac.hidden = false;
  }
  function pickMention(i) {
    const u = acItems[i]; if (!u) return;
    const after = input.value.slice(input.selectionStart);
    input.value = input.value.slice(0, acStart) + '@' + u.name + ' ' + after;
    const pos = acStart + u.name.length + 2; input.setSelectionRange(pos, pos); input.focus(); ac.hidden = true;
  }
  ac.addEventListener('mousedown', e => { e.preventDefault(); const b = e.target.closest('[data-i]'); if (b) pickMention(Number(b.dataset.i)); });
  input.addEventListener('keydown', e => {
    if (ac.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); acIdx = (acIdx + (e.key === 'ArrowDown' ? 1 : -1) + acItems.length) % acItems.length; [...ac.children].forEach((b, i) => b.classList.toggle('is-on', i === acIdx)); }
    else if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); pickMention(acIdx); }
    else if (e.key === 'Escape') ac.hidden = true;
  }, true);

  $('more').addEventListener('click', async () => prepend(await QG.api('../api/chat/messages?before=' + oldest)));
  log.addEventListener('click', async e => {
    const b = e.target.closest('[data-del]'); if (!b) return;
    if (await QG.confirm('Ce message sera retiré du Salon pour tout le monde.', { title: 'Supprimer ce message ?', ok: 'Supprimer', danger: true }))
      QG.api('../api/chat/messages/' + b.dataset.del, { method: 'DELETE' }).catch(err => QG.toast(err.message, false));
  });
  addEventListener('pagehide', () => es && es.close());
  init().catch(() => {});
})();
