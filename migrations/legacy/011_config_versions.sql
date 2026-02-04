CREATE TABLE IF NOT EXISTS config_versions (
  id UUID PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  school_id TEXT REFERENCES schools(id) ON DELETE CASCADE,
  version INT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID
);

CREATE INDEX IF NOT EXISTS config_versions_client_idx ON config_versions (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS config_versions_school_idx ON config_versions (school_id, created_at DESC);
