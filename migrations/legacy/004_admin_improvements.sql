ALTER TABLE delivery_attempts ADD COLUMN IF NOT EXISTS step_index INT;

CREATE INDEX IF NOT EXISTS submissions_created_at_idx ON submissions (created_at);
CREATE INDEX IF NOT EXISTS submissions_program_id_idx ON submissions (program_id);
CREATE INDEX IF NOT EXISTS submissions_campus_id_idx ON submissions (campus_id);
CREATE INDEX IF NOT EXISTS submissions_email_idx ON submissions (email);
CREATE INDEX IF NOT EXISTS submissions_school_created_idx ON submissions (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS submissions_school_status_idx ON submissions (school_id, status);

CREATE INDEX IF NOT EXISTS delivery_attempts_dedupe_idx
  ON delivery_attempts (submission_id, job_type, step_index, status);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY,
  school_id TEXT NOT NULL,
  event TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_audit_school_idx
  ON admin_audit_log (school_id, created_at DESC);
