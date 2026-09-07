'use strict';
const config = require('./config');
const db = require('./db/knex');

async function main() {
  console.log(`[6AM] demarrage — env=${config.env} db=${config.db.client}`);

  // Migrations automatiques au boot (idempotent, indispensable en Docker).
  try {
    const [batch, files] = await db.migrate.latest();
    if (files.length) console.log(`[6AM] migrations appliquees (batch ${batch}) : ${files.join(', ')}`);
    else console.log('[6AM] base a jour.');
  } catch (err) {
    console.error('[6AM] echec des migrations :', err.message);
    process.exit(1);
  }

  const app = require('./app');
  const server = app.listen(config.port, () => {
    console.log(`[6AM] en ecoute sur http://0.0.0.0:${config.port}`);
  });

  const shutdown = (signal) => async () => {
    console.log(`[6AM] ${signal} recu, arret en cours...`);
    server.close(async () => {
      await db.destroy().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', shutdown('SIGTERM'));
  process.on('SIGINT', shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[6AM] erreur fatale au demarrage :', err);
  process.exit(1);
});
