-- Migration 020: Landing Page Questions and Webhook System
-- Add landing page questions (school-scoped custom questions)
-- Add webhook configuration for CRM integration
-- Enhance submissions table for progressive enrichment

BEGIN;

-- ============================================================================
-- 1. CREATE LANDING PAGE QUESTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS landing_page_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('text', 'textarea', 'select', 'radio', 'checkbox', 'number', 'tel', 'email')),
  help_text TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_required BOOLEAN NOT NULL DEFAULT false,
  crm_field_name TEXT, -- Optional CRM field mapping
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_landing_questions_school ON landing_page_questions(school_id, display_order);

COMMENT ON TABLE landing_page_questions IS 'Custom questions shown on all program landing pages for a school';
COMMENT ON COLUMN landing_page_questions.question_type IS 'Type of input field: text, textarea, select, radio, checkbox, number, tel, email';
COMMENT ON COLUMN landing_page_questions.crm_field_name IS 'Optional CRM field name for direct mapping';

-- ============================================================================
-- 2. CREATE LANDING PAGE QUESTION OPTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS landing_page_question_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES landing_page_questions(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  option_value TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_landing_question_options_question ON landing_page_question_options(question_id, display_order);

COMMENT ON TABLE landing_page_question_options IS 'Answer options for select/radio/checkbox landing page questions';

-- ============================================================================
-- 3. CREATE WEBHOOK CONFIGURATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS webhook_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  webhook_url TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT ARRAY['submission_created', 'quiz_started', 'stage_completed', 'submission_updated', 'quiz_completed'],
  headers JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_configs_school ON webhook_configs(school_id) WHERE is_active = true;

COMMENT ON TABLE webhook_configs IS 'Webhook configurations for CRM integration per school';
COMMENT ON COLUMN webhook_configs.events IS 'Array of event types to trigger webhook: submission_created, quiz_started, stage_completed, submission_updated, quiz_completed';
COMMENT ON COLUMN webhook_configs.headers IS 'Custom HTTP headers for webhook requests (e.g., authorization tokens)';

-- ============================================================================
-- 4. CREATE WEBHOOK LOGS TABLE
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
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_logs_config ON webhook_logs(webhook_config_id, created_at DESC);
CREATE INDEX idx_webhook_logs_submission ON webhook_logs(submission_id);
CREATE INDEX idx_webhook_logs_created ON webhook_logs(created_at DESC);

COMMENT ON TABLE webhook_logs IS 'Log of all webhook deliveries for debugging and monitoring';
COMMENT ON COLUMN webhook_logs.response_status IS 'HTTP status code from webhook endpoint';

-- ============================================================================
-- 5. ENHANCE SUBMISSIONS TABLE
-- ============================================================================

-- Add landing page answers (separate from quiz answers)
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS landing_answers JSONB DEFAULT '{}'::jsonb;

-- Add quiz progress tracking
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS quiz_progress JSONB DEFAULT '{
  "current_stage_index": 0,
  "completed_stages": [],
  "last_activity_at": null
}'::jsonb;

-- Add final recommendation
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS recommended_program_id TEXT REFERENCES programs(id) ON DELETE SET NULL;

-- Add category and program scores
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS category_scores JSONB DEFAULT '{}'::jsonb;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS program_scores JSONB DEFAULT '{}'::jsonb;

-- Add quiz timing
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS quiz_started_at TIMESTAMP;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS quiz_completed_at TIMESTAMP;

-- Add indexes for new fields
CREATE INDEX IF NOT EXISTS idx_submissions_recommended_program ON submissions(recommended_program_id);
CREATE INDEX IF NOT EXISTS idx_submissions_quiz_started ON submissions(quiz_started_at);
CREATE INDEX IF NOT EXISTS idx_submissions_quiz_completed ON submissions(quiz_completed_at);

-- Update comments
COMMENT ON COLUMN submissions.landing_answers IS 'Answers to school custom landing page questions (JSONB)';
COMMENT ON COLUMN submissions.quiz_progress IS 'Quiz flow progress tracking: current_stage_index, completed_stages, last_activity_at';
COMMENT ON COLUMN submissions.recommended_program_id IS 'Final recommended program based on quiz scores';
COMMENT ON COLUMN submissions.category_scores IS 'Category-level point scores from quiz (JSONB map: category_id -> points)';
COMMENT ON COLUMN submissions.program_scores IS 'Program-level point scores from quiz (JSONB map: program_id -> points)';
COMMENT ON COLUMN submissions.quiz_started_at IS 'Timestamp when user started the quiz (after landing page)';
COMMENT ON COLUMN submissions.quiz_completed_at IS 'Timestamp when user completed the entire quiz';

-- ============================================================================
-- 6. ADD SUBMISSION SOURCE TRACKING
-- ============================================================================

-- Track where the submission came from
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'landing_page' CHECK (source IN ('landing_page', 'direct_quiz', 'import', 'manual'));

CREATE INDEX IF NOT EXISTS idx_submissions_source ON submissions(source);

COMMENT ON COLUMN submissions.source IS 'How the submission was created: landing_page, direct_quiz, import, manual';

COMMIT;
