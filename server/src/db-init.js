// Applique le schéma de la base à la main (normalement inutile : le serveur le fait au démarrage).
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(here, '..', 'sql', 'schema.sql'), 'utf8');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(sql);
console.log('Schéma du QG appliqué.');
await pool.end();
