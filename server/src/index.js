/* 6AM — serveur : site vitrine + le QG (espace membres)
   Express + PostgreSQL + connexion Discord (OAuth2) */
import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import connectPg from 'connect-pg-simple';
import pg from 'pg';
import crypto from 'node:crypto';
import { readFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import multer from 'multer';
import sharp from 'sharp';
import { RANKS as RANK_SEED, RANK_RENAMES, OPEN_SEED, ORG_SEED, RANK_DESC_SEED, BOOTSTRAP_RANK as BOOT } from './ranks.js';
import { createBotBridge } from './bot.js';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');            // racine du dépôt (index.html, styles.css, qg/…)
const {
  PORT = 3000, BASE_URL, SESSION_SECRET, POSTGRES_PASSWORD,
  DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_GUILD_ID,
  DISCORD_ROLE_MAP = '', ADMIN_DISCORD_IDS = '',
} = process.env;
// En Docker, la base s'appelle « sixam-db » et seul POSTGRES_PASSWORD est fourni.
const DATABASE_URL = process.env.DATABASE_URL || (POSTGRES_PASSWORD && `postgres://sixam:${encodeURIComponent(POSTGRES_PASSWORD)}@sixam-db:5432/sixam`);
if (!DATABASE_URL) { console.error('Variable manquante dans .env : DATABASE_URL (ou POSTGRES_PASSWORD)'); process.exit(1); }
for (const k of ['BASE_URL', 'SESSION_SECRET', 'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_GUILD_ID'])
  if (!process.env[k]) { console.error(`Variable manquante dans .env : ${k}`); process.exit(1); }
if (SESSION_SECRET.length < 32 || SESSION_SECRET === 'change-me') { console.error('SESSION_SECRET est trop court : génère-le avec  openssl rand -hex 32'); process.exit(1); }

// ---------- Grades ----------
// Ils vivent dans la table « ranks » (modifiables depuis le QG → Gestion → Grades).
// RANK_ROWS est le cache mémoire, rechargé à chaque modification.
let RANK_ROWS = [];
const rankValues = () => RANK_ROWS.map(r => r.value);
const rankRow = v => RANK_ROWS.find(r => r.value === v) || null;
const rankLabel = v => rankRow(v)?.label || v;
const rankExtra = v => ({ rankAlias: rankRow(v)?.alias || '', rankIcon: rankRow(v)?.icon || '', rankDevise: rankRow(v)?.devise || '' });
const isAdminRank = v => !!rankRow(v)?.is_admin;
const isTopRank = v => !!rankRow(v)?.is_top;
const publicRanks = () => RANK_ROWS.filter(r => !r.hidden);
const defaultRank = () => RANK_ROWS.length ? RANK_ROWS[RANK_ROWS.length - 1].value : 'recrue';   // nouveaux comptes
const bootstrapRank = () => (rankRow(BOOT) ? BOOT : (RANK_ROWS[0]?.value || 'lead'));
async function reloadRanks() {
  const { rows } = await pool.query('SELECT value, label, alias, icon, devise, row_index, sort_index, is_admin, is_top, hidden FROM ranks ORDER BY row_index, sort_index, value');
  RANK_ROWS = rows;
}

const roleMap = Object.fromEntries(DISCORD_ROLE_MAP.split(',').filter(Boolean).map(p => p.split(':').map(s => s.trim())));
const adminIds = new Set(ADMIN_DISCORD_IDS.split(',').map(s => s.trim()).filter(Boolean));

// ---------- Base de données ----------
const pool = new pg.Pool({ connectionString: DATABASE_URL });
pool.on('error', e => console.error('PostgreSQL :', e.message));
await pool.query(readFileSync(join(here, '..', 'sql', 'schema.sql'), 'utf8'));   // idempotent

// grades : remplis depuis ranks.js au premier démarrage, puis pilotés depuis le QG
if (!(await pool.query('SELECT 1 FROM ranks LIMIT 1')).rowCount) {
  for (const [i, r] of RANK_SEED.entries())
    await pool.query('INSERT INTO ranks (value, label, alias, icon, devise, row_index, sort_index, is_admin, is_top, hidden) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [r.value, r.label, r.alias || '', r.icon || '', r.devise || '', r.row ?? i, i, !!r.admin, !!r.top, !!r.hidden]);
} else {
  // grades ajoutés dans ranks.js après coup (mise à jour du site) : on les crée s'ils manquent
  for (const [i, r] of RANK_SEED.entries())
    await pool.query('INSERT INTO ranks (value, label, alias, icon, devise, row_index, sort_index, is_admin, is_top, hidden) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (value) DO NOTHING',
      [r.value, r.label, r.alias || '', r.icon || '', r.devise || '', r.row ?? i, i, !!r.admin, !!r.top, !!r.hidden]);
}
await reloadRanks();
// grades disparus : on reclasse les membres et les fiches qui les portaient encore
for (const [ancien, nouveau] of Object.entries(RANK_RENAMES)) {
  if (rankRow(ancien) || !rankRow(nouveau)) continue;
  const m = await pool.query('UPDATE members SET rank = $2 WHERE rank = $1', [ancien, nouveau]);
  const o = await pool.query('UPDATE org_entries SET rank = $2 WHERE rank = $1', [ancien, nouveau]);
  await pool.query('DELETE FROM org_rank_desc WHERE rank = $1', [ancien]);
  if (m.rowCount || o.rowCount) console.log(`Grade « ${ancien} » supprimé : ${m.rowCount} membre(s) et ${o.rowCount} fiche(s) passés à « ${nouveau} »`);
}
// organigramme de départ si la base est neuve
if (!(await pool.query('SELECT 1 FROM org_entries LIMIT 1')).rowCount) {
  const pos = {};
  for (const e of ORG_SEED) {
    pos[e.rank] = (pos[e.rank] ?? -1) + 1;
    await pool.query('INSERT INTO org_entries (rank, name, subtitle, description, photo, is_open, position) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [e.rank, e.name, e.subtitle || null, e.description || null, e.photo || null, !!e.open, pos[e.rank]]);
  }
  for (const [rank, d] of Object.entries(RANK_DESC_SEED))
    await pool.query('INSERT INTO org_rank_desc (rank, description) VALUES ($1,$2) ON CONFLICT (rank) DO NOTHING', [rank, d]);
}
// postes laissés vacants (« à pourvoir ») : créés seulement si le grade n'a encore aucune fiche
for (const o of OPEN_SEED) {
  if (!rankRow(o.rank)) continue;
  if ((await pool.query('SELECT 1 FROM org_entries WHERE rank = $1 LIMIT 1', [o.rank])).rowCount) continue;
  await pool.query('INSERT INTO org_entries (rank, name, is_open, position) VALUES ($1,$2,TRUE,0)', [o.rank, o.name]);
}

const app = express();
app.set('trust proxy', 1);                     // derrière Caddy
app.disable('x-powered-by');
app.use((_req, res, next) => {                 // en-têtes de sécurité de base
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' });
  next();
});
app.use(express.json({ limit: '32kb' }));
app.use((req, _res, next) => { req.body ??= {}; next(); });   // Express 5 : pas de corps = objet vide
app.use(session({
  store: new (connectPg(session))({ pool, tableName: 'session' }),
  name: 'sixam.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: BASE_URL.startsWith('https'), maxAge: 30 * 24 * 3600 * 1000 },
}));

// Protection simple contre les requêtes envoyées depuis un autre site
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin && origin !== new URL(BASE_URL).origin) return res.status(403).json({ error: 'origine refusée' });
  next();
});

