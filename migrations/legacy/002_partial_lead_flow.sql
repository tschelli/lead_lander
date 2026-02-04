ALTER TABLE submissions ADD COLUMN IF NOT EXISTS crm_lead_id TEXT;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS last_step_completed INT;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS created_from_step INT;

ALTER TABLE delivery_attempts ADD COLUMN IF NOT EXISTS job_type TEXT;
