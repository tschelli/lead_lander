-- Migration 019: Refactor Quiz System to School Scope
-- Move quiz system from client-scoped to school-scoped
-- Delete old quiz builder tables
-- Add disqualification config to schools

BEGIN;

-- ============================================================================
-- 1. DROP OLD QUIZ BUILDER TABLES
-- ============================================================================

-- Drop old quiz tables from migration 014 (simple quiz builder)
DROP TABLE IF EXISTS quiz_answer_options CASCADE;
DROP TABLE IF EXISTS quiz_questions CASCADE;

-- ============================================================================
-- 2. REFACTOR PROGRAM CATEGORIES TO SCHOOL SCOPE
-- ============================================================================

-- Drop existing foreign key constraint FIRST (before any data manipulation)
ALTER TABLE program_categories DROP CONSTRAINT IF EXISTS program_categories_client_id_fkey;

-- Drop unique constraint FIRST
ALTER TABLE program_categories DROP CONSTRAINT IF EXISTS program_categories_client_id_slug_key;

-- Check if program_categories has any existing data
-- If it does, we need to handle it carefully
DO $$
DECLARE
  category_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO category_count FROM program_categories;

  IF category_count > 0 THEN
    -- There's existing data - let's try to migrate it or clear it
    -- Option 1: Try to find a matching school for each category
    -- Option 2: If no matching school, delete the orphaned categories

    -- Delete categories where client_id doesn't match any school's client_id
    DELETE FROM program_categories pc
    WHERE NOT EXISTS (
      SELECT 1 FROM schools s WHERE s.client_id = pc.client_id
    );

    -- For remaining categories, update to use the first school of that client
    UPDATE program_categories pc
    SET client_id = (
      SELECT s.id
      FROM schools s
      WHERE s.client_id = pc.client_id
      LIMIT 1
    )
    WHERE EXISTS (
      SELECT 1 FROM schools s WHERE s.client_id = pc.client_id
    );

  END IF;
END $$;

-- Rename client_id to school_id
ALTER TABLE program_categories RENAME COLUMN client_id TO school_id;

-- Add new foreign key to schools
ALTER TABLE program_categories
  ADD CONSTRAINT program_categories_school_id_fkey
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;

-- Add unique constraint to use school_id
ALTER TABLE program_categories ADD CONSTRAINT program_categories_school_id_slug_key UNIQUE(school_id, slug);

-- Update indexes
DROP INDEX IF EXISTS idx_program_categories_client;
DROP INDEX IF EXISTS idx_program_categories_active;
CREATE INDEX idx_program_categories_school ON program_categories(school_id);
CREATE INDEX idx_program_categories_active ON program_categories(school_id, is_active, display_order);

-- Update comment
COMMENT ON TABLE program_categories IS 'Program categories for grouping programs (Business, Medical, IT, etc.) - scoped to school';

-- ============================================================================
-- 3. REFACTOR QUIZ STAGES TO SCHOOL SCOPE
-- ============================================================================

-- Handle existing quiz_stages data
DO $$
DECLARE
  stage_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO stage_count FROM quiz_stages;

  IF stage_count > 0 THEN
    -- Delete stages where school_id is NULL and client_id doesn't match any school
    DELETE FROM quiz_stages qs
    WHERE qs.school_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM schools s WHERE s.client_id = qs.client_id
    );

    -- For stages with NULL school_id, assign them to the first school of their client
    UPDATE quiz_stages qs
    SET school_id = (
      SELECT s.id
      FROM schools s
      WHERE s.client_id = qs.client_id
      LIMIT 1
    )
    WHERE qs.school_id IS NULL
    AND EXISTS (
      SELECT 1 FROM schools s WHERE s.client_id = qs.client_id
    );

  END IF;
END $$;

-- Remove client_id column (stages are now school-only)
ALTER TABLE quiz_stages DROP COLUMN IF EXISTS client_id CASCADE;

-- Make school_id NOT NULL (all stages must belong to a school)
ALTER TABLE quiz_stages ALTER COLUMN school_id SET NOT NULL;

-- Update indexes
DROP INDEX IF EXISTS idx_quiz_stages_client;
DROP INDEX IF EXISTS idx_quiz_stages_order;
CREATE INDEX idx_quiz_stages_order ON quiz_stages(school_id, display_order) WHERE is_active = true;

-- Update comment
COMMENT ON COLUMN quiz_stages.school_id IS 'School that owns this stage (required)';

-- ============================================================================
-- 4. REFACTOR QUIZ QUESTIONS TO SCHOOL SCOPE
-- ============================================================================

-- Note: quiz_questions already has both client_id and school_id from migration 018
-- We'll keep both for now but make school_id the primary scope

-- Make school_id NOT NULL if it isn't already
-- (Some existing questions might not have school_id, so we'll need to handle this carefully)
-- For now, we'll just ensure the index is correct
CREATE INDEX IF NOT EXISTS idx_quiz_questions_school ON quiz_questions(school_id) WHERE school_id IS NOT NULL;

-- Update comment
COMMENT ON TABLE quiz_questions IS 'Quiz questions belonging to stages - primarily scoped to school';

-- ============================================================================
-- 5. UPDATE QUIZ SESSIONS TO ENSURE SCHOOL SCOPE
-- ============================================================================

-- quiz_sessions already has school_id as NOT NULL, which is correct
-- Just verify the index exists
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_school ON quiz_sessions(school_id);

-- Remove client_id if it exists (sessions should only reference school)
ALTER TABLE quiz_sessions DROP COLUMN IF EXISTS client_id CASCADE;

-- ============================================================================
-- 6. ADD DISQUALIFICATION CONFIG TO SCHOOLS
-- ============================================================================

-- Add disqualification_config field to schools
ALTER TABLE schools ADD COLUMN IF NOT EXISTS disqualification_config JSONB DEFAULT '{
  "headline": "Thank you for your interest",
  "subheadline": "Unfortunately, we are unable to process your application at this time",
  "text": "Please contact us if you have any questions.",
  "link": ""
}'::jsonb;

COMMENT ON COLUMN schools.disqualification_config IS 'Configuration for disqualification page shown when user is disqualified from quiz';

-- ============================================================================
-- 7. REMOVE use_quiz_routing FROM PROGRAMS
-- ============================================================================

-- All programs now always use quiz routing (school master quiz)
ALTER TABLE programs DROP COLUMN IF EXISTS use_quiz_routing CASCADE;

COMMENT ON TABLE programs IS 'Programs offered by schools - landing pages that route to school master quiz';

-- ============================================================================
-- 8. UPDATE PROGRAMS TABLE TO ENSURE CONSISTENCY
-- ============================================================================

-- Ensure category_id references the updated program_categories table
-- (should already be correct, but let's verify the constraint exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'programs_category_id_fkey'
  ) THEN
    ALTER TABLE programs
      ADD CONSTRAINT programs_category_id_fkey
      FOREIGN KEY (category_id) REFERENCES program_categories(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;
