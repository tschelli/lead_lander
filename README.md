# Lead Lander

Multi-tenant landing pages + long-form lead form for trade schools. The flow is:

landing page → multi-step form → API submission → Postgres → queue → delivery worker → CRM webhook (plus optional email).

## Repo structure

- `apps/web` – Next.js landing pages + multi-step form
- `apps/api` – submit endpoint + health
- `apps/worker` – delivery worker + CRM adapters + worker health
- `packages/config-schema` – config schema + validation helpers
- `configs/` – JSON/YAML configs (one sample school included)
- `migrations/` – SQL migrations
- `scripts/` – migration runner + monthly summary

## Configuration

Config is stored in `configs/*.yml` or `configs/*.json`.

Key entities:

- **School** – branding, compliance disclaimer/version, CRM connection reference
- **Campus** – routing slug, tags, email notification defaults
- **Program** – landing copy + optional question overrides
- **LandingPage** – ties school + campus + program with optional overrides
- **CrmConnection** – currently supports `webhook` and `generic` (stub)

To add a new landing page:

1. Add or edit a file in `configs/`.
2. Add a `school`, `campus`, and `program` entry if needed.
3. Add a `landingPages` entry linking the school/campus/program IDs.
4. Run `npm --workspace packages/config-schema run build` to validate.

Routes look like:

```
/{school_slug}/{campus_slug}/{program_slug}
```

Example from sample config:

```
/northwood-tech/downtown/medical-assistant
```

## Local development

### Option A: Docker compose

```
docker compose up
```

This starts Postgres, Redis, API, worker, and web.

### Option B: Run services locally

1. Install deps:

```
npm install
```

2. Start Postgres + Redis (via Docker or local services).
3. Run migrations:

```
npm run migrate
```

4. Start the stack:

```
npm run dev
```

## Submission + delivery flow

1. Visit a landing page URL (example above).
2. Step 1 submits to `POST /api/lead/start` (creates submission + queues CRM create).
3. Each subsequent step submits to `POST /api/lead/step` (merges answers + queues CRM update).
4. Worker delivers to CRM webhook defined in config.

Webhook adapter payload includes:

- `submissionId`
- `schoolId`, `campusId`, `programId`
- `contact` fields
- `answers`
- `metadata` (UTM/referrer/user agent)
- `consent` details
- `routingTags`

## Email notifications

Optional per campus/landing page. Enable with:

```
EMAIL_ENABLED=true
SMTP_HOST=...
SMTP_USER=...
SMTP_PASS=...
```

Recipients come from `campus.notifications` or `landingPages.notifications`.

## Health endpoints

- API: `GET /healthz`
- Worker: `GET /worker/healthz`

## Monthly summary report

Generate a monthly summary:

```
npm run summary -- --month=2026-01
```

Outputs counts by campus/program: received, delivered, failed.

## Tests

```
npm test
```

Includes config validation and idempotency unit tests.

## Environment variables

See `.env.example` for defaults. `CONFIG_DIR` is resolved from each app's working directory (default `../../configs`). Secrets (CRM webhook token, SMTP creds) should be provided via env vars.

## Deployment (AWS + Vercel)

See `docs/aws-deploy.md` for ECS + ALB + CloudFront steps and `infra/ecs/` for task/service templates.
