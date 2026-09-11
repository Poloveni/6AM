// Contrôles automatiques du projet :  npm test
// - syntaxe de tous les fichiers JavaScript et des scripts intégrés aux pages
// - JSON valides
// - liens vers des fichiers locaux qui existent vraiment
// - aucune clé secrète écrite en dur dans le code
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const ignored = new Set(['node_modules', '.git', 'uploads']);
const files = [];
(function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(item.name)) continue;
    const full = path.join(dir, item.name);
    if (item.isDirectory()) walk(full); else files.push(full);
  }
})(root);

const errors = [];
const text = files.filter(f => /\.(?:html|css|js|mjs|sql|json|md|yml|yaml|txt|sh|example)$/i.test(f) && !f.includes(`${path.sep}vendor${path.sep}`));
const secrets = [
  [/DISCORD_CLIENT_SECRET=\S{10,}/, 'secret Discord'],
  [/SESSION_SECRET=[0-9a-f]{32,}/i, 'clé de session'],
  [/POSTGRES_PASSWORD=[0-9a-f]{16,}/i, 'mot de passe de base de données'],
  [/[MN][A-Za-z\d]{23,25}\.[\w-]{6}\.[\w-]{27,}/, 'token de bot Discord'],
];
for (const file of text) {
  const rel = path.relative(root, file);
  const src = fs.readFileSync(file, 'utf8');
  if (!rel.startsWith('scripts')) for (const [re, what] of secrets) if (re.test(src)) errors.push(`${rel} : ${what} écrit en dur — à retirer !`);
  if (/\.json$/i.test(file)) { try { JSON.parse(src); } catch (e) { errors.push(`${rel} : JSON invalide — ${e.message}`); } }
  if (/\.(?:js|mjs)$/i.test(file)) {
    const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (r.status !== 0) errors.push(`${rel} : JavaScript invalide — ${(r.stderr || r.stdout).trim().split('\n').slice(0, 4).join(' ')}`);
  }
  if (/\.html$/i.test(file)) {
    [...src.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)].forEach((m, i) => {
      try { new vm.Script(m[2], { filename: `${rel}#script-${i + 1}` }); } catch (e) { errors.push(`${rel} : script intégré n°${i + 1} invalide — ${e.message}`); }
    });
    for (const [, ref] of src.matchAll(/(?:href|src)=["']([^"'#?]+)["']/gi)) {
      if (/^(?:https?:|data:|mailto:|tel:|\/\/)/i.test(ref) || /[${}]/.test(ref)) continue;
      if (/^\.\.\/(?:auth|api)\//.test(ref) || /^(?:auth|api)\//.test(ref)) continue;   // routes du serveur
      const target = ref.startsWith('/') ? path.join(root, ref) : path.resolve(path.dirname(file), decodeURIComponent(ref));
      if (!fs.existsSync(target)) errors.push(`${rel} : fichier introuvable — ${ref}`);
    }
  }
  if (/\.css$/i.test(file)) {
    for (const [, ref] of src.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
      if (/^(?:data:|https?:|#|%23)/.test(ref)) continue;
      if (!fs.existsSync(path.resolve(path.dirname(file), ref))) errors.push(`${rel} : fichier introuvable — ${ref}`);
    }
  }
}
// les fichiers de polices déclarés dans vendor/fonts.css
const fontsCss = path.join(root, 'vendor', 'fonts.css');
if (fs.existsSync(fontsCss)) for (const [, ref] of fs.readFileSync(fontsCss, 'utf8').matchAll(/url\(([^)]+)\)/g))
  if (!fs.existsSync(path.join(root, 'vendor', ref))) errors.push(`vendor/fonts.css : police introuvable — ${ref}`);

if (errors.length) { console.error(`Échec des contrôles (${errors.length}) :\n- ${errors.join('\n- ')}`); process.exit(1); }
console.log(`Contrôles réussis : ${files.length} fichiers vérifiés (syntaxe, liens, secrets).`);
