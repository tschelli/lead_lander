CREATE TABLE IF NOT EXISTS schools (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  branding JSONB NOT NULL,
  compliance JSONB NOT NULL,
  crm_connection_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS schools_client_slug_idx ON schools (client_id, slug);
CREATE INDEX IF NOT EXISTS schools_client_idx ON schools (client_id);

CREATE TABLE IF NOT EXISTS crm_connections (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_connections_client_idx ON crm_connections (client_id);

CREATE TABLE IF NOT EXISTS programs (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  landing_copy JSONB NOT NULL,
  question_overrides JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS programs_client_school_slug_idx ON programs (client_id, school_id, slug);
CREATE INDEX IF NOT EXISTS programs_client_idx ON programs (client_id);
CREATE INDEX IF NOT EXISTS programs_school_idx ON programs (school_id);

CREATE TABLE IF NOT EXISTS campuses (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  routing_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  notifications JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS campuses_client_school_slug_idx ON campuses (client_id, school_id, slug);
CREATE INDEX IF NOT EXISTS campuses_client_idx ON campuses (client_id);
CREATE INDEX IF NOT EXISTS campuses_school_idx ON campuses (school_id);

CREATE TABLE IF NOT EXISTS landing_pages (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  campus_id TEXT,
  overrides JSONB,
  notifications JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (campus_id) REFERENCES campuses(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS landing_pages_unique_global_idx
  ON landing_pages (client_id, school_id, program_id, campus_id)
  WHERE campus_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS landing_pages_unique_default_idx
  ON landing_pages (client_id, school_id, program_id)
  WHERE campus_id IS NULL;

CREATE INDEX IF NOT EXISTS landing_pages_client_idx ON landing_pages (client_id);
CREATE INDEX IF NOT EXISTS landing_pages_school_idx ON landing_pages (school_id);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS users_client_email_idx
  ON users (client_id, LOWER(email));

ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS client_id TEXT REFERENCES clients(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS user_roles_client_idx ON user_roles (client_id);
