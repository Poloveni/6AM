'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const bool = (v, def = false) => {
  if (v === undefined || v === null || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
};
const int = (v, def) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : def);

const client = (process.env.DB_CLIENT || 'pg').toLowerCase();
if (!['pg', 'mysql2'].includes(client)) {
  throw new Error(`DB_CLIENT invalide : "${client}". Valeurs acceptees : pg, mysql2`);
}

const defaultPort = client === 'pg' ? 5432 : 3306;

const config = {
  env: process.env.NODE_ENV || 'development',
  port: int(process.env.PORT, 3000),
  appUrl: (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  trustProxy: bool(process.env.TRUST_PROXY, false),

  site: {
    name: process.env.SITE_NAME || '6AM',
    tagline: process.env.SITE_TAGLINE || 'Serveur GTA RP',
    description: process.env.SITE_DESCRIPTION || 'Serveur roleplay 6AM.',
    locale: process.env.SITE_LOCALE || 'fr-FR',
  },

  links: {
    discord: process.env.DISCORD_INVITE || '',
    fivem: process.env.FIVEM_CONNECT || '',
    twitter: process.env.TWITTER_URL || '',
    youtube: process.env.YOUTUBE_URL || '',
    tiktok: process.env.TIKTOK_URL || '',
  },

  db: {
    client,
    url: process.env.DATABASE_URL || null,
    host: process.env.DB_HOST || 'localhost',
    port: int(process.env.DB_PORT, defaultPort),
    name: process.env.DB_NAME || 'sixam',
    user: process.env.DB_USER || 'sixam',
    password: process.env.DB_PASSWORD || '',
    ssl: bool(process.env.DB_SSL, false),
    poolMin: int(process.env.DB_POOL_MIN, 2),
    poolMax: int(process.env.DB_POOL_MAX, 10),
  },

  session: {
    secret: process.env.SESSION_SECRET || '',
    name: process.env.SESSION_NAME || 'sixam.sid',
    ttlHours: int(process.env.SESSION_TTL_HOURS, 168),
    secure: bool(process.env.COOKIE_SECURE, false),
  },

  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@6am.local',
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || '',
  },

  // Pont vers la base du bot Discord (lecture seule, optionnel)
  bot: {
    url: process.env.BOT_DATABASE_URL || null,
    ssl: bool(process.env.BOT_DB_SSL, false),
  },

  discordWebhook: {
    url: process.env.DISCORD_WEBHOOK_URL || '',
    username: process.env.DISCORD_WEBHOOK_USERNAME || '6AM',
  },
};

if (config.env === 'production') {
  const missing = [];
  if (!config.session.secret || config.session.secret.length < 32) missing.push('SESSION_SECRET (32 caracteres minimum)');
  if (!config.db.url && !config.db.password) missing.push('DB_PASSWORD');
  if (missing.length) {
    throw new Error('Configuration incomplete dans .env :\n  - ' + missing.join('\n  - '));
  }
} else if (!config.session.secret) {
  config.session.secret = 'dev-secret-non-securise-a-remplacer-en-production';
}

module.exports = config;
