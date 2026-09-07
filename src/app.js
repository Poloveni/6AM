'use strict';
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const ConnectSessionKnex = require('connect-session-knex');

const config = require('./config');
const db = require('./db/knex');
const helpers = require('./lib/helpers');
const settings = require('./lib/settings');
const { loadUser } = require('./middleware/auth');
const { csrf, flash } = require('./middleware/security');

const app = express();

if (config.trustProxy) app.set('trust proxy', 1);

// ---------- Vues ----------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);

// ---------- Securite / perf ----------
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"],
      upgradeInsecureRequests: config.session.secure ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(compression());
app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));

// ---------- Corps de requete ----------
app.use(express.urlencoded({ extended: false, limit: '200kb' }));
app.use(express.json({ limit: '200kb' }));

// ---------- Fichiers statiques ----------
app.use('/static', express.static(path.join(__dirname, 'public'), {
  maxAge: config.env === 'production' ? '7d' : 0,
}));

// ---------- Sessions ----------
const KnexSessionStore = ConnectSessionKnex.ConnectSessionKnexStore || ConnectSessionKnex(session);
const store = new KnexSessionStore({
  knex: db,
  tablename: 'user_sessions',
  createtable: true,
  clearInterval: 60 * 60 * 1000,
});

app.use(session({
  name: config.session.name,
  secret: config.session.secret,
  store,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.session.secure,
    maxAge: config.session.ttlHours * 60 * 60 * 1000,
  },
}));

app.use(flash);
app.use(csrf);
app.use(loadUser);

// ---------- Variables globales des vues ----------
app.use(async (req, res, next) => {
  res.locals.site = config.site;
  res.locals.links = config.links;
  res.locals.h = helpers;
  res.locals.currentPath = req.path;
  res.locals.title = config.site.name;
  res.locals.bodyClass = '';
  try {
    res.locals.settings = await settings.all();
  } catch (err) {
    res.locals.settings = {};
  }
  next();
});

// ---------- Routes ----------
app.get('/healthz', async (req, res) => {
  try {
    await db.raw('select 1');
    res.json({ ok: true, uptime: Math.round(process.uptime()) });
  } catch (err) {
    res.status(503).json({ ok: false, error: 'database' });
  }
});

app.use('/', require('./routes/public'));
app.use('/', require('./routes/auth'));
app.use('/espace', require('./routes/dashboard'));
app.use('/espace/effectifs', require('./routes/effectifs'));
app.use('/espace/activite', require('./routes/activity'));
app.use('/espace/statistiques', require('./routes/stats'));
app.use('/espace/organisation', require('./routes/organisation'));
app.use('/espace/administration', require('./routes/admin'));

// ---------- Erreurs ----------
app.use((req, res) => {
  res.status(404).render('errors/404', { title: 'Page introuvable' });
});

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[erreur]', err);
  res.status(err.status || 500).render('errors/500', {
    title: 'Erreur serveur',
    detail: config.env === 'production' ? null : err.stack,
  });
});

module.exports = app;