// petite limite anti-spam en mémoire : n actions par fenêtre, par membre et par type
const hits = new Map();
const limit = (key, n, ms) => (req, res, next) => {
  const k = `${key}:${req.session.memberId || req.ip}`, now = Date.now();
  const list = (hits.get(k) || []).filter(t => now - t < ms);
  if (list.length >= n) return res.status(429).json({ error: 'Doucement — réessaie dans quelques secondes.' });
  list.push(now); hits.set(k, list); next();
};
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some(t => now - t < 600000)) hits.delete(k); }, 600000).unref();

// ---------- Connexion Discord ----------
const DISCORD_API = 'https://discord.com/api/v10';
// Adresse de retour déclarée dans le portail Discord (OAuth2 → Redirects).
// Par défaut /auth/discord/callback ; DISCORD_REDIRECT_PATH permet de réutiliser
// une adresse déjà enregistrée (ex. /connexion/discord/retour de l'ancien site).
const CALLBACK_PATH = /^\/[\w\-/]+$/.test(process.env.DISCORD_REDIRECT_PATH || '') ? process.env.DISCORD_REDIRECT_PATH : '/auth/discord/callback';
const REDIRECT_URI = `${BASE_URL}${CALLBACK_PATH}`;
const SCOPES = 'identify guilds.members.read';

app.get('/auth/discord', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;
  const url = new URL(`${DISCORD_API}/oauth2/authorize`);
  url.search = new URLSearchParams({ client_id: DISCORD_CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code', scope: SCOPES, state, prompt: 'none' });
  req.session.save(() => res.redirect(url.toString()));
});

app.get([...new Set(['/auth/discord/callback', CALLBACK_PATH])], async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error || !code || !req.session.oauthState || state !== req.session.oauthState) return res.redirect('/qg/?error=oauth');
    delete req.session.oauthState;

    // 1. code -> jeton d'accès
    const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: DISCORD_CLIENT_ID, client_secret: DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }),
    });
    if (!tokenRes.ok) return res.redirect('/qg/?error=token');
    const { access_token } = await tokenRes.json();
    const auth = { headers: { Authorization: `Bearer ${access_token}` } };

    // 2. identité Discord
    const user = await (await fetch(`${DISCORD_API}/users/@me`, auth)).json();
    if (!user.id) return res.redirect('/qg/?error=token');

    // 3. le compte doit être sur le serveur Discord de 6AM (+ lecture de ses rôles)
    const memberRes = await fetch(`${DISCORD_API}/users/@me/guilds/${DISCORD_GUILD_ID}/member`, auth);
    if (!memberRes.ok) return res.redirect('/qg/?error=not-member');
    const member = await memberRes.json();
    const rankFromRole = rankValues().find(r => (member.roles || []).some(id => roleMap[id] === r));   // grade le plus élevé trouvé

    // 4. enregistrement — un nouveau compte attend la validation d'un admin ;
    //    les IDs de ADMIN_DISCORD_IDS sont validés d'office (pour démarrer)
    const bootstrap = adminIds.has(user.id);
    const { rows: [row] } = await pool.query(`
      INSERT INTO members (discord_id, username, avatar, display_name, rank, is_admin, status, approved_at, last_login)
      VALUES ($1, $2, $3, $4, COALESCE($5::text, $7::text), $6::boolean, $8::text, CASE WHEN $8::text = 'approved' THEN now() END, now())
      ON CONFLICT (discord_id) DO UPDATE SET
        username = EXCLUDED.username,
        avatar = EXCLUDED.avatar,
        rank = CASE WHEN $6::boolean AND members.rank = $9::text THEN $10::text ELSE COALESCE($5::text, members.rank) END,
        is_admin = members.is_admin OR EXCLUDED.is_admin,
        status = CASE WHEN $6::boolean THEN 'approved' ELSE members.status END,
        last_login = now()
      RETURNING id, status`,
      [user.id, user.username, user.avatar, (member.nick || user.global_name || user.username).slice(0, 64), rankFromRole || null,
       bootstrap, bootstrap ? bootstrapRank() : defaultRank(), bootstrap ? 'approved' : 'pending', defaultRank(), bootstrapRank()]);

    req.session.regenerate(err => {             // nouvelle session à chaque connexion
      if (err) { console.error(err); return res.redirect('/qg/?error=server'); }
      req.session.memberId = row.id;
      req.session.save(() => res.redirect(row.status === 'approved' ? '/qg/profil.html' : '/qg/attente.html'));
    });
  } catch (e) {
    console.error(e);
    res.redirect('/qg/?error=server');
  }
});

