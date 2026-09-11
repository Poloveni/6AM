/* 6AM — pont en LECTURE SEULE vers la base du bot Discord « roxwood-network-famille »
   (https://github.com/poulpizar01/roxwood-network-famille).

   Le site ne fait que lire : le bot reste le seul à écrire dans sa base, sinon
   les messages qu'il tient à jour sur Discord se désynchroniseraient. La
   connexion utilise un rôle PostgreSQL sans aucun droit d'écriture (créé par
   server/deploy/bot-link.sh), et chaque transaction est en plus ouverte en
   mode « READ ONLY » : deux sécurités indépendantes.

   Variables (.env) :
     BOT_DATABASE_URL  postgresql://sixam_ro:…@<conteneur-base-du-bot>:5432/<base>
     BOT_GUILD_ID      ID du serveur Discord de 6AM (défaut : DISCORD_GUILD_ID)

   Le bot est « multi-serveur » : chaque requête filtre sur guild_id.
   Les barèmes ci-dessous sont recopiés du code du bot (src/config-store.ts),
   où ils sont fixes : à mettre à jour si le bot les change. */
import pg from 'pg';

// ---------- Barèmes fixes du bot (src/config-store.ts) ----------
export const ACTIVITIES = {
  atm: { label: 'ATM', quota: 'actions' },
  cambu: { label: 'Cambu', quota: 'actions' },
  superette: { label: 'Supérette', quota: 'actions' },
  gofast: { label: 'Go Fast', quota: 'actions' },
  fleeca: { label: 'Fleeca', quota: 'actions' },
  braq_armurerie: { label: 'Armurerie', quota: 'actions' },
  bijouterie: { label: 'Bijouterie', quota: 'actions' },
  pinebank: { label: 'Pinebank', quota: 'actions' },
  human_labs: { label: 'Human Labs', quota: 'actions' },
  vente: { label: 'Vente drogue', quota: 'vente' },
  recolte: { label: 'Récolte', quota: 'recolte' },
  labo_heroine: { label: 'Labo Héroïne', quota: 'labos' },
  labo_sporex: { label: 'Labo Sporex', quota: 'labos' },
  labo_mexicana: { label: 'Labo Mexicana', quota: 'labos' },
  labo_cannabis: { label: 'Labo Cannabis', quota: 'labos' },
  labo_cocaine: { label: 'Labo Cocaïne', quota: 'labos' },
};
const QUOTA_LABEL = { actions: 'Actions', vente: 'Vente', recolte: 'Récolte', labos: 'Labos' };
const TIERS = { independant: 'Indépendant', petite_frappe: 'Petite Frappe', gang: 'Gang', organisation: 'Organisation' };
const DEFAULT_TIER = 'petite_frappe';
const BRAQUAGE_LIMITS_BY_TIER = {
  independant: { fleeca: 2, braq_armurerie: 2, bijouterie: 0, pinebank: 0, human_labs: 0 },
  petite_frappe: { fleeca: 6, braq_armurerie: 6, bijouterie: 1, pinebank: 1, human_labs: 0 },
  gang: { fleeca: 10, braq_armurerie: 10, bijouterie: 2, pinebank: 1, human_labs: 1 },
  organisation: { fleeca: 12, braq_armurerie: 12, bijouterie: 4, pinebank: 2, human_labs: 1 },
};
const MUNITIONS_STOCK_GROUP = 'Munitions de pistolet';
const TAXE_TYPES = { sporex: 'Sporex', heroine: 'Héroïne', vente: 'Vente', fertilisant: 'Fertilisant', cannabis: 'Cannabis', mexicana: 'Mexicana', cocaine: 'Cocaïne' };
const ARME_STATUT = { en_stock: 'En stock', pretee: 'Prêtée', perdue: 'Perdue' };
const MOUVEMENT = { retire: 'Retrait', depose: 'Dépôt' };

// Prochaine remise à zéro du bot : chaque dimanche à 19 h, heure de Paris.
function nextReset(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(now).map(p => [p.type, p.value]));
  const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute);
  const offset = wall - Math.floor(now.getTime() / 60000) * 60000;          // décalage Paris ↔ UTC
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  let days = (7 - dow) % 7;
  if (days === 0 && (+parts.hour % 24) >= 19) days = 7;
  const target = Date.UTC(+parts.year, +parts.month - 1, +parts.day + days, 19, 0);
  return new Date(target - offset).toISOString();
}

