ALTER TABLE programs
  ADD COLUMN IF NOT EXISTS lead_form_config JSONB DEFAULT '{}'::jsonb;