app.post('/auth/logout', (req, res) => req.session.destroy(() => res.clearCookie('sixam.sid').json({ ok: true })));

// ---------- Outils communs ----------
const canAdmin = m => m.is_admin || isAdminRank(m.rank);
const isTop = m => isTopRank(m.rank);
const requireAuth = (req, res, next) => req.session.memberId ? next() : res.status(401).json({ error: 'unauthenticated' });
// charge le membre connecté et exige un compte validé
const requireApproved = async (req, res, next) => {
  try {
    const { rows: [m] } = await pool.query('SELECT * FROM members WHERE id = $1', [req.session.memberId]);
    if (!m) return req.session.destroy(() => res.status(401).json({ error: 'unauthenticated' }));
    if (m.status !== 'approved') return res.status(403).json({ error: 'pending', status: m.status });
    req.member = m; next();
  } catch (e) { next(e); }
};
const requireAdmin = (req, res, next) => canAdmin(req.member) ? next() : res.status(403).json({ error: 'forbidden' });
const requireTop = (req, res, next) => isTop(req.member) ? next() : res.status(403).json({ error: 'top-only' });
// niveau du grade pour l'affichage : 0 = Lord / Duke / Dev Web, 1 = autres admins, 2 = les autres
const tierOf = r => isTopRank(r) ? 0 : isAdminRank(r) ? 1 : 2;
const avatarUrl = m => m.avatar ? `https://cdn.discordapp.com/avatars/${m.discord_id}/${m.avatar}.${m.avatar.startsWith('a_') ? 'gif' : 'png'}?size=256` : null;
const publicMember = m => ({
  id: m.id, discordId: m.discord_id, username: m.username, avatarUrl: avatarUrl(m),
  displayName: m.display_name || m.username, rank: m.rank, rankLabel: rankLabel(m.rank), ...rankExtra(m.rank), tier: tierOf(m.rank), bio: m.bio, phoneRp: m.phone_rp,
  isAdmin: canAdmin(m), isTop: isTop(m), status: m.status, joinedAt: m.joined_at, lastLogin: m.last_login, approvedAt: m.approved_at,
});
// les routes async renvoient leurs erreurs au gestionnaire commun (Express 5 le fait aussi)
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------- Mon profil ----------
app.get('/api/me', requireAuth, wrap(async (req, res) => {
  const { rows: [m] } = await pool.query('SELECT * FROM members WHERE id = $1', [req.session.memberId]);
  if (!m) return req.session.destroy(() => res.status(401).json({ error: 'unauthenticated' }));
  res.json(publicMember(m));
}));

app.patch('/api/me', requireAuth, requireApproved, wrap(async (req, res) => {
  const displayName = String(req.body.displayName ?? '').trim().slice(0, 64);
  const bio = String(req.body.bio ?? '').trim().slice(0, 600);
  const phoneRp = String(req.body.phoneRp ?? '').trim().slice(0, 32);
  if (!displayName) return res.status(400).json({ error: 'Le nom RP est obligatoire.' });
  const { rows: [m] } = await pool.query(
    'UPDATE members SET display_name = $1, bio = $2, phone_rp = $3 WHERE id = $4 RETURNING *',
    [displayName, bio || null, phoneRp || null, req.session.memberId]);
  res.json(publicMember(m));
}));

// les membres : visibles par les membres connectés
app.get('/api/membres', requireAuth, requireApproved, wrap(async (_req, res) => {
  const { rows } = await pool.query(`SELECT * FROM members WHERE status = 'approved' ORDER BY array_position($1::text[], rank), display_name`, [rankValues()]);
  res.json(rows.map(m => { const p = publicMember(m); return { id: p.id, displayName: p.displayName, username: p.username, rank: p.rank, rankLabel: p.rankLabel, rankAlias: p.rankAlias, rankIcon: p.rankIcon, tier: p.tier, avatarUrl: p.avatarUrl, bio: p.bio, phoneRp: p.phoneRp }; }));
}));

