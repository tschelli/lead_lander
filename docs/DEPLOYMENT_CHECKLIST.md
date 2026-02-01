# Deployment Checklist - Phase 1 & 2

## Pre-Deployment

- [ ] Code committed to phase2 branch
- [ ] All builds passing (API, Worker, web-admin, web-landing)
- [ ] Migrations reviewed (013 and 014)

## Deployment Order

### 1. Deploy API & Worker to AWS ECS

**API Service:**
```bash
# 1. Build and push new image
docker build -t your-registry/api:phase2 ./apps/api
docker push your-registry/api:phase2

# 2. Update ECS task definition
# - Update image tag to :phase2
# - Keep all existing env vars (no new ones needed)

# 3. Update ECS service to use new task definition
aws ecs update-service \
  --cluster your-cluster \
  --service api-service \
  --task-definition api-task-def:NEW_REVISION \
  --force-new-deployment

# 4. Wait for deployment
aws ecs wait services-stable \
  --cluster your-cluster \
  --services api-service
```

**Worker Service:**
```bash
# 1. Build and push new image
docker build -t your-registry/worker:phase2 ./apps/worker
docker push your-registry/worker:phase2

# 2. Update ECS task definition
# - Update image tag to :phase2

# 3. Update ECS service
aws ecs update-service \
  --cluster your-cluster \
  --service worker-service \
  --task-definition worker-task-def:NEW_REVISION \
  --force-new-deployment

# 4. Wait for deployment
aws ecs wait services-stable \
  --cluster your-cluster \
  --services worker-service
```

### 2. Run Database Migrations

**Option A: AWS ECS Custom Task (Recommended)**
```bash
# Run one-off task using API container
aws ecs run-task \
  --cluster your-cluster \
  --task-definition api-task-def:LATEST \
  --overrides '{
    "containerOverrides": [{
      "name": "api",
      "command": ["npm", "run", "migrate"]
    }]
  }' \
  --launch-type FARGATE \
  --network-configuration 'awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=ENABLED}'

# Monitor task logs
```

**Option B: Via API Container Shell**
```bash
# Connect to running API container
aws ecs execute-command \
  --cluster your-cluster \
  --task task-id \
  --container api \
  --interactive \
  --command "/bin/sh"

# Inside container
npm run migrate
```

**Expected Migration Output:**
```
Running migration 013: Landing Page Builder
✓ Added template_type to programs
✓ Added hero_image, highlights, testimonials, faqs, stats
✓ Added footer_content to schools
✓ Updated config_versions table
✓ Created indexes

Running migration 014: Quiz Builder
✓ Created quiz_questions table
✓ Created quiz_answer_options table
✓ Added use_quiz_routing to programs
✓ Created indexes

All migrations completed successfully
```

### 3. Verify API Health

```bash
# Check API health
curl https://your-api-domain.com/health

# Check worker health
curl https://your-api-domain.com/worker/healthz

# Check new quiz endpoint
curl https://your-api-domain.com/api/public/schools/YOUR_SCHOOL_ID/quiz
```

### 4. Vercel Deployments (Auto)

**These deploy automatically on git push:**
- `web-admin` - Admin dashboard with new config/quiz builders
- `web-landing` - Landing pages with quiz integration

**Verify in Vercel Dashboard:**
- [ ] Check deployment status for both apps
- [ ] Review build logs for errors
- [ ] Check deployment preview URLs
- [ ] Verify production deployment successful

### 5. Post-Deployment Verification

**Immediate Checks (within 5 minutes):**
- [ ] API /health endpoint returns 200
- [ ] Worker /healthz endpoint returns 200
- [ ] Admin dashboard loads without errors
- [ ] Landing page loads without errors
- [ ] Login to admin works
- [ ] Config cache refreshes (wait 60s or restart services)

**Configuration Checks:**
- [ ] Check API logs for migration success
- [ ] Check worker logs for queue processing
- [ ] Verify Redis connection stable
- [ ] Verify database connection pool healthy

**Smoke Tests (15 minutes):**
- [ ] Submit test lead via landing page
- [ ] Verify submission in database
- [ ] Verify CRM webhook delivery
- [ ] Login to admin as different roles
- [ ] Access config builder (should work for client_admin)
- [ ] Access quiz builder (should work for client_admin)

---

## Rollback Procedure

If critical issues found:

### 1. Rollback ECS Services
```bash
# Revert API to previous task definition
aws ecs update-service \
  --cluster your-cluster \
  --service api-service \
  --task-definition api-task-def:PREVIOUS_REVISION

# Revert Worker to previous task definition
aws ecs update-service \
  --cluster your-cluster \
  --service worker-service \
  --task-definition worker-task-def:PREVIOUS_REVISION
```

