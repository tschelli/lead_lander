# Lead Lander

Multi-tenant landing pages with ZIP code-based location matching and quiz-driven program recommendations.

## Overview

Lead Lander is a lead generation platform that:
- Provides **one landing page per account** (not per program)
- Uses **ZIP code input** to find the nearest location
- Captures lead information with consent
- Recommends programs via a **quiz system**
- Delivers leads to CRM via webhooks
- Stores everything in **PostgreSQL** (database-first architecture)

## Architecture

```
Client (you)
  └─ Accounts (your customers)
      ├─ Locations (physical campuses/offices)
      ├─ Programs (service offerings)
      ├─ Quiz Questions (for recommendations)
      └─ Single Landing Page (/{account-slug})
```

### Key Concepts

- **Account**: Your customer (formerly "school"). Education-agnostic.
- **Location**: Physical location with lat/lon for ZIP matching. Used for billing and lead routing.
- **Program**: Service offering. Used internally for quiz scoring and recommendations.
- **Landing Page**: One per account at `/{account-slug}`. Shows all programs via quiz.
- **Database-First**: Configuration lives in the database, not config files.

## Quick Start

### Local Development (Docker Compose)

```bash
# Start all services
docker-compose up -d

# Seed test data (2 accounts, 6 locations, 8 programs)
docker-compose exec api npm run seed

# Visit landing pages
open http://localhost:3000/tech-institute
open http://localhost:3000/health-academy

# View all accounts
open http://localhost:3000

# Admin dashboard
open http://localhost:3001/admin

# Email testing (Mailhog)
open http://localhost:8025

# Webhook testing (MockServer)
open http://localhost:1080/mockserver/dashboard
```

See [DOCKER_GUIDE.md](./DOCKER_GUIDE.md) for detailed Docker instructions.

### Manual Setup

```bash
# Install dependencies
npm install

# Start Postgres and Redis
docker-compose up postgres redis -d

# Run migrations
npm run migrate

# Seed test data
npm run seed

# Start services
npm run dev
```

## Repository Structure

```
lead_lander/
├── apps/
│   ├── api/              Backend API (Express)
│   ├── worker/           Background worker (CRM delivery)
│   ├── web-landing/      Landing pages (Next.js)
│   └── web-admin/        Admin dashboard (Next.js)
├── packages/
│   └── config-schema/    TypeScript types
├── migrations/
│   ├── schema_v2.sql     Fresh database schema
│   └── legacy/           Old migrations (archived)
├── scripts/
│   ├── seed-data.ts      Seed sample accounts
│   ├── zip-lookup.ts     ZIP code utilities
│   └── migrate.ts        Migration runner
├── configs/
│   ├── README.md         Config documentation
│   └── legacy/           Old YAML configs (archived)
├── dev-tools/            Mailhog & MockServer config
├── DOCKER_GUIDE.md       Docker Compose guide
└── README.md             This file
```

## User Flow

1. **Visit landing page**: `/{account-slug}`
2. **Enter ZIP code**: System finds nearest location
3. **Provide contact info**: Name, email, phone
4. **Select location**: Choose from dropdown (nearest pre-selected)
5. **Consent**: Check disclaimer checkbox
6. **Start quiz**: Answer questions about interests
7. **Get recommendation**: System recommends best program
8. **Lead delivered**: Sent to CRM via webhook

## Database Schema (v2)

Core tables:
- `clients` - Your business entity
- `accounts` - Your customers (formerly schools)
- `locations` - Physical locations with lat/lon (formerly campuses)
- `programs` - Service offerings for quiz scoring
- `submissions` - Lead submissions with quiz responses
- `quiz_questions` - Quiz questions
- `quiz_answer_options` - Answer options with point assignments
- `landing_page_questions` - Custom landing page questions (ZIP code, etc.)
- `webhook_configs` - CRM webhook configurations

See `migrations/schema_v2.sql` for complete schema.

## Configuration

### Database-First Approach

