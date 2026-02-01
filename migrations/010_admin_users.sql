ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE admin_audit_log ALTER COLUMN school_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS users_client_active_idx ON users (client_id, is_active);