### 2. Rollback Database (if needed)
```sql
-- WARNING: Only if absolutely necessary and data loss acceptable

BEGIN;

-- Drop migration 014 changes
DROP TABLE IF EXISTS quiz_answer_options CASCADE;
DROP TABLE IF EXISTS quiz_questions CASCADE;
DROP INDEX IF EXISTS idx_programs_use_quiz_routing;
ALTER TABLE programs DROP COLUMN IF EXISTS use_quiz_routing;

-- Drop migration 013 changes
ALTER TABLE programs DROP COLUMN IF EXISTS template_type;
ALTER TABLE programs DROP COLUMN IF EXISTS hero_image;
ALTER TABLE programs DROP COLUMN IF EXISTS hero_background_color;
ALTER TABLE programs DROP COLUMN IF EXISTS hero_background_image;
ALTER TABLE programs DROP COLUMN IF EXISTS duration;
ALTER TABLE programs DROP COLUMN IF EXISTS salary_range;
ALTER TABLE programs DROP COLUMN IF EXISTS placement_rate;
ALTER TABLE programs DROP COLUMN IF EXISTS graduation_rate;
ALTER TABLE programs DROP COLUMN IF EXISTS highlights;
ALTER TABLE programs DROP COLUMN IF EXISTS testimonials;
ALTER TABLE programs DROP COLUMN IF EXISTS faqs;
ALTER TABLE programs DROP COLUMN IF EXISTS stats;
ALTER TABLE programs DROP COLUMN IF EXISTS sections_config;
ALTER TABLE schools DROP COLUMN IF EXISTS footer_content;
ALTER TABLE config_versions DROP COLUMN IF EXISTS entity_type;
ALTER TABLE config_versions DROP COLUMN IF EXISTS entity_id;
ALTER TABLE config_versions DROP COLUMN IF EXISTS status;
ALTER TABLE config_versions DROP COLUMN IF EXISTS updated_at;
ALTER TABLE config_versions DROP COLUMN IF EXISTS approved_by;
ALTER TABLE config_versions DROP COLUMN IF EXISTS approved_at;
ALTER TABLE config_versions DROP COLUMN IF EXISTS rejected_by;
ALTER TABLE config_versions DROP COLUMN IF EXISTS rejected_at;
ALTER TABLE config_versions DROP COLUMN IF EXISTS rejection_reason;
DROP INDEX IF EXISTS idx_programs_template_type;
DROP INDEX IF EXISTS idx_config_versions_status;
DROP INDEX IF EXISTS idx_config_versions_entity;

COMMIT;
```

### 3. Rollback Vercel
- Navigate to Vercel dashboard
- Select previous deployment
- Click "Promote to Production"

---

## Environment Variables Reference

**No new environment variables needed for Phase 1 & 2!**

All features use existing configuration:
- ✅ `DATABASE_URL` - PostgreSQL connection
- ✅ `REDIS_URL` - Redis for queue
- ✅ `CONFIG_CACHE_TTL_SECONDS` - Config cache duration (default: 60)
- ✅ `AUTH_COOKIE_NAME` - Session cookie name
- ✅ `NEXT_PUBLIC_API_BASE_URL` - API URL for frontend
- ✅ `ADMIN_API_BASE_URL` - Admin API URL (optional)

---

## Monitoring & Alerts

**Watch for these metrics post-deployment:**

**API Metrics:**
- Response time for new endpoints (`/api/admin/*/quiz/*`)
- Config cache hit rate
- Error rate on quiz recommendation endpoint

**Worker Metrics:**
- Queue processing time
- CRM webhook delivery success rate
- Failed delivery count

**Database Metrics:**
- Query performance on new tables
- Connection pool usage
- Index usage for new columns

**Application Logs:**
- Watch for TypeScript/runtime errors
- Watch for config validation errors
- Watch for quiz recommendation failures

---

## Success Criteria

Deployment is successful when:
- [ ] All services running latest versions
- [ ] Migrations completed without errors
- [ ] Health checks passing
- [ ] Test lead submission succeeds end-to-end
- [ ] Admin login works for all roles
- [ ] Config builder loads and functions
- [ ] Quiz builder loads and functions
- [ ] Landing page renders with new sections
- [ ] No critical errors in logs (first 30 minutes)
- [ ] CRM webhook deliveries succeeding

---

## Support Contacts

If issues arise:
- **Database Issues**: DBA team
- **AWS ECS Issues**: DevOps team
- **Vercel Issues**: Check Vercel status page
- **Application Issues**: Development team

## Post-Deployment

- [ ] Monitor logs for 2 hours post-deployment
- [ ] Run full test plan (see PHASE1_PHASE2_TEST_PLAN.md)
- [ ] Document any issues encountered
- [ ] Update team on deployment status
- [ ] Schedule follow-up review in 24 hours
