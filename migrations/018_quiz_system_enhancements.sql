-- Migration 018: Quiz System Enhancements
-- Add program categories, quiz stages, routing rules, and enhanced quiz functionality

BEGIN;

-- ============================================================================
-- 1. PROGRAM CATEGORIES
-- ============================================================================

-- Program Categories Table
-- Groups programs into categories (Business, Medical, IT, etc.)
CREATE TABLE program_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, slug)
);

-- Add category to programs
ALTER TABLE programs ADD COLUMN category_id UUID REFERENCES program_categories(id) ON DELETE SET NULL;

CREATE INDEX idx_program_categories_client ON program_categories(client_id);
CREATE INDEX idx_program_categories_active ON program_categories(client_id, is_active, display_order);
CREATE INDEX idx_programs_category ON programs(category_id);

COMMENT ON TABLE program_categories IS 'Program categories for grouping programs (Business, Medical, IT, etc.)';
COMMENT ON COLUMN program_categories.slug IS 'Short identifier like BUS, MED, IT for scoring';

-- ============================================================================
-- 2. QUIZ STAGES
-- ============================================================================

-- Quiz Stages Table
-- Defines multi-stage quiz flow (Contact Info, Generic Questions, Category Selection, Program Selection)
CREATE TABLE quiz_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  school_id TEXT REFERENCES schools(id) ON DELETE CASCADE,
  category_id UUID REFERENCES program_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_quiz_stages_client ON quiz_stages(client_id);
CREATE INDEX idx_quiz_stages_school ON quiz_stages(school_id);
CREATE INDEX idx_quiz_stages_category ON quiz_stages(category_id);
CREATE INDEX idx_quiz_stages_order ON quiz_stages(client_id, display_order) WHERE is_active = true;

COMMENT ON TABLE quiz_stages IS 'Multi-stage quiz flow configuration';
COMMENT ON COLUMN quiz_stages.school_id IS 'NULL = client-wide stage, otherwise school-specific';
COMMENT ON COLUMN quiz_stages.category_id IS 'NULL = not category-specific, otherwise for specific category';
COMMENT ON COLUMN quiz_stages.slug IS 'Identifier like contact, generic, category_selection, program_selection';

-- ============================================================================
-- 3. ENHANCED QUIZ QUESTIONS
-- ============================================================================

-- Add stage and enhancement columns to quiz_questions
ALTER TABLE quiz_questions
  ADD COLUMN stage_id UUID REFERENCES quiz_stages(id) ON DELETE CASCADE,
  ADD COLUMN is_contact_field BOOLEAN DEFAULT false,
  ADD COLUMN contact_field_type TEXT,
  ADD COLUMN disqualifies_lead BOOLEAN DEFAULT false,
  ADD COLUMN disqualification_reason TEXT;

CREATE INDEX idx_quiz_questions_stage ON quiz_questions(stage_id);

COMMENT ON COLUMN quiz_questions.stage_id IS 'Which stage this question belongs to';
COMMENT ON COLUMN quiz_questions.is_contact_field IS 'True for First Name, Last Name, Email, Phone fields';
COMMENT ON COLUMN quiz_questions.contact_field_type IS 'first_name, last_name, email, phone, campus, program';
COMMENT ON COLUMN quiz_questions.disqualifies_lead IS 'If any answer disqualifies lead';
COMMENT ON COLUMN quiz_questions.disqualification_reason IS 'Reason shown when lead is disqualified';

-- ============================================================================
-- 4. ENHANCED ANSWER OPTIONS
-- ============================================================================

-- Add category points to quiz_answer_options
ALTER TABLE quiz_answer_options
  ADD COLUMN category_points JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN disqualifies_lead BOOLEAN DEFAULT false,
  ADD COLUMN disqualification_reason TEXT,
  ADD COLUMN routes_to_program_id TEXT REFERENCES programs(id) ON DELETE SET NULL;

COMMENT ON COLUMN quiz_answer_options.category_points IS 'Maps category IDs to points: {"uuid": 1, "uuid2": 2}';
COMMENT ON COLUMN quiz_answer_options.disqualifies_lead IS 'If selecting this option disqualifies lead';
COMMENT ON COLUMN quiz_answer_options.disqualification_reason IS 'Reason for disqualification';
COMMENT ON COLUMN quiz_answer_options.routes_to_program_id IS 'Directly route to this program (bypasses scoring)';

-- ============================================================================
-- 5. QUIZ SESSIONS
-- ============================================================================

-- Quiz Sessions Table
-- Tracks user progress through multi-stage quiz
CREATE TABLE quiz_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  current_stage_id UUID REFERENCES quiz_stages(id),
  current_stage_order INTEGER DEFAULT 0,
  contact_info JSONB DEFAULT '{}'::jsonb,
  answers JSONB DEFAULT '{}'::jsonb,
  category_scores JSONB DEFAULT '{}'::jsonb,
  program_scores JSONB DEFAULT '{}'::jsonb,
  recommended_category_id UUID REFERENCES program_categories(id),
  recommended_program_id TEXT REFERENCES programs(id),
  selected_program_id TEXT REFERENCES programs(id),
  is_disqualified BOOLEAN DEFAULT false,
  disqualification_reasons JSONB DEFAULT '[]'::jsonb,
  financial_aid_interested BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_quiz_sessions_school ON quiz_sessions(school_id);
CREATE INDEX idx_quiz_sessions_created ON quiz_sessions(created_at);
CREATE INDEX idx_quiz_sessions_completed ON quiz_sessions(completed_at) WHERE completed_at IS NOT NULL;

COMMENT ON TABLE quiz_sessions IS 'Tracks user progress through multi-stage quiz flow';
COMMENT ON COLUMN quiz_sessions.contact_info IS 'Contact fields: first_name, last_name, email, phone, campus';
COMMENT ON COLUMN quiz_sessions.answers IS 'Maps question_id to option_id or text answer';
COMMENT ON COLUMN quiz_sessions.category_scores IS 'Accumulated points per category';
COMMENT ON COLUMN quiz_sessions.program_scores IS 'Accumulated points per program';
COMMENT ON COLUMN quiz_sessions.selected_program_id IS 'Program user manually selected (overrides recommendation)';

-- ============================================================================
-- 6. ENHANCED SUBMISSIONS TABLE
-- ============================================================================

-- Add quiz session tracking to submissions
ALTER TABLE submissions
  ADD COLUMN quiz_session_id UUID REFERENCES quiz_sessions(id) ON DELETE SET NULL,
  ADD COLUMN is_qualified BOOLEAN DEFAULT true,
  ADD COLUMN disqualification_reasons JSONB DEFAULT '[]'::jsonb;

CREATE INDEX idx_submissions_quiz_session ON submissions(quiz_session_id);
CREATE INDEX idx_submissions_qualified ON submissions(is_qualified);

COMMENT ON COLUMN submissions.quiz_session_id IS 'Quiz session that generated this submission';
COMMENT ON COLUMN submissions.is_qualified IS 'Whether lead met qualification criteria';
COMMENT ON COLUMN submissions.disqualification_reasons IS 'Array of reasons if disqualified';

-- ============================================================================
-- 7. AUDIT TRIGGERS
-- ============================================================================

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_program_categories_updated_at
  BEFORE UPDATE ON program_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_quiz_stages_updated_at
  BEFORE UPDATE ON quiz_stages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_quiz_sessions_updated_at
  BEFORE UPDATE ON quiz_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