// ---------- Administration ----------
app.get('/api/admin/members', requireAuth, requireApproved, requireAdmin, wrap(async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT m.*, a.display_name AS approved_by_name FROM members m
    LEFT JOIN members a ON a.id = m.approved_by
    ORDER BY (m.status = 'pending') DESC, array_position($1::text[], m.rank), m.display_name`, [rankValues()]);
  res.json(rows.map(m => ({ ...publicMember(m), approvedByName: m.approved_by_name })));
}));

app.patch('/api/admin/members/:id', requireAuth, requireApproved, requireAdmin, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const target = (await pool.query('SELECT * FROM members WHERE id = $1', [id])).rows[0];
  if (!target) return res.status(404).json({ error: 'Membre introuvable.' });
  const sets = [], vals = [];
  const add = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (req.body.displayName !== undefined) {
    const dn = String(req.body.displayName).trim().slice(0, 64);
    if (!dn) return res.status(400).json({ error: 'Le nom RP est obligatoire.' });
    add('display_name', dn);
  }
  if (req.body.rank !== undefined && req.body.rank !== target.rank) {
    if (!rankValues().includes(req.body.rank)) return res.status(400).json({ error: 'Grade inconnu.' });
    // seuls les grades « top » peuvent donner ou retirer un grade « top »
    if ((isTopRank(req.body.rank) || isTopRank(target.rank)) && !isTop(req.member)) return res.status(403).json({ error: 'Seuls le Lord et le Duke peuvent faire ce changement.' });
    add('rank', req.body.rank);
  }
  if (req.body.status !== undefined && req.body.status !== target.status) {
    if (!['pending', 'approved', 'rejected'].includes(req.body.status)) return res.status(400).json({ error: 'Statut inconnu.' });
    if (target.id === req.member.id) return res.status(400).json({ error: 'Tu ne peux pas changer ton propre statut.' });
    if (isTopRank(target.rank) && !isTop(req.member)) return res.status(403).json({ error: 'Seuls le Lord et le Duke peuvent faire ce changement.' });
    add('status', req.body.status);
    add('approved_at', req.body.status === 'approved' ? new Date() : null);
    add('approved_by', req.body.status === 'approved' ? req.member.id : null);
  }
  if (!sets.length) return res.json(publicMember(target));
  vals.push(id);
  const { rows: [m] } = await pool.query(`UPDATE members SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals);
  res.json(publicMember(m));
}));

app.get('/api/ranks', (_req, res) => res.json(RANK_ROWS.map(r => ({ value: r.value, label: r.label, alias: r.alias, icon: r.icon, devise: r.devise, row: r.row_index, top: r.is_top, hidden: r.hidden }))));


// ---------- Grades : création / modification / ordre / suppression (Lord & Duke) ----------
// Les icônes disponibles sont les symboles de assets/grades.svg.
const ICONS = ['crown', 'fleur', 'lion', 'swords', 'handshake', 'quill', 'laptop', 'poudre', 'fiole', 'medaille', 'bouclier', 'etoile', 'cle', 'gemmes', 'balance', 'enclume'];
const slug = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
const rankUsage = async () => {
  const { rows: m } = await pool.query("SELECT rank, count(*)::int AS n FROM members WHERE status <> 'rejected' GROUP BY rank");
  const { rows: o } = await pool.query('SELECT rank, count(*)::int AS n FROM org_entries GROUP BY rank');
  const u = {};
  for (const r of RANK_ROWS) u[r.value] = { membres: 0, fiches: 0 };
  for (const r of m) if (u[r.rank]) u[r.rank].membres = r.n;
  for (const r of o) if (u[r.rank]) u[r.rank].fiches = r.n;
  return u;
};
const ranksPayload = async () => ({
  ranks: RANK_ROWS.map(r => ({ value: r.value, label: r.label, alias: r.alias, icon: r.icon, devise: r.devise, row: r.row_index, isAdmin: r.is_admin, isTop: r.is_top, hidden: r.hidden })),
  usage: await rankUsage(),
  icons: ICONS,
  defaultRank: defaultRank(),          // grade donné aux nouveaux comptes
  bootstrapRank: bootstrapRank(),      // grade des IDs de ADMIN_DISCORD_IDS
});
const champsRank = (body, base = {}) => {
  const label = String(body.label ?? base.label ?? '').trim();
  if (!label) throw Object.assign(new Error('Le nom du grade est obligatoire.'), { statut: 400 });
  if (label.length > 40) throw Object.assign(new Error('Nom trop long (40 caractères maximum).'), { statut: 400 });
  const alias = String(body.alias ?? base.alias ?? '').trim().slice(0, 40);
  const devise = String(body.devise ?? base.devise ?? '').trim().slice(0, 80);
  let icon = body.icon === undefined ? (base.icon || '') : String(body.icon || '').trim();
  if (icon && !ICONS.includes(icon)) throw Object.assign(new Error('Icône inconnue.'), { statut: 400 });
  const row = Number.isInteger(+body.row) ? Math.max(0, Math.min(99, +body.row)) : (base.row_index ?? RANK_ROWS.length);
  const bool = (k, d) => (body[k] === undefined ? d : !!body[k]);
  return { label, alias, icon, devise, row, isAdmin: bool('isAdmin', !!base.is_admin), isTop: bool('isTop', !!base.is_top), hidden: bool('hidden', !!base.hidden) };
};

app.get('/api/admin/ranks', requireAuth, requireApproved, requireTop, wrap(async (_req, res) => res.json(await ranksPayload())));

