'use strict';
const crypto = require('crypto');
const config = require('../config');

/**
 * Connexion « Se connecter avec Discord » (OAuth2).
 *
 * On ne demande que deux portees :
 *   identify            -> le pseudo, l'identifiant et l'avatar
 *   guilds.members.read  -> savoir si la personne est bien sur le serveur 6AM
 *
 * Pas de portee email : le site n'en a pas besoin, autant ne pas la reclamer.
 * Le jeton d'acces ne sert qu'une fois, le temps de la connexion, puis il est
 * revoque : rien n'est stocke.
 */

const AUTORISATION = 'https://discord.com/api/oauth2/authorize';
const JETON = 'https://discord.com/api/oauth2/token';
const REVOCATION = 'https://discord.com/api/oauth2/token/revoke';
const API = 'https://discord.com/api/v10';
const PORTEES = 'identify guilds.members.read';
const DELAI = 10000;

function redirectUri() {
  return `${config.appUrl}/connexion/discord/retour`;
}

/** La connexion Discord n'est proposee que si les trois secrets sont presents. */
function actif() {
  const d = config.discordAuth;
  return Boolean(d.clientId && d.clientSecret && d.guildId);
}

function nouvelEtat() {
  return crypto.randomBytes(24).toString('hex');
}

function urlAutorisation(etat) {
  const p = new URLSearchParams({
    client_id: config.discordAuth.clientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: PORTEES,
    state: etat,
    prompt: 'none',
  });
  return `${AUTORISATION}?${p.toString()}`;
}

async function appel(url, options) {
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), DELAI);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(minuteur);
  }
}

/** Echange le code recu contre un jeton d'acces. */
async function echangerCode(code) {
  const res = await appel(JETON, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.discordAuth.clientId,
      client_secret: config.discordAuth.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
    }),
  });
  if (!res.ok) {
    // On ne recopie jamais le corps de la reponse : il peut contenir le secret.
    throw new Error(`echange du code refuse (HTTP ${res.status})`);
  }
  const data = await res.json();
  if (!data.access_token) throw new Error('reponse sans jeton d acces');
  return data.access_token;
}

/** Pseudo, identifiant et avatar. */
async function profil(jeton) {
  const res = await appel(`${API}/users/@me`, {
    headers: { Authorization: `Bearer ${jeton}` },
  });
  if (!res.ok) throw new Error(`profil illisible (HTTP ${res.status})`);
  return res.json();
}

/**
 * Fiche de la personne sur le serveur 6AM.
 * Renvoie null si elle n'en fait pas partie (Discord repond 404).
 */
async function membreDuServeur(jeton) {
  const res = await appel(`${API}/users/@me/guilds/${config.discordAuth.guildId}/member`, {
    headers: { Authorization: `Bearer ${jeton}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`appartenance au serveur illisible (HTTP ${res.status})`);
  return res.json();
}

/** Le jeton n'a plus d'utilite une fois la session ouverte : on le rend. */
async function revoquer(jeton) {
  try {
    await appel(REVOCATION, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.discordAuth.clientId,
        client_secret: config.discordAuth.clientSecret,
        token: jeton,
      }),
    });
  } catch (err) {
    console.warn('[discord] revocation du jeton impossible :', err.message);
  }
}

/** URL de l'avatar, ou null. Sert uniquement a l'affichage. */
function urlAvatar(discordId, hash, taille = 64) {
  if (!hash) return null;
  const ext = String(hash).startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${discordId}/${hash}.${ext}?size=${taille}`;
}

module.exports = {
  actif, nouvelEtat, urlAutorisation, echangerCode,
  profil, membreDuServeur, revoquer, urlAvatar, redirectUri, PORTEES,
};
