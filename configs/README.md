# Configuration Files

This directory contains configuration files for the Lead Lander application.

## New Architecture (v2)

The new account-based architecture stores most configuration in the **database** rather than config files. Config files are primarily used for seeding initial data.

### Database-First Approach

Configuration is stored in these database tables:
- `accounts` - Account information and branding
- `locations` - Physical locations for each account
- `programs` - Programs offered by each account
- `quiz_questions` - Quiz questions for program recommendations
- `quiz_answer_options` - Answer options with scoring
- `landing_page_questions` - Custom questions on landing pages
- `webhook_configs` - CRM webhook configurations

### Seeding Data

To populate the database with sample data:

```bash
npm run seed
```

This creates:
- 2 sample accounts (tech-institute, health-academy)
- 6 locations across different states
- 8 programs with quiz configurations
- Quiz questions and scoring logic
- Webhook configurations

See `scripts/seed-data.ts` for details.

## Legacy Architecture

The `legacy/` directory contains old YAML-based configuration files from the previous school-based architecture. These are kept for reference but are not used by the application.

### Migration Notes

The old config-based system has been replaced with a database-first approach:

**Old (Config Files):**
- Schools, campuses, programs defined in YAML/JSON
- One file per school
- Loaded at runtime
- Required redeployment for changes

**New (Database):**
- Accounts, locations, programs in database
- Managed via admin UI or direct DB access
- Hot-reload (no deployment needed)
- Better for multi-tenancy

## Adding New Accounts

### Method 1: Database Insert (Recommended)

Connect to your database and insert records:

```sql
-- Add a new account
INSERT INTO accounts (id, client_id, slug, name, branding, compliance, is_active)
VALUES (
  'my-account',
  'demo-client',
  'my-account',
  'My Account Name',
  '{"colors": {"primary": "#0066cc", "secondary": "#00aaff"}}'::jsonb,
  '{"disclaimerText": "By submitting...", "version": "1.0"}'::jsonb,
  true
);

-- Add locations
INSERT INTO locations (id, client_id, account_id, slug, name, city, state, zip_code, is_active)
VALUES (
  'my-location',
  'demo-client',
  'my-account',
  'main-campus',
  'Main Campus',
  'Seattle',
  'WA',
  '98101',
  true
);

-- Add programs
INSERT INTO programs (id, client_id, account_id, slug, name, description, is_active)
VALUES (
  'my-program',
  'demo-client',
  'my-account',
  'software-dev',
  'Software Development',
  'Learn full-stack development',
  true
);
```

### Method 2: Seed Script (For Development)

Modify `scripts/seed-data.ts` to add your accounts, then run:

```bash
npm run seed
```

### Method 3: Admin UI (Coming Soon)

The admin dashboard will provide a UI for managing accounts, locations, and programs.

## Environment Variables

The application no longer requires per-account environment variables. See `.env.example` for required configuration.

Key changes:
- ❌ Removed: `NEXT_PUBLIC_SCHOOL_ID`, `NEXT_PUBLIC_CLIENT_ID`
- ✅ Multi-tenant by default
- ✅ All accounts served from one deployment

## Testing Locally

After seeding, visit:
- http://localhost:3000/tech-institute
- http://localhost:3000/health-academy

Or see all accounts at:
- http://localhost:3000
