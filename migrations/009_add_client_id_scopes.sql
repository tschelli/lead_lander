ALTER TABLE submissions ADD COLUMN IF NOT EXISTS client_id TEXT;
ALTER TABLE delivery_attempts ADD COLUMN IF NOT EXISTS client_id TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS client_id TEXT;
ALTER TABLE admin_audit_log ADD COLUMN IF NOT EXISTS client_id TEXT;

-- Backfill client_id from schools/submissions
UPDATE submissions
SET client_id = schools.client_id
FROM schools
WHERE submissions.school_id = schools.id
  AND submissions.client_id IS NULL;

UPDATE delivery_attempts
SET client_id = submissions.client_id
FROM submissions
WHERE delivery_attempts.submission_id = submissions.id
  AND delivery_attempts.client_id IS NULL;

UPDATE audit_log
SET client_id = submissions.client_id
FROM submissions
WHERE audit_log.submission_id = submissions.id
  AND audit_log.client_id IS NULL;

UPDATE admin_audit_log
SET client_id = schools.client_id
FROM schools
WHERE admin_audit_log.school_id = schools.id
  AND admin_audit_log.client_id IS NULL;

-- Backfill user_roles.client_id from users
UPDATE user_roles
SET client_id = users.client_id
FROM users
WHERE user_roles.user_id = users.id
  AND user_roles.client_id IS NULL;

-- Enforce tenant scope
ALTER TABLE submissions
  ALTER COLUMN client_id SET NOT NULL,
  ADD CONSTRAINT submissions_client_fk FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE delivery_attempts
  ALTER COLUMN client_id SET NOT NULL,
  ADD CONSTRAINT delivery_attempts_client_fk FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE audit_log
  ALTER COLUMN client_id SET NOT NULL,
  ADD CONSTRAINT audit_log_client_fk FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE admin_audit_log
  ALTER COLUMN client_id SET NOT NULL,
  ADD CONSTRAINT admin_audit_log_client_fk FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE user_roles
  ALTER COLUMN client_id SET NOT NULL,
  ADD CONSTRAINT user_roles_client_fk FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

-- Indexes for tenant-scoped access
CREATE INDEX IF NOT EXISTS submissions_client_school_created_idx ON submissions (client_id, school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS submissions_client_school_status_idx ON submissions (client_id, school_id, status);
CREATE INDEX IF NOT EXISTS submissions_client_program_idx ON submissions (client_id, program_id);
CREATE INDEX IF NOT EXISTS submissions_client_campus_idx ON submissions (client_id, campus_id);
CREATE INDEX IF NOT EXISTS submissions_client_created_idx ON submissions (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS delivery_attempts_client_submission_idx ON delivery_attempts (client_id, submission_id);
CREATE INDEX IF NOT EXISTS delivery_attempts_client_dedupe_idx
  ON delivery_attempts (client_id, submission_id, job_type, step_index, status);

CREATE INDEX IF NOT EXISTS audit_log_client_submission_idx ON audit_log (client_id, submission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_client_school_idx
  ON admin_audit_log (client_id, school_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_roles_client_user_idx ON user_roles (client_id, user_id);
