'use strict';
const config = require('../config');

/**
 * Envoi optionnel d'un embed Discord (logs RH).
 * Ne fait rien si DISCORD_WEBHOOK_URL est vide. N'echoue jamais bruyamment.
 */
async function notify({ title, description, color = 0x4a6a8f, fields = [] }) {
  if (!config.discordWebhook.url) return false;
  try {
    const res = await fetch(config.discordWebhook.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: config.discordWebhook.username,
        embeds: [{
          title,
          description,
          color,
          fields,
          footer: { text: config.site.name },
          timestamp: new Date().toISOString(),
        }],
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn('[discord] webhook non envoye :', err.message);
    return false;
  }
}

module.exports = { notify };
