-- ============================================================================
-- Lead Lander v2 - Fresh Database Schema
-- ============================================================================
-- This is a fresh schema for the accounts-refactor initiative.
-- Terminology changes:
--   - schools → accounts (education-agnostic)
--   - campuses → locations (with billing tracking)
--   - programs (simplified, account-scoped for quiz scoring)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. CLIENTS TABLE
-- ============================================================================
-- Represents your business entity (the SaaS provider)
-- One client can have multiple accounts (customers)

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clients_created ON clients(created_at);

COMMENT ON TABLE clients IS 'SaaS provider entity - represents your business';

-- ============================================================================
-- 2. ACCOUNTS TABLE (formerly schools)
-- ============================================================================
-- Represents your customers (formerly schools, now education-agnostic)
-- Each account has one landing page at /{account_slug}

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  branding JSONB NOT NULL DEFAULT '{}'::jsonb,
  compliance JSONB NOT NULL DEFAULT '{}'::jsonb,
  footer_content JSONB DEFAULT '{}'::jsonb,
  thank_you JSONB DEFAULT '{}'::jsonb,
  crm_connection_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_accounts_slug ON accounts(slug) WHERE is_active = true;
CREATE INDEX idx_accounts_client ON accounts(client_id);
CREATE INDEX idx_accounts_active ON accounts(is_active);

COMMENT ON TABLE accounts IS 'Customer accounts (formerly schools) - education-agnostic';
COMMENT ON COLUMN accounts.slug IS 'URL slug for landing page: /{slug}';
COMMENT ON COLUMN accounts.branding IS 'Logo, colors, etc.';
COMMENT ON COLUMN accounts.compliance IS 'Disclaimer text and version';
COMMENT ON COLUMN accounts.footer_content IS 'Social links and custom links';
COMMENT ON COLUMN accounts.thank_you IS 'Thank you page customization';

-- ============================================================================
-- 3. LOCATIONS TABLE (formerly campuses)
-- ============================================================================
-- Represents physical locations for an account
-- Used for billing (number of locations) and lead routing

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  routing_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  notifications JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_locations_account_slug ON locations(account_id, slug) WHERE is_active = true;
CREATE INDEX idx_locations_client ON locations(client_id);
CREATE INDEX idx_locations_account ON locations(account_id);
CREATE INDEX idx_locations_zip ON locations(zip_code);
CREATE INDEX idx_locations_geo ON locations(latitude, longitude);

COMMENT ON TABLE locations IS 'Physical locations (formerly campuses) - used for billing and routing';
COMMENT ON COLUMN locations.routing_tags IS 'Tags for CRM routing';
COMMENT ON COLUMN locations.notifications IS 'Email notification settings';
COMMENT ON COLUMN locations.zip_code IS 'ZIP code for distance calculations';
COMMENT ON COLUMN locations.latitude IS 'Latitude for distance calculations';
COMMENT ON COLUMN locations.longitude IS 'Longitude for distance calculations';

-- ============================================================================
-- 4. PROGRAMS TABLE
-- ============================================================================
-- Represents educational programs or service offerings
-- Simplified, account-scoped for quiz scoring and recommendations

CREATE TABLE IF NOT EXISTS programs (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  landing_copy JSONB DEFAULT '{}'::jsonb,
  lead_form JSONB DEFAULT '{}'::jsonb,
  hero_image TEXT,
  hero_background_color TEXT,
  hero_background_image TEXT,
  highlights JSONB DEFAULT '[]'::jsonb,
  testimonials JSONB DEFAULT '[]'::jsonb,
  faqs JSONB DEFAULT '[]'::jsonb,
  stats JSONB DEFAULT '{}'::jsonb,
  sections_config JSONB DEFAULT '{}'::jsonb,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_programs_account_slug ON programs(account_id, slug) WHERE is_active = true;
CREATE INDEX idx_programs_client ON programs(client_id);
CREATE INDEX idx_programs_account ON programs(account_id);
CREATE INDEX idx_programs_active_order ON programs(account_id, display_order) WHERE is_active = true;

COMMENT ON TABLE programs IS 'Programs or service offerings for quiz scoring';
COMMENT ON COLUMN programs.landing_copy IS 'Program-specific landing copy (optional, for program detail pages)';
COMMENT ON COLUMN programs.lead_form IS 'Custom lead form fields';

-- ============================================================================
-- 5. CRM CONNECTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_connections (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_crm_connections_client ON crm_connections(client_id);
CREATE INDEX idx_crm_connections_account ON crm_connections(account_id);

COMMENT ON TABLE crm_connections IS 'CRM integration configurations';
COMMENT ON COLUMN crm_connections.account_id IS 'Null for client-level connections';

-- Update accounts table foreign key
ALTER TABLE accounts
  ADD CONSTRAINT fk_accounts_crm_connection
  FOREIGN KEY (crm_connection_id) REFERENCES crm_connections(id) ON DELETE SET NULL;

-- ============================================================================
-- 6. QUIZ QUESTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('single_choice', 'multiple_choice', 'text')),
  help_text TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  conditional_on JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quiz_questions_client ON quiz_questions(client_id);
CREATE INDEX idx_quiz_questions_account ON quiz_questions(account_id);
CREATE INDEX idx_quiz_questions_order ON quiz_questions(account_id, display_order) WHERE is_active = true;

COMMENT ON TABLE quiz_questions IS 'Quiz questions for program recommendations';
COMMENT ON COLUMN quiz_questions.account_id IS 'Null for client-level questions, scoped for account-specific';
COMMENT ON COLUMN quiz_questions.conditional_on IS 'Show question conditionally: {questionId, optionIds}';

-- ============================================================================
-- 7. QUIZ ANSWER OPTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS quiz_answer_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  point_assignments JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quiz_answer_options_question ON quiz_answer_options(question_id, display_order);

COMMENT ON TABLE quiz_answer_options IS 'Answer options for quiz questions';
COMMENT ON COLUMN quiz_answer_options.point_assignments IS 'Map of program_id -> points for scoring';

-- ============================================================================
-- 8. LANDING PAGE QUESTIONS TABLE
-- ============================================================================
-- Custom questions shown on account landing pages (before quiz)

CREATE TABLE IF NOT EXISTS landing_page_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('text', 'textarea', 'select', 'radio', 'checkbox', 'number', 'tel', 'email', 'zip')),
  help_text TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_required BOOLEAN NOT NULL DEFAULT false,
  crm_field_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_landing_questions_account ON landing_page_questions(account_id, display_order) WHERE is_active = true;

