# Docker Compose Local Development Guide

This guide explains how to run the entire Lead Lander stack locally using Docker Compose.

## Quick Start

```bash
# Start all services
docker-compose up

# Run in the background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v
```

## Services Included

| Service | Port | Purpose |
|---------|------|---------|
| **postgres** | 5432 | PostgreSQL database |
| **redis** | 6379 | Redis queue for job processing |
| **api** | 4000 | Backend API (Express) |
| **worker** | 5005 | Background worker for CRM delivery |
| **web-landing** | 3000 | Landing pages (Next.js) |
| **web-admin** | 3001 | Admin dashboard (Next.js) |
| **mailhog** | 8025 | Email testing UI |
| **webhook-mock** | 1080 | Mock CRM webhook server |

## URLs

After running `docker-compose up`, access:

- **Landing Pages**: http://localhost:3000/{account-slug}
  - Example: http://localhost:3000/tech-institute
  - Example: http://localhost:3000/health-academy

- **Admin Dashboard**: http://localhost:3001/admin

- **API Health**: http://localhost:4000/healthz

- **Worker Health**: http://localhost:5005/worker/healthz

- **Email Testing (Mailhog)**: http://localhost:8025

- **Webhook Testing (MockServer)**: http://localhost:1080/mockserver/dashboard

## First Time Setup

1. **Start services**:
   ```bash
   docker-compose up -d
   ```

2. **Wait for database** to be ready (check with `docker-compose logs postgres`)

3. **Seed test data**:
   ```bash
   docker-compose exec api npm run seed
   ```

   This creates:
   - 2 sample accounts (tech-institute, health-academy)
   - 6 locations (3 per account)
   - 8 programs (4 per account)
   - Quiz questions and answer options
   - Webhook configurations

4. **Visit a landing page**:
   - http://localhost:3000/tech-institute
   - http://localhost:3000/health-academy

## Common Commands

### Rebuild a Service

If you've made code changes:

```bash
docker-compose restart api
docker-compose restart worker
docker-compose restart web-landing
docker-compose restart web-admin
```

### View Logs for a Specific Service

```bash
docker-compose logs -f api
docker-compose logs -f worker
docker-compose logs -f web-landing
```

### Access Database

```bash
docker-compose exec postgres psql -U lead_lander -d lead_lander
```

Example queries:
```sql
SELECT * FROM accounts;
SELECT * FROM locations;
SELECT * FROM programs;
SELECT * FROM submissions LIMIT 10;
```

### Run Migrations Manually

```bash
docker-compose exec api npm run migrate
```

### Reset Database

```bash
docker-compose down -v
docker-compose up -d
docker-compose exec api npm run seed
```

## Troubleshooting

### Services Won't Start

1. Check if ports are already in use:
   ```bash
   lsof -i :3000
   lsof -i :4000
   lsof -i :5432
   ```

2. View service logs:
   ```bash
   docker-compose logs postgres
   docker-compose logs api
   ```

### Database Connection Issues

Ensure postgres is healthy:
```bash
docker-compose ps
```

You should see `healthy` status for postgres.

### Hot Reload Not Working

The node_modules are volume-mounted. Try:
```bash
docker-compose restart web-landing
docker-compose restart api
```

### Clean Start

Remove all containers, volumes, and start fresh:
```bash
docker-compose down -v
docker-compose up -d
docker-compose exec api npm run seed
```

## Development Workflow

1. **Make code changes** in your editor (files are mounted)
2. **Services auto-reload** (Next.js has hot reload, API/worker may need restart)
3. **Test locally** at http://localhost:3000 or http://localhost:3001
4. **Check emails** at http://localhost:8025
5. **Check webhooks** at http://localhost:1080/mockserver/dashboard
6. **View logs** with `docker-compose logs -f`

## Environment Variables

All services use environment variables defined in `docker-compose.yml`.

To override for local development:
1. Create `.env.local` in the root
2. Docker Compose will automatically load it

Example `.env.local`:
```bash
DATABASE_URL=postgres://lead_lander:lead_lander@postgres:5432/lead_lander
REDIS_URL=redis://redis:6379
```

## Production vs Development

This Docker Compose setup is **for local development only**.

Key differences from production:
- No HTTPS
- No CloudFront CDN
- MockServer instead of real CRM webhooks
- Mailhog instead of real SMTP
- All services run on one machine
- No auto-scaling
- SQLite/in-memory storage for dev tools

See `README.md` for production deployment instructions (AWS + Vercel).