Configuration is stored in the **database**, not config files. This allows:
- Hot-reloading (no redeployment needed)
- True multi-tenancy
- Admin UI management (coming soon)

### Adding New Accounts

**Option 1: Seed Script** (Development)
```bash
# Edit scripts/seed-data.ts, then:
npm run seed
```

**Option 2: Direct SQL** (Production)
```sql
-- See configs/README.md for SQL examples
INSERT INTO accounts (id, client_id, slug, name, ...) VALUES (...);
INSERT INTO locations (id, account_id, ...) VALUES (...);
INSERT INTO programs (id, account_id, ...) VALUES (...);
```

**Option 3: Admin UI** (Coming Soon)
Manage accounts, locations, and programs via web interface.

## API Endpoints

### Public (Landing Pages)
- `GET /api/public/accounts` - List all accounts
- `GET /api/public/accounts/:slug` - Get account with locations & programs
- `GET /api/public/accounts/:slug/nearest-location?zip=XXXXX` - Find nearest location
- `POST /api/lead/start` - Submit lead (with ZIP, location, consent)

### Admin (Dashboard)
- `GET /api/admin/schools` - List accounts (uses "schools" for backward compat)
- `GET /api/admin/schools/:id/metrics` - Account metrics
- `GET /api/admin/schools/:id/submissions` - List submissions

### Health
- `GET /healthz` - API health check
- `GET /worker/healthz` - Worker health check

## Development Tools

### Mailhog (Email Testing)
- **UI**: http://localhost:8025
- **SMTP**: localhost:1025
- Captures all outgoing emails for testing

### MockServer (Webhook Testing)
- **UI**: http://localhost:1080/mockserver/dashboard
- **Endpoint**: http://localhost:1080/webhook/crm
- Logs all webhook requests for debugging

See `dev-tools/README.md` for details.

## Testing

```bash
# Run all tests
npm test

# Test ZIP lookup utility
npm run -- tsx scripts/zip-lookup.ts tech-institute 98101
```

## Deployment

### Vercel (Frontend)
```bash
# Deploy landing pages
cd apps/web-landing
vercel

# Deploy admin dashboard
cd apps/web-admin
vercel
```

**Environment Variables:**
- `NEXT_PUBLIC_API_BASE_URL` - API URL (CloudFront or ALB)

### AWS (Backend)
1. **RDS PostgreSQL** - Database
2. **ElastiCache Redis** - Queue
3. **ECS Fargate** - API + Worker containers
4. **CloudFront** - HTTPS for API
5. **ECR** - Container images

See deployment section in the original README or create `docs/DEPLOYMENT.md`.

## Migration from v1 (School-Based)

### Key Changes

| Old (v1) | New (v2) |
|----------|----------|
| `schools` | `accounts` |
| `campuses` | `locations` |
| Config files (YAML) | Database |
| `/{school}/{program}` | `/{account}` |
| Per-school deployment | Multi-tenant |
| Program-specific pages | Single page + quiz |

### Backward Compatibility

The API supports both old and new submission formats:
- Old: `schoolId`, `campusId`, `programId`
- New: `accountId`, `locationId`, `programId` (optional)

The worker handles both formats automatically.

### Data Migration

1. Export data from old schema
2. Apply `schema_v2.sql`
3. Transform and import:
   - `schools` → `accounts`
   - `campuses` → `locations` (add lat/lon)
   - Keep `programs` (update `account_id`)
4. Run seed script for quiz questions

## Environment Variables

See `.env.example` for all variables.

**Removed in v2:**
- `NEXT_PUBLIC_SCHOOL_ID` ❌
- `NEXT_PUBLIC_CLIENT_ID` ❌

**Why removed?** The application is now truly multi-tenant. One deployment serves all accounts.

## Contributing

1. Create a branch from `main`
2. Make changes
3. Test locally with Docker Compose
4. Create pull request

## License

Proprietary

## Support

- GitHub Issues: https://github.com/your-org/lead-lander/issues
- Docs: See `/docs` directory
- Docker Guide: `DOCKER_GUIDE.md`