COMMENT ON TABLE landing_page_questions IS 'Custom questions on landing pages (e.g., ZIP code)';

-- ============================================================================
-- 9. LANDING PAGE QUESTION OPTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS landing_page_question_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES landing_page_questions(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  option_value TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_landing_question_options_question ON landing_page_question_options(question_id, display_order);

-- ============================================================================
-- 10. SUBMISSIONS TABLE
-- ============================================================================
-- Tracks all lead submissions

CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  location_id TEXT REFERENCES locations(id) ON DELETE SET NULL,
  program_id TEXT REFERENCES programs(id) ON DELETE SET NULL,
  recommended_program_id TEXT REFERENCES programs(id) ON DELETE SET NULL,

  -- Contact information
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  zip_code TEXT,

  -- Answers and progress
  landing_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  quiz_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  quiz_progress JSONB DEFAULT '{}'::jsonb,

  -- Scoring
  category_scores JSONB DEFAULT '{}'::jsonb,
  program_scores JSONB DEFAULT '{}'::jsonb,

  -- Metadata
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  source TEXT NOT NULL DEFAULT 'landing_page' CHECK (source IN ('landing_page', 'direct_quiz', 'import', 'manual')),

  -- Consent
  consented BOOLEAN NOT NULL,
  consent_text_version TEXT NOT NULL,
  consent_timestamp TIMESTAMPTZ NOT NULL,

  -- Timing
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  quiz_started_at TIMESTAMPTZ,
  quiz_completed_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,

  -- CRM tracking
  crm_lead_id TEXT,
  idempotency_key TEXT UNIQUE NOT NULL
);

CREATE INDEX idx_submissions_client ON submissions(client_id);
CREATE INDEX idx_submissions_account ON submissions(account_id);
CREATE INDEX idx_submissions_location ON submissions(location_id);
CREATE INDEX idx_submissions_program ON submissions(program_id);
CREATE INDEX idx_submissions_recommended ON submissions(recommended_program_id);
CREATE INDEX idx_submissions_status ON submissions(status);
CREATE INDEX idx_submissions_source ON submissions(source);
CREATE INDEX idx_submissions_created ON submissions(created_at DESC);
CREATE INDEX idx_submissions_email ON submissions(email);

COMMENT ON TABLE submissions IS 'All lead submissions from landing pages and quizzes';
COMMENT ON COLUMN submissions.landing_answers IS 'Answers to landing page questions (ZIP code, etc.)';
COMMENT ON COLUMN submissions.quiz_answers IS 'Answers to quiz questions';
COMMENT ON COLUMN submissions.quiz_progress IS 'Quiz progress tracking';
COMMENT ON COLUMN submissions.recommended_program_id IS 'Final recommended program based on quiz';

-- ============================================================================
-- 11. DELIVERY ATTEMPTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS delivery_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  status TEXT NOT NULL,
  response_code INTEGER,
  response_body TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_delivery_attempts_submission ON delivery_attempts(submission_id);
CREATE INDEX idx_delivery_attempts_status ON delivery_attempts(status);

-- ============================================================================
-- 12. WEBHOOK CONFIGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS webhook_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  webhook_url TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT ARRAY['submission_created', 'quiz_started', 'quiz_completed', 'submission_updated'],
  headers JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_configs_account ON webhook_configs(account_id) WHERE is_active = true;

COMMENT ON TABLE webhook_configs IS 'Webhook configurations for CRM integration';

-- ============================================================================
-- 13. WEBHOOK LOGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_config_id UUID NOT NULL REFERENCES webhook_configs(id) ON DELETE CASCADE,
  submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_logs_config ON webhook_logs(webhook_config_id, created_at DESC);
CREATE INDEX idx_webhook_logs_submission ON webhook_logs(submission_id);
CREATE INDEX idx_webhook_logs_created ON webhook_logs(created_at DESC);

-- ============================================================================
-- 14. AUDIT LOG TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_submission ON audit_log(submission_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);

-- ============================================================================
-- 15. USERS TABLE (Admin)
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_users_client_email ON users(client_id, LOWER(email)) WHERE is_active = true;
CREATE INDEX idx_users_client ON users(client_id);

-- ============================================================================
-- 16. USER ROLES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'client_admin', 'account_admin', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_client ON user_roles(client_id);
CREATE INDEX idx_user_roles_account ON user_roles(account_id);

COMMENT ON TABLE user_roles IS 'User permissions - scoped to client or account level';
COMMENT ON COLUMN user_roles.account_id IS 'Null for client-level roles';

-- ============================================================================
-- 17. SCHEMA MIGRATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mark this schema as applied
INSERT INTO schema_migrations (id) VALUES ('schema_v2') ON CONFLICT DO NOTHING;

COMMIT;
