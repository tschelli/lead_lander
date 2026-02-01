-- Migration 014: Quiz Builder
-- Add tables and fields for custom questionnaire builder with point-based program recommendation

BEGIN;

-- Quiz Questions Table
-- Stores custom questions that help route users to appropriate programs
CREATE TABLE quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'single_choice', -- 'single_choice', 'multiple_choice', 'text'
  help_text TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  conditional_on JSONB, -- Show this question only if prior answer matches: {"question_id": "uuid", "option_ids": ["uuid1", "uuid2"]}
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id)
);

-- Quiz Answer Options Table
-- Stores answer choices with point assignments for program recommendations
CREATE TABLE quiz_answer_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  point_assignments JSONB DEFAULT '{}'::jsonb, -- Maps program IDs to points: {"program-id-1": 10, "program-id-2": 5}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add quiz routing flag to programs table
ALTER TABLE programs ADD COLUMN use_quiz_routing BOOLEAN DEFAULT false;

-- Create indexes for performance
CREATE INDEX idx_quiz_questions_client ON quiz_questions(client_id);
CREATE INDEX idx_quiz_questions_school ON quiz_questions(school_id);
CREATE INDEX idx_quiz_questions_order ON quiz_questions(client_id, display_order) WHERE is_active = true;
CREATE INDEX idx_quiz_answer_options_client ON quiz_answer_options(client_id);
CREATE INDEX idx_quiz_answer_options_question ON quiz_answer_options(question_id);
CREATE INDEX idx_quiz_answer_options_order ON quiz_answer_options(question_id, display_order);

-- Add comments for documentation
COMMENT ON TABLE quiz_questions IS 'Custom quiz questions that help route users to appropriate programs';
COMMENT ON TABLE quiz_answer_options IS 'Answer options for quiz questions with point-based program scoring';
COMMENT ON COLUMN quiz_questions.question_type IS 'Type of question: single_choice, multiple_choice, or text';
COMMENT ON COLUMN quiz_questions.conditional_on IS 'Conditional display logic: only show if user selected specific prior options';
COMMENT ON COLUMN quiz_answer_options.point_assignments IS 'Maps program IDs to point values for recommendation scoring';
COMMENT ON COLUMN programs.use_quiz_routing IS 'Whether this program can be recommended via quiz routing';

COMMIT;