export function createBotBridge({ url, guildId }) {
  if (!url) return null;
  // horodatages du bot : « timestamp without time zone » en UTC → lus comme UTC
  const types = { getTypeParser: (oid, format) => oid === 1114 ? (v => v === null ? null : new Date(v.replace(' ', 'T') + 'Z')) : pg.types.getTypeParser(oid, format) };
  const pool = new pg.Pool({ connectionString: url, max: 4, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000, types });
  pool.on('error', e => console.error('Base du bot :', e.message));

  // toutes les lectures dans UNE transaction en lecture seule, fuseau UTC
  async function readOnly(fn) {
    const c = await pool.connect();
    try {
      await c.query("BEGIN READ ONLY; SET LOCAL TIME ZONE 'UTC'");
      const out = await fn(c);
      await c.query('COMMIT');
      return out;
    } catch (e) { try { await c.query('ROLLBACK'); } catch {} throw e; }
    finally { c.release(); }
  }

  async function check() {
    return readOnly(async c => {
      const { rows: [r] } = await c.query('SELECT count(*)::int AS n FROM stats WHERE guild_id = $1', [guildId]);
      return r.n;
    });
  }

  /* Vue d'ensemble pour l'onglet Gestion → Le Bot.
     nameOf(discordId) : nom RP connu du QG (membres), sinon null. */
  async function overview(nameOf) {
    return readOnly(async c => {
      const errors = [];
      // une section en échec (table absente, ancienne version du bot…) n'empêche pas les autres
      // (requêtes l'une après l'autre : un point de sauvegarde par section)
      const q = async (label, sql, params = [guildId]) => {
        await c.query('SAVEPOINT section');
        try { const { rows } = await c.query(sql, params); await c.query('RELEASE SAVEPOINT section'); return rows; }
        catch (e) { errors.push(`${label} : ${e.message}`); await c.query('ROLLBACK TO SAVEPOINT section'); return []; }
      };
      const settingRows = await q('réglages', "SELECT key, value FROM settings WHERE guild_id = $1 AND key IN ('type_groupe', 'last_weekly_reset')");
      const settings = Object.fromEntries(settingRows.map(r => [r.key, r.value]));
      const tier = TIERS[settings.type_groupe] ? settings.type_groupe : DEFAULT_TIER;
      const lastReset = Number(settings.last_weekly_reset) || null;
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 86400e3);

      const stats = await q('quotas', 'SELECT user_id, action, count FROM stats WHERE guild_id = $1');
      const targets = await q('objectifs', 'SELECT quota_type, weekly_target FROM quota_targets WHERE guild_id = $1');
      const rates = await q('taux de paie', 'SELECT quota_type, amount FROM salary_rates WHERE guild_id = $1');
      const braq = await q('braquages', 'SELECT action, count(*)::int AS n FROM braquages WHERE guild_id = $1 AND "timestamp" >= $2 GROUP BY action', [guildId, sevenDaysAgo.toISOString()]);
      const cooldowns = await q('cooldowns', 'SELECT user_id, action, expires_at FROM cooldowns WHERE guild_id = $1 AND expires_at > $2 ORDER BY expires_at', [guildId, now.toISOString()]);
      const items = await q('items', 'SELECT name, stock_group, display_order, visible_stock FROM items WHERE guild_id = $1');
      const stocks = await q('coffre', 'SELECT item, quantite FROM stocks WHERE guild_id = $1');
      const armes = await q('armurerie', "SELECT nom, reference, statut, pretee_a, type FROM armurerie WHERE guild_id = $1 AND statut <> 'perdue' ORDER BY statut DESC, nom");
      const taxes = await q('taxes', 'SELECT nom, type, telephone, echeance, paye FROM taxes WHERE guild_id = $1 AND actif ORDER BY echeance');
      const ventes = await q('ventes', "SELECT joueur, discord_id, item, quantite, \"timestamp\" FROM pending_sales WHERE guild_id = $1 AND statut = 'en_attente' ORDER BY \"timestamp\" DESC LIMIT 50");
      const vehicules = await q('véhicules', 'SELECT plaque, modele, discord_id, joueur, "timestamp" FROM vehicules WHERE guild_id = $1 ORDER BY plaque');
      const fourrieres = await q('fourrières', 'SELECT joueur, discord_id, plaque, modele, "timestamp" FROM fourrieres WHERE guild_id = $1 ORDER BY "timestamp" DESC LIMIT 15');
      const activite = await q('activité', 'SELECT user_id, username, action, quantite, type, partenaires, "timestamp" FROM transactions WHERE guild_id = $1 AND NOT deleted ORDER BY "timestamp" DESC LIMIT 40');
      const mouvements = await q('mouvements', 'SELECT "timestamp", joueur, action, item, quantite, stock_apres FROM stock_history WHERE guild_id = $1 ORDER BY "timestamp" DESC LIMIT 40');
      const mapping = await q('correspondances', 'SELECT game_name, discord_id FROM user_mapping WHERE guild_id = $1');
      const munVendues = lastReset ? await q('munitions', 'SELECT COALESCE(sum(quantite), 0)::int AS n FROM munitions_ventes WHERE guild_id = $1 AND "timestamp" >= $2', [guildId, new Date(lastReset).toISOString()]) : [];

      // ---- noms : QG > correspondance du bot > pseudo Discord connu du bot
      const gameName = new Map(mapping.map(m => [m.discord_id, m.game_name]));
      const username = new Map();
      for (const t of activite) if (t.username && !username.has(t.user_id)) username.set(t.user_id, t.username);
      const who = id => (id && (nameOf(id) || gameName.get(id) || username.get(id))) || (id ? `ID ${id}` : '—');

      // ---- quotas & paie de la semaine (table « stats », vidée chaque dimanche 19 h par le bot)
      const tgt = Object.fromEntries(targets.map(t => [t.quota_type, Number(t.weekly_target)]));
      const rate = Object.fromEntries(rates.map(r => [r.quota_type, Number(r.amount)]));
      const perUser = new Map();
      for (const s of stats) {
        const u = perUser.get(s.user_id) || { byQuota: {}, byAction: {} };
        const n = Number(s.count) || 0;
        u.byAction[s.action] = n;
        const qt = ACTIVITIES[s.action]?.quota;
        if (qt) u.byQuota[qt] = (u.byQuota[qt] || 0) + n;
        perUser.set(s.user_id, u);
      }
      const quotaTypes = [...new Set([...Object.keys(tgt), ...Object.keys(rate)])].sort();
      const joueurs = [...perUser.entries()].map(([id, u]) => ({
        discordId: id, nom: who(id), byQuota: u.byQuota,
        detail: Object.entries(u.byAction).filter(([, n]) => n > 0).map(([a, n]) => ({ label: ACTIVITIES[a]?.label || a, n })),
        paie: Object.entries(rate).reduce((sum, [qt, r]) => sum + (u.byQuota[qt] || 0) * r, 0),
      })).sort((a, b) => b.paie - a.paie || a.nom.localeCompare(b.nom));
      const totaux = {};
      for (const j of joueurs) for (const [qt, n] of Object.entries(j.byQuota)) totaux[qt] = (totaux[qt] || 0) + n;

      // ---- slots de braquage (7 jours glissants, barème du type d'organisation)
      const used = Object.fromEntries(braq.map(b => [b.action, b.n]));
      const braquages = Object.entries(BRAQUAGE_LIMITS_BY_TIER[tier]).filter(([, lim]) => lim > 0)
        .map(([a, lim]) => ({ label: ACTIVITIES[a].label, utilises: used[a] || 0, limite: lim }));

      // ---- coffre : stock par item, regroupé
      const itemInfo = new Map(items.map(i => [i.name, i]));
      const coffre = stocks.filter(s => itemInfo.has(s.item) || Number(s.quantite) !== 0)
        .map(s => ({ item: s.item, quantite: Number(s.quantite), groupe: itemInfo.get(s.item)?.stock_group || null, ordre: itemInfo.get(s.item)?.display_order ?? 999 }))
        .sort((a, b) => (a.groupe || '').localeCompare(b.groupe || '') || a.ordre - b.ordre || a.item.localeCompare(b.item));
      const munitions = coffre.filter(s => s.groupe === MUNITIONS_STOCK_GROUP).reduce((n, s) => n + s.quantite, 0);

      const taxeType = t => TAXE_TYPES[t] || t;
      return {
        configured: true,
        guildId,
        generatedAt: now.toISOString(),
        typeGroupe: TIERS[tier],
        derniereRemise: lastReset ? new Date(lastReset).toISOString() : null,
        prochaineRemise: nextReset(now),
        quotas: { types: quotaTypes.map(qt => ({ key: qt, label: QUOTA_LABEL[qt] || qt, objectif: tgt[qt] ?? null, taux: rate[qt] ?? null })), joueurs, totaux, paieTotale: joueurs.reduce((s, j) => s + j.paie, 0) },
        braquages,
        cooldowns: cooldowns.map(c => ({ nom: who(c.user_id), activite: ACTIVITIES[c.action]?.label || c.action, fin: c.expires_at })),
        coffre,
        armurerie: {
          armes: armes.map(a => ({ nom: a.nom, reference: a.reference, type: a.type, statut: ARME_STATUT[a.statut] || a.statut, preteeA: a.pretee_a })),
          munitions, munitionsVendues: munVendues[0]?.n ?? null,
        },
        taxes: taxes.map(t => ({ nom: t.nom, type: taxeType(t.type), telephone: t.telephone, echeance: t.echeance, paye: t.paye, enRetard: new Date(t.echeance) <= now })),
        ventesEnAttente: ventes.map(v => ({ nom: v.discord_id ? who(v.discord_id) : v.joueur, item: v.item, quantite: v.quantite, depuis: v.timestamp })),
        vehicules: vehicules.map(v => ({ plaque: v.plaque, modele: v.modele, sortiPar: v.discord_id ? who(v.discord_id) : v.joueur, depuis: v.timestamp })),
        fourrieres: fourrieres.map(f => ({ nom: f.discord_id ? who(f.discord_id) : f.joueur, plaque: f.plaque, modele: f.modele, date: f.timestamp })),
        activite: activite.map(t => {
          let partenaires = 0; try { partenaires = JSON.parse(t.partenaires || '[]').length; } catch {}
          return { nom: who(t.user_id), activite: ACTIVITIES[t.action]?.label || t.action, quantite: Number(t.quantite) || 0, type: t.type, partenaires, date: t.timestamp };
        }),
        mouvements: mouvements.map(m => ({ date: m.timestamp, joueur: m.joueur, action: MOUVEMENT[m.action] || m.action, item: m.item, quantite: m.quantite, stockApres: m.stock_apres })),
        erreurs: errors,
      };
    });
  }

  return { overview, check, end: () => pool.end() };
}
