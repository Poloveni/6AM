-- 6AM — schéma de la base du QG (appliqué automatiquement au démarrage, sans effacer l'existant)
CREATE TABLE IF NOT EXISTS members (
  id            SERIAL PRIMARY KEY,
  discord_id    VARCHAR(32) UNIQUE NOT NULL,
  username      VARCHAR(64) NOT NULL,            -- pseudo Discord
  avatar        VARCHAR(128),                    -- identifiant de l'avatar Discord
  display_name  VARCHAR(64),                     -- nom RP (modifiable par le membre)
  rank          VARCHAR(32) NOT NULL,            -- voir server/src/ranks.js
  bio           TEXT,
  phone_rp      VARCHAR(32),
  is_admin      BOOLEAN NOT NULL DEFAULT FALSE,
  status        VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  approved_at   TIMESTAMPTZ,
  approved_by   INTEGER REFERENCES members(id) ON DELETE SET NULL,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login    TIMESTAMPTZ
);

-- sessions de connexion (connect-pg-simple)
CREATE TABLE IF NOT EXISTS session (
  sid    VARCHAR NOT NULL COLLATE "default" PRIMARY KEY,
  sess   JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_expire ON session (expire);

-- le Salon (discussion interne)
CREATE TABLE IF NOT EXISTS messages (
  id          SERIAL PRIMARY KEY,
  member_id   INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  content     VARCHAR(1000) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages (created_at DESC);
CREATE TABLE IF NOT EXISTS chat_reads (
  member_id    INTEGER PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  last_read_id INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- organigramme public (modifiable depuis le QG)
CREATE TABLE IF NOT EXISTS org_entries (
  id          SERIAL PRIMARY KEY,
  rank        VARCHAR(32) NOT NULL,
  name        VARCHAR(64) NOT NULL,
  subtitle    VARCHAR(80),
  description TEXT,
  photo       VARCHAR(200),                    -- portrait (/assets/… ou /uploads/…)
  is_open     BOOLEAN NOT NULL DEFAULT FALSE,
  position    INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE org_entries ADD COLUMN IF NOT EXISTS photo VARCHAR(200);
CREATE TABLE IF NOT EXISTS org_rank_desc (
  rank        VARCHAR(32) PRIMARY KEY,
  description TEXT
);

-- galerie photo
CREATE TABLE IF NOT EXISTS photos (
  id          SERIAL PRIMARY KEY,
  member_id   INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  file        VARCHAR(80) NOT NULL,
  thumb       VARCHAR(80) NOT NULL,
  width       INTEGER,
  height      INTEGER,
  caption     VARCHAR(200),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_photos_created ON photos (created_at DESC);
