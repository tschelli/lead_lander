-- Migration 013: Landing Page Builder
-- Add fields to support enhanced landing page builder with template selection

BEGIN;

-- Add landing page template type
-- 'minimal' = Hero with embedded form (conversion-focused)
-- 'full' = All sections (highlights, testimonials, FAQs, stats)
ALTER TABLE programs ADD COLUMN template_type TEXT DEFAULT 'full';

-- Hero section customization
ALTER TABLE programs ADD COLUMN hero_image TEXT;
ALTER TABLE programs ADD COLUMN hero_background_color TEXT;
ALTER TABLE programs ADD COLUMN hero_background_image TEXT;

-- Program details (displayed in stats section)
ALTER TABLE programs ADD COLUMN duration TEXT;
ALTER TABLE programs ADD COLUMN salary_range TEXT;
ALTER TABLE programs ADD COLUMN placement_rate TEXT;
ALTER TABLE programs ADD COLUMN graduation_rate TEXT;

-- Rich content sections (JSONB for flexibility)
-- Highlights: [{ icon: string, text: string }]
ALTER TABLE programs ADD COLUMN highlights JSONB DEFAULT '[]'::jsonb;

-- Testimonials: [{ quote: string, author: string, role: string, photo: string }]
ALTER TABLE programs ADD COLUMN testimonials JSONB DEFAULT '[]'::jsonb;

-- FAQs: [{ question: string, answer: string }]
ALTER TABLE programs ADD COLUMN faqs JSONB DEFAULT '[]'::jsonb;

-- Stats: { placementRate: string, avgSalary: string, duration: string, graduationRate: string }
ALTER TABLE programs ADD COLUMN stats JSONB DEFAULT '{}'::jsonb;

-- Section configuration: controls which sections are visible and their order
-- { order: ['hero', 'highlights', 'stats', 'testimonials', 'form', 'faqs'], visible: { hero: true, highlights: true, ... } }
ALTER TABLE programs ADD COLUMN sections_config JSONB DEFAULT '{"order": ["hero", "highlights", "stats", "testimonials", "form", "faqs"], "visible": {"hero": true, "highlights": true, "stats": true, "testimonials": true, "form": true, "faqs": true}}'::jsonb;

-- Add footer content to schools table
-- { socialLinks: { facebook: '', twitter: '', linkedin: '', instagram: '' }, customLinks: [{ label: '', url: '' }] }
ALTER TABLE schools ADD COLUMN footer_content JSONB DEFAULT '{}'::jsonb;

-- Update config_versions table for draft/approval workflow
ALTER TABLE config_versions ADD COLUMN entity_type TEXT;
ALTER TABLE config_versions ADD COLUMN entity_id TEXT;
ALTER TABLE config_versions ADD COLUMN status TEXT DEFAULT 'draft';
ALTER TABLE config_versions ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE config_versions ADD COLUMN approved_by UUID REFERENCES users(id);
ALTER TABLE config_versions ADD COLUMN approved_at TIMESTAMPTZ;
ALTER TABLE config_versions ADD COLUMN rejected_by UUID REFERENCES users(id);
ALTER TABLE config_versions ADD COLUMN rejected_at TIMESTAMPTZ;
ALTER TABLE config_versions ADD COLUMN rejection_reason TEXT;

-- Create indexes for common queries
CREATE INDEX idx_programs_template_type ON programs(template_type);
CREATE INDEX idx_config_versions_status ON config_versions(status);
CREATE INDEX idx_config_versions_entity ON config_versions(entity_type, entity_id);

-- Add comments for documentation
COMMENT ON COLUMN programs.template_type IS 'Landing page layout: minimal (form-focused) or full (all sections)';
COMMENT ON COLUMN programs.hero_image IS 'URL for hero section image';
COMMENT ON COLUMN programs.hero_background_color IS 'Hex color for hero background';
COMMENT ON COLUMN programs.hero_background_image IS 'URL for hero background image';
COMMENT ON COLUMN programs.highlights IS 'Array of program highlights/benefits with icons';
COMMENT ON COLUMN programs.testimonials IS 'Array of student testimonials';
COMMENT ON COLUMN programs.faqs IS 'Array of frequently asked questions';
COMMENT ON COLUMN programs.stats IS 'Program statistics (placement rate, salary, etc.)';
COMMENT ON COLUMN programs.sections_config IS 'Configuration for section visibility and ordering';
COMMENT ON COLUMN schools.footer_content IS 'Footer social links and custom links';

COMMENT ON COLUMN config_versions.entity_type IS 'Type of entity being versioned (e.g., program_landing, school_settings)';
COMMENT ON COLUMN config_versions.entity_id IS 'ID of the entity being versioned';
COMMENT ON COLUMN config_versions.status IS 'Draft status: draft, pending_approval, approved, rejected';
COMMENT ON COLUMN config_versions.rejection_reason IS 'Reason provided when draft is rejected';

COMMIT;
