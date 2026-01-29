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
- **Program** – landing copy + optional question overrides (and optional `availableCampuses`)
- **LandingPage** – ties school + program with optional overrides (no campus routing)
- **CrmConnection** – currently supports `webhook` and `generic` (stub)

To add a new landing page:

1. Add or edit a file in `configs/`.
2. Add a `school`, `campus`, and `program` entry if needed.
3. Add a `landingPages` entry linking the school/program IDs.
4. (Optional) Add `program.availableCampuses` to restrict campus choices; otherwise all school campuses are shown.
5. Run `npm --workspace packages/config-schema run build` to validate.

Routes look like:

```
/{school_slug}/{program_slug}
```

Example from sample config:

```
/northwood-tech/medical-assistant
```

Notes:
- Campus is selected inside the Step 1 form (includes a "Not sure yet" option).
- School logos can live in `apps/web/public/logos` and be referenced as `/logos/<file>.png` in config.

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

## Admin dashboard (internal)

Dashboard routes:
- `/admin` – account chooser
- `/admin/{school_slug}` – metrics + queue status + recent submissions
- `/admin/{school_slug}/database` – read-only submissions table
- `/admin/{school_slug}/config` – config builder draft UI

Admin API endpoints (require an authenticated admin session cookie):
- `GET /api/admin/:school/metrics`
- `GET /api/admin/:school/submissions?limit=50&offset=0`

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

### Admin dashboard env vars (web)

- `ADMIN_API_BASE_URL` (web): Base URL for API requests (e.g. CloudFront domain).
- `ADMIN_API_PROXY_TARGET` (web): Proxy target for `/api/*` rewrites (use CloudFront when you do not own a domain).

### Admin auth cookie env vars (api)

- `AUTH_COOKIE_DOMAIN` (api): Optional cookie domain (e.g. `.example.com`).
- `AUTH_COOKIE_SAMESITE` (api): `lax` (default), `strict`, or `none`. Use `none` only if you must allow cross-site cookies.

## Deployment (AWS + Vercel)

This repo is designed for:
- **Vercel** for the Next.js frontend (`apps/web`)
- **AWS ECS Fargate** for the API + Worker
- **AWS RDS Postgres** for storage
- **AWS ElastiCache Redis** for the queue
- **CloudFront** in front of the API (HTTPS)
- **ECR + CodeBuild** for container builds

Below is a detailed step-by-step that mirrors the current production setup.

### 1) Vercel (frontend)

1. **Import project** in Vercel from GitHub.
2. **Root directory**: repo root.
3. **Framework**: Next.js.
4. **Build command** (default is ok):  
   `cd ../.. && npm --workspace apps/web run build`
5. **Output**: Vercel auto-detects Next.js.
6. **Environment variables** (Project → Settings → Environment Variables):
   - `NEXT_PUBLIC_API_BASE_URL` = `https://<cloudfront-domain>`
   - `ADMIN_API_BASE_URL` = `https://<cloudfront-domain>` (for admin dashboard)

After a push, Vercel auto-deploys the web app.

### 2) AWS Core Infrastructure

#### VPC + Networking
- Create a VPC with **public** and **private** subnets.
- Public subnets for ALB.
- Private subnets for ECS tasks, RDS, Redis.
- Security groups:
  - **alb-sg**: inbound 80/443 from internet
  - **api-sg**: inbound 4000 from alb-sg
  - **worker-sg**: no inbound
  - **rds-sg**: inbound 5432 from api-sg + worker-sg
  - **redis-sg**: inbound 6379 from api-sg + worker-sg

#### RDS Postgres
- Create Postgres instance in private subnets.
- Enforce SSL (use `sslmode=require` in `DATABASE_URL`).

#### ElastiCache Redis
- Create Redis cluster in private subnets.
- Use TLS endpoint (rediss://) if required by your cluster.

### 3) ECS (API + Worker)

#### Task definitions
Create two task definitions (Fargate):
- **API task**: container port 4000  
  CMD: `node apps/api/dist/server.js`
- **Worker task**: container port 5005  
  CMD: `node apps/worker/dist/worker.js`

Environment variables for both:
- `DATABASE_URL` (RDS)
- `REDIS_URL` (ElastiCache)
- `CONFIG_DIR=/app/configs`
- `DELIVERY_QUEUE_NAME=lead_delivery`
- `DELIVERY_MAX_ATTEMPTS=5`
- `DELIVERY_BACKOFF_MS=10000`
- `CRM_WEBHOOK_TOKEN=...`
- `EMAIL_ENABLED=false` (optional)

API-only:
- `PORT=4000`
- `RATE_LIMIT_MAX=30`
- `RATE_LIMIT_WINDOW_MS=60000`

Worker-only:
- `WORKER_PORT=5005`
- SMTP vars if email notifications are enabled

#### Services
Create ECS services:
- **API service** with an ALB target group (health check `/healthz`)
- **Worker service** (no load balancer)

### 4) CloudFront (API HTTPS)

Create a CloudFront distribution pointing to the ALB:
- **Origin**: ALB DNS name
- **Behavior**: `/api/*`
  - Allowed methods: GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE
  - Cache policy: `CachingDisabled`
  - Origin request policy: `Managed-AllViewer` (required to forward `x-admin-key`)
  - Response headers policy: `Managed-CORS-With-Preflight`

If you update behaviors, invalidate `/api/*`.

### 5) ECR + CodeBuild

#### ECR
Create two repos:
- `lead-lender-api`
- `lead-lender-worker`

#### CodeBuild
Configure CodeBuild to:
- Build and push the API and Worker images.
- Use `buildspec.yml` at the repo root.
- Push images to ECR with a tag (commit SHA or build ID).

### 6) Migrations

Run migrations after every schema change:

**ECS one-off task (recommended):**
- Use the API task definition
- Command override (comma delimited):
  ```
  npm,run,migrate
  ```

In logs you should see:
- `Applying 00X_*.sql`
- `Migrations complete.`

### 7) Deploy flow (typical)

1. Push to GitHub.
2. CodeBuild builds/pushes new images to ECR.
3. Update **API** and **Worker** ECS task definitions to the new image tags.
4. Update ECS services to the new revisions.
5. Run migrations (if needed).
6. Vercel auto-deploys the web frontend.

### 8) Verification checklist

**API**
- `GET /healthz` returns ok
- `/api/lead/start` returns 202
- `/api/lead/step` returns 202

**Worker**
- `GET /worker/healthz` returns ok
- CloudWatch logs show `create_lead` + `update_lead` success

**DB**
- Submissions created for Step 1
- `crm_lead_id` populated after create
- `answers` JSON merged across steps

**CloudFront**
- Preflight OPTIONS works for `/api/*`
- No CORS errors in the browser

**Admin dashboard**
- `/admin/<school_slug>` renders metrics
- `/admin/<school_slug>/database` shows submissions
- `/admin/<school_slug>/config` shows config builder
- API returns 200 with `x-admin-key`

---

For deeper infra templates, see `infra/ecs/` and `docs/aws-deploy.md`.