app.post('/api/admin/ranks', requireAuth, requireApproved, requireTop, wrap(async (req, res) => {
  const c = champsRank(req.body || {});
  const value = slug(req.body.value || c.label);
  if (!value) return res.status(400).json({ error: "Nom impossible à convertir en identifiant (utilise des lettres)." });
  if (rankRow(value)) return res.status(409).json({ error: 'Un grade porte déjà ce nom.' });
  if (RANK_ROWS.length >= 30) return res.status(400).json({ error: '30 grades au maximum.' });
  await pool.query('INSERT INTO ranks (value, label, alias, icon, devise, row_index, sort_index, is_admin, is_top, hidden) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [value, c.label, c.alias, c.icon, c.devise, c.row, RANK_ROWS.length, c.isAdmin, c.isTop, c.hidden]);
  await reloadRanks();
  res.json({ ok: true, value, ...(await ranksPayload()) });
}));

app.patch('/api/admin/ranks/:value', requireAuth, requireApproved, requireTop, wrap(async (req, res) => {
  const base = rankRow(req.params.value);
  if (!base) return res.status(404).json({ error: 'Grade inconnu.' });
  const c = champsRank(req.body || {}, base);
  // garde-fou : ne pas se retirer soi-même les pleins pouvoirs, ni laisser le site sans aucun grade complet
  if (base.is_top && !c.isTop) {
    if (req.member.rank === base.value) return res.status(400).json({ error: 'Tu ne peux pas retirer les pleins pouvoirs à ton propre grade.' });
    if (RANK_ROWS.filter(r => r.is_top).length <= 1) return res.status(400).json({ error: 'Il doit rester au moins un grade avec les pleins pouvoirs.' });
  }
  await pool.query('UPDATE ranks SET label=$2, alias=$3, icon=$4, devise=$5, row_index=$6, is_admin=$7, is_top=$8, hidden=$9 WHERE value=$1',
    [base.value, c.label, c.alias, c.icon, c.devise, c.row, c.isAdmin, c.isTop, c.hidden]);
  await reloadRanks();
  res.json({ ok: true, ...(await ranksPayload()) });
}));

// nouvel ordre complet : [{ value, row }] — « row » identique = même ligne de l'organigramme
app.post('/api/admin/ranks/ordre', requireAuth, requireApproved, requireTop, wrap(async (req, res) => {
  const ordre = Array.isArray(req.body?.ordre) ? req.body.ordre : null;
  if (!ordre || ordre.length !== RANK_ROWS.length) return res.status(400).json({ error: 'Liste des grades incomplète.' });
  if (!ordre.every(o => rankRow(o.value))) return res.status(400).json({ error: 'Grade inconnu dans la liste.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [i, o] of ordre.entries())
      await client.query('UPDATE ranks SET row_index = $2, sort_index = $3 WHERE value = $1', [o.value, Number.isInteger(+o.row) ? Math.max(0, Math.min(99, +o.row)) : i, i]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  await reloadRanks();
  res.json({ ok: true, ...(await ranksPayload()) });
}));

app.delete('/api/admin/ranks/:value', requireAuth, requireApproved, requireTop, wrap(async (req, res) => {
  const cible = rankRow(req.params.value);
  if (!cible) return res.status(404).json({ error: 'Grade inconnu.' });
  if (RANK_ROWS.length <= 1) return res.status(400).json({ error: 'Il faut garder au moins un grade.' });
  if (cible.value === req.member.rank) return res.status(400).json({ error: 'Tu ne peux pas supprimer ton propre grade.' });
  if (cible.value === bootstrapRank()) return res.status(400).json({ error: "Ce grade est celui donné au premier administrateur : il ne peut pas être supprimé." });
  if (cible.is_top && RANK_ROWS.filter(r => r.is_top).length <= 1) return res.status(400).json({ error: 'Il doit rester au moins un grade avec les pleins pouvoirs.' });
  const usage = (await rankUsage())[cible.value] || { membres: 0, fiches: 0 };
  const remplacant = req.body?.remplacant ? String(req.body.remplacant) : null;
  if (usage.membres || usage.fiches) {
    if (!remplacant) return res.status(409).json({ error: 'Grade utilisé : choisis le grade de remplacement.', usage });
    if (remplacant === cible.value || !rankRow(remplacant)) return res.status(400).json({ error: 'Grade de remplacement inconnu.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (remplacant) {
      await client.query('UPDATE members SET rank = $2 WHERE rank = $1', [cible.value, remplacant]);
      await client.query('UPDATE org_entries SET rank = $2 WHERE rank = $1', [cible.value, remplacant]);
    }
    await client.query('DELETE FROM org_rank_desc WHERE rank = $1', [cible.value]);
    await client.query('DELETE FROM ranks WHERE value = $1', [cible.value]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  await reloadRanks();
  res.json({ ok: true, ...(await ranksPayload()) });
}));

// ---------- Organigramme public (lecture libre, modification par le Lord / Duke) ----------
const orgPayload = async () => {
  const { rows: entries } = await pool.query('SELECT id, rank, name, subtitle, description, photo, is_open, position FROM org_entries ORDER BY array_position($1::text[], rank), position, id', [rankValues()]);
  const { rows: descs } = await pool.query('SELECT * FROM org_rank_desc');
  const visible = new Set(publicRanks().map(r => r.value));
  return {
    ranks: publicRanks().map(r => ({ value: r.value, label: r.label, alias: r.alias, icon: r.icon, devise: r.devise, row: r.row_index })),
    entries: entries.filter(e => visible.has(e.rank)),
    rankDesc: Object.fromEntries(descs.filter(d => visible.has(d.rank) && d.description).map(d => [d.rank, d.description])),
  };
};
app.get('/api/org', wrap(async (_req, res) => res.json(await orgPayload())));

const orgFields = b => ({
  rank: publicRanks().some(r => r.value === b.rank) ? b.rank : null,
  name: String(b.name ?? '').trim().slice(0, 64),
  subtitle: String(b.subtitle ?? '').trim().slice(0, 80) || null,
  description: String(b.description ?? '').trim().slice(0, 1500) || null,
  is_open: !!b.isOpen,
});
app.post('/api/admin/org', requireAuth, requireApproved, requireTop, wrap(async (req, res) => {
  const f = orgFields(req.body);
  if (!f.rank || !f.name) return res.status(400).json({ error: 'Le grade et le nom sont obligatoires.' });
  const { rows: [{ n }] } = await pool.query('SELECT COALESCE(MAX(position), -1) + 1 AS n FROM org_entries WHERE rank = $1', [f.rank]);
  await pool.query('INSERT INTO org_entries (rank, name, subtitle, description, is_open, position) VALUES ($1,$2,$3,$4,$5,$6)', [f.rank, f.name, f.subtitle, f.description, f.is_open, n]);
  res.status(201).json(await orgPayload());
}));
app.patch('/api/admin/org/:id', requireAuth, requireApproved, requireTop, wrap(async (req, res) => {
  const f = orgFields(req.body);
  if (!f.rank || !f.name) return res.status(400).json({ error: 'Le grade et le nom sont obligatoires.' });
  await pool.query('UPDATE org_entries SET rank=$1, name=$2, subtitle=$3, description=$4, is_open=$5 WHERE id=$6', [f.rank, f.name, f.subtitle, f.description, f.is_open, Number(req.params.id)]);
  res.json(await orgPayload());
}));
app.post('/api/admin/org/:id/move', requireAuth, requireApproved, requireTop, wrap(async (req, res) => {
  const id = Number(req.params.id), dir = req.body.dir === 'up' ? -1 : 1;
  const { rows: [e] } = await pool.query('SELECT * FROM org_entries WHERE id = $1', [id]);
  if (!e) return res.status(404).json({ error: 'Case introuvable.' });
  const { rows: sib } = await pool.query('SELECT id FROM org_entries WHERE rank = $1 ORDER BY position, id', [e.rank]);
  const i = sib.findIndex(s => s.id === id), j = i + dir;
  if (j >= 0 && j < sib.length) [sib[i], sib[j]] = [sib[j], sib[i]];
  for (let k = 0; k < sib.length; k++) await pool.query('UPDATE org_entries SET position = $1 WHERE id = $2', [k, sib[k].id]);
  res.json(await orgPayload());
}));
app.delete('/api/admin/org/:id', requireAuth, requireApproved, requireTop, wrap(async (req, res) => {
  const { rows: [e] } = await pool.query('DELETE FROM org_entries WHERE id = $1 RETURNING photo', [Number(req.params.id)]);
  removeUpload(e?.photo);
  res.json(await orgPayload());
}));
app.put('/api/admin/org/rank-desc/:rank', requireAuth, requireApproved, requireTop, wrap(async (req, res) => {
  if (!publicRanks().some(r => r.value === req.params.rank)) return res.status(400).json({ error: 'Grade inconnu.' });
  const d = String(req.body.description ?? '').trim().slice(0, 600) || null;
  await pool.query('INSERT INTO org_rank_desc (rank, description) VALUES ($1, $2) ON CONFLICT (rank) DO UPDATE SET description = EXCLUDED.description', [req.params.rank, d]);
  res.json(await orgPayload());
}));

// ---------- Galerie photo (lecture publique, dépôt par les membres validés) ----------
const UPLOAD_DIR = process.env.UPLOAD_DIR || join(ROOT, 'uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true, dotfiles: 'ignore' }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, f, cb) => cb(null, /^image\/(jpeg|png|webp|gif|heic|heif)$/.test(f.mimetype)) });
const PHOTO_SELECT = `SELECT p.*, m.display_name, m.username, m.rank FROM photos p JOIN members m ON m.id = p.member_id WHERE p.deleted_at IS NULL`;
const photoRow = r => ({ id: r.id, url: `/uploads/${r.file}`, thumb: `/uploads/${r.thumb}`, width: r.width, height: r.height, caption: r.caption, createdAt: r.created_at,
  author: { id: r.member_id, displayName: r.display_name || r.username, username: r.username, rank: r.rank, rankLabel: rankLabel(r.rank), ...rankExtra(r.rank) } });

app.get('/api/gallery', wrap(async (req, res) => {
  const lim = Math.min(Math.max(Number(req.query.limit) || 60, 1), 200);
  const { rows } = await pool.query(`${PHOTO_SELECT} ORDER BY p.created_at DESC LIMIT $1`, [lim]);
  res.json(rows.map(photoRow));
}));

app.post('/api/gallery', requireAuth, requireApproved, limit('photo', 10, 600000),
  (req, res, next) => upload.single('photo')(req, res, err => err ? res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Image trop lourde (15 Mo max).' : 'Fichier refusé.' }) : next()),
  wrap(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Aucune image (jpg, png, webp, gif, heic).' });
    try {
      const base = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
      const img = sharp(req.file.buffer, { animated: false }).rotate();   // .rotate() applique l'orientation EXIF puis la retire
      const big = await img.clone().resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true }).webp({ quality: 84 }).toFile(join(UPLOAD_DIR, `${base}.webp`));
      await img.clone().resize({ width: 600, height: 600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toFile(join(UPLOAD_DIR, `${base}-t.webp`));
      const caption = String(req.body.caption ?? '').trim().slice(0, 200) || null;
      const { rows: [ins] } = await pool.query('INSERT INTO photos (member_id, file, thumb, width, height, caption) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        [req.member.id, `${base}.webp`, `${base}-t.webp`, big.width, big.height, caption]);
      const { rows: [row] } = await pool.query(`${PHOTO_SELECT} AND p.id = $1`, [ins.id]);
      res.status(201).json(photoRow(row));
    } catch (e) { console.error(e); res.status(400).json({ error: 'Image illisible.' }); }
  }));

app.delete('/api/gallery/:id', requireAuth, requireApproved, wrap(async (req, res) => {
  const { rows: [p] } = await pool.query('SELECT * FROM photos WHERE id = $1 AND deleted_at IS NULL', [Number(req.params.id)]);
  if (!p) return res.status(404).json({ error: 'Photo introuvable.' });
  if (p.member_id !== req.member.id && !canAdmin(req.member)) return res.status(403).json({ error: 'forbidden' });
  await pool.query('UPDATE photos SET deleted_at = now() WHERE id = $1', [p.id]);
  for (const f of [p.file, p.thumb]) { try { unlinkSync(join(UPLOAD_DIR, f)); } catch {} }
  res.json({ ok: true });
}));

// ---------- Photos de l'organigramme (portrait 3:4) ----------
const removeUpload = url => { if (url && url.startsWith('/uploads/')) { try { unlinkSync(join(UPLOAD_DIR, url.slice(9))); } catch {} } };
app.post('/api/admin/org/:id/photo', requireAuth, requireApproved, requireTop, limit('orgphoto', 20, 600000),
  (req, res, next) => upload.single('photo')(req, res, err => err ? res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Image trop lourde (15 Mo max).' : 'Fichier refusé.' }) : next()),
  wrap(async (req, res) => {
    const { rows: [e] } = await pool.query('SELECT * FROM org_entries WHERE id = $1', [Number(req.params.id)]);
    if (!e) return res.status(404).json({ error: 'Case introuvable.' });
    if (!req.file) return res.status(400).json({ error: 'Aucune image (jpg, png, webp, gif, heic).' });
    try {
      const file = `portrait-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}.webp`;
      await sharp(req.file.buffer, { animated: false }).rotate().resize({ width: 600, height: 800, fit: 'cover', position: 'attention' }).webp({ quality: 82 }).toFile(join(UPLOAD_DIR, file));
      await pool.query('UPDATE org_entries SET photo = $1 WHERE id = $2', [`/uploads/${file}`, e.id]);
      removeUpload(e.photo);
      res.json(await orgPayload());
    } catch (err) { console.error(err); res.status(400).json({ error: 'Image illisible.' }); }
  }));
app.delete('/api/admin/org/:id/photo', requireAuth, requireApproved, requireTop, wrap(async (req, res) => {
  const { rows: [e] } = await pool.query('SELECT photo FROM org_entries WHERE id = $1', [Number(req.params.id)]);
  if (!e) return res.status(404).json({ error: 'Case introuvable.' });
  await pool.query('UPDATE org_entries SET photo = NULL WHERE id = $1', [Number(req.params.id)]);
  removeUpload(e.photo);
  res.json(await orgPayload());
}));

// ---------- Dossier interne (réservé aux membres validés) ----------
// Contenu modifiable dans server/content/dossier.json (jamais servi directement).
app.get('/api/dossier', requireAuth, requireApproved, wrap(async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(JSON.parse(readFileSync(join(here, '..', 'content', 'dossier.json'), 'utf8')));
}));

// ---------- Le Salon (discussion en direct : SSE + POST) ----------
const chatClients = new Map();            // connexion -> membre
const chatAuthor = m => ({ id: m.member_id ?? m.id, displayName: m.display_name || m.username, username: m.username, rank: m.rank, rankLabel: rankLabel(m.rank), ...rankExtra(m.rank), tier: tierOf(m.rank), avatarUrl: avatarUrl(m) });
const chatBroadcast = (event, data) => {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of chatClients.keys()) { try { res.write(payload); } catch { chatClients.delete(res); } }
};
const chatPresence = () => {
  const seen = new Map();
  for (const m of chatClients.values()) seen.set(m.id, chatAuthor(m));
  const ordre = rankValues();
  return [...seen.values()].sort((a, b) => ordre.indexOf(a.rank) - ordre.indexOf(b.rank) || a.displayName.localeCompare(b.displayName));
};
const chatRow = r => ({ id: r.id, content: r.content, createdAt: r.created_at, author: chatAuthor(r) });
const CHAT_SELECT = `SELECT g.id, g.content, g.created_at, g.member_id, m.display_name, m.username, m.rank, m.discord_id, m.avatar
                     FROM messages g JOIN members m ON m.id = g.member_id WHERE g.deleted_at IS NULL`;

app.get('/api/chat/messages', requireAuth, requireApproved, wrap(async (req, res) => {
  const before = Number(req.query.before) || null;
  const { rows } = await pool.query(`${CHAT_SELECT} ${before ? 'AND g.id < $1' : ''} ORDER BY g.id DESC LIMIT 60`, before ? [before] : []);
  res.json(rows.reverse().map(chatRow));
}));

app.post('/api/chat/messages', requireAuth, requireApproved, limit('chat', 8, 10000), wrap(async (req, res) => {
  const content = String(req.body.content ?? '').trim().slice(0, 1000);
  if (!content) return res.status(400).json({ error: 'Message vide.' });
  const { rows: [ins] } = await pool.query('INSERT INTO messages (member_id, content) VALUES ($1, $2) RETURNING id', [req.member.id, content]);
  const { rows: [row] } = await pool.query(`${CHAT_SELECT} AND g.id = $1`, [ins.id]);
  const msg = chatRow(row);
  chatBroadcast('message', msg);
  res.status(201).json(msg);
}));

app.delete('/api/chat/messages/:id', requireAuth, requireApproved, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { rows: [g] } = await pool.query('SELECT member_id FROM messages WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!g) return res.status(404).json({ error: 'Message introuvable.' });
  if (g.member_id !== req.member.id && !canAdmin(req.member)) return res.status(403).json({ error: 'forbidden' });
  await pool.query('UPDATE messages SET deleted_at = now() WHERE id = $1', [id]);
  chatBroadcast('delete', { id });
  res.json({ ok: true });
}));

// messages non lus + mentions (pastille du menu)
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mentionRegex = m => new RegExp('@(' + [m.display_name, m.username].filter(Boolean).map(escapeRe).join('|') + ')(?![\\w-])', 'i');
app.get('/api/chat/unread', requireAuth, requireApproved, wrap(async (req, res) => {
  const { rows: [r] } = await pool.query('SELECT last_read_id FROM chat_reads WHERE member_id = $1', [req.member.id]);
  const last = r?.last_read_id ?? 0;
  const { rows } = await pool.query('SELECT id, content FROM messages WHERE id > $1 AND deleted_at IS NULL AND member_id <> $2 ORDER BY id DESC LIMIT 500', [last, req.member.id]);
  const re = mentionRegex(req.member);
  res.json({ unread: rows.length, mentions: rows.filter(m => re.test(m.content)).length, lastReadId: last });
}));
app.post('/api/chat/read', requireAuth, requireApproved, wrap(async (req, res) => {
  const id = Number(req.body.lastId) || 0;
  await pool.query('INSERT INTO chat_reads (member_id, last_read_id) VALUES ($1, $2) ON CONFLICT (member_id) DO UPDATE SET last_read_id = GREATEST(chat_reads.last_read_id, EXCLUDED.last_read_id), updated_at = now()', [req.member.id, id]);
  res.json({ ok: true });
}));
// membres mentionnables (autocomplétion @)
app.get('/api/chat/mentions', requireAuth, requireApproved, wrap(async (_req, res) => {
  const { rows } = await pool.query("SELECT display_name, username FROM members WHERE status = 'approved' ORDER BY display_name");
  res.json(rows.map(r => ({ name: r.display_name || r.username, username: r.username })));
}));

app.get('/api/chat/stream', requireAuth, requireApproved, (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 3000\n\n');
  chatClients.set(res, req.member);
  chatBroadcast('presence', chatPresence());
  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 25000);
  req.on('close', () => { clearInterval(ping); chatClients.delete(res); chatBroadcast('presence', chatPresence()); });
});

// ---------- Bot Discord (lecture seule, onglet Gestion → Le Bot) ----------
const bot = createBotBridge({ url: process.env.BOT_DATABASE_URL, guildId: process.env.BOT_GUILD_ID || DISCORD_GUILD_ID });
if (bot) bot.check()
  .then(n => console.log(`Pont bot : connecté en lecture seule (${n} ligne(s) de quota pour ce serveur Discord)`))
  .catch(e => console.error('Pont bot : connexion impossible —', e.message));
app.get('/api/bot', requireAuth, requireApproved, requireAdmin, wrap(async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!bot) return res.json({ configured: false });
  const { rows } = await pool.query("SELECT discord_id, display_name, username FROM members WHERE status = 'approved'");
  const names = new Map(rows.map(r => [r.discord_id, r.display_name || r.username]));
  try { res.json(await bot.overview(id => names.get(id))); }
  catch (e) { console.error('Pont bot :', e.message); res.status(502).json({ configured: true, error: 'La base du bot ne répond pas.' }); }
}));

app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.use('/api', (_req, res) => res.status(404).json({ error: 'not-found' }));

// ---------- Fichiers du site ----------
// on ne sert jamais le code du serveur ni les fichiers techniques
app.use((req, res, next) => /^\/(server|scripts|node_modules|uploads\/\.)(\/|$)|^\/(package(-lock)?\.json|README\.md)$/i.test(req.path) ? res.status(404).end() : next());
app.use(express.static(ROOT, { extensions: ['html'], index: 'index.html', dotfiles: 'ignore', maxAge: '1h' }));
app.use((_req, res) => res.status(404).sendFile(join(ROOT, '404.html'), err => err && res.send('404')));

// erreurs inattendues : on les note dans les journaux sans rien révéler au visiteur
app.use((err, _req, res, _next) => {
  if (err?.statut) return res.status(err.statut).json({ error: err.message });   // erreur de saisie, message affichable
  console.error(err);
  if (!res.headersSent) res.status(500).json({ error: 'Erreur du serveur, réessaie dans un instant.' });
});

app.listen(PORT, '0.0.0.0', () => console.log(`6AM en écoute sur le port ${PORT} (${BASE_URL})`));
