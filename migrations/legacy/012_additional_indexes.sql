-- Additional performance indexes for tenant-scoped queries
-- These complement the indexes created in 009_add_client_id_scopes.sql

-- Enable trigram extension for fuzzy text search (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Optimize idempotency key lookups (used in form submission)
-- Already has unique constraint, but add compound index for faster tenant-scoped lookups
CREATE INDEX IF NOT EXISTS submissions_idempotency_client_idx
  ON submissions (idempotency_key, client_id);

-- Optimize admin search queries (email, phone, name searches)
-- These are used in the admin database view search functionality
CREATE INDEX IF NOT EXISTS submissions_email_search_idx
  ON submissions (client_id, school_id, LOWER(email));

CREATE INDEX IF NOT EXISTS submissions_phone_search_idx
  ON submissions (client_id, school_id, phone)
  WHERE phone IS NOT NULL;

-- Text search optimization for first/last name (case-insensitive)
CREATE INDEX IF NOT EXISTS submissions_first_name_trgm_idx
  ON submissions USING gin (LOWER(first_name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS submissions_last_name_trgm_idx
  ON submissions USING gin (LOWER(last_name) gin_trgm_ops);

-- Optimize delivery status queries
CREATE INDEX IF NOT EXISTS submissions_client_status_created_idx
  ON submissions (client_id, status, created_at DESC);

-- Optimize worker metrics queries (delivery attempts by client/school)
CREATE INDEX IF NOT EXISTS delivery_attempts_client_school_status_idx
  ON delivery_attempts (client_id, submission_id, status, created_at DESC);

-- Optimize user lookup by email (for login)
CREATE INDEX IF NOT EXISTS users_client_email_idx
  ON users (client_id, LOWER(email));

-- Optimize school lookup queries
CREATE INDEX IF NOT EXISTS schools_client_slug_idx
  ON schools (client_id, slug);

CREATE INDEX IF NOT EXISTS schools_slug_idx
  ON schools (slug);

-- Optimize program/campus queries
CREATE INDEX IF NOT EXISTS programs_client_school_idx
  ON programs (client_id, school_id);

CREATE INDEX IF NOT EXISTS campuses_client_school_idx
  ON campuses (client_id, school_id);

-- Optimize landing page lookups
CREATE INDEX IF NOT EXISTS landing_pages_school_program_idx
  ON landing_pages (school_id, program_id);

-- Optimize CRM connection lookups
CREATE INDEX IF NOT EXISTS crm_connections_client_idx
  ON crm_connections (client_id);
