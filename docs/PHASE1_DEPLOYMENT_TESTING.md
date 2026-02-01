# Phase 1 Deployment & Testing Guide

This guide covers how to deploy and test Phase 1 changes in staging/production environments.

---

## Pre-Deployment Checklist

### 1. Database Migrations
```bash
# Run the new migration in staging first
npm run migrate

# Verify indexes were created
psql $DATABASE_URL -c "\d submissions"
psql $DATABASE_URL -c "\d+ submissions"  # View indexes
```

**Expected indexes:**
- `idx_submissions_idempotency_client` (client_id, idempotency_key)
- `idx_submissions_email_client` (client_id, email)
- `idx_submissions_phone_client` (client_id, phone)
- Other indexes from migration 012

### 2. Environment Variables

**API/Worker (AWS):**
```bash
# Existing variables should be sufficient
# Verify these are set:
DATABASE_URL=
REDIS_URL=
JWT_SECRET=
CORS_ORIGINS=
```

**web-admin (Vercel):**
```bash
NEXT_PUBLIC_API_URL=https://api.your-domain.com
```

**web-landing (Vercel - per school):**
```bash
NEXT_PUBLIC_API_URL=https://api.your-domain.com
NEXT_PUBLIC_SCHOOL_ID=your-school-id
NEXT_PUBLIC_CLIENT_ID=your-client-id
```

---

## Deployment Order

### Step 1: Deploy API + Worker (AWS)
```bash
# Deploy API and Worker first since they have breaking changes
# The old web app will break, but that's expected

# If using Docker:
docker build -t lead-lander-api -f apps/api/Dockerfile .
docker build -t lead-lander-worker -f apps/worker/Dockerfile .

# Deploy to AWS (ECS/EC2/Lambda)
# Wait for health checks to pass
```

### Step 2: Deploy web-admin (Vercel)
```bash
# Deploy from apps/web-admin
cd apps/web-admin
vercel --prod

# Or use deployment script when ready:
# ./scripts/deploy-admin.sh
```

### Step 3: Deploy web-landing (Vercel - per school)
```bash
# Deploy one instance per school
cd apps/web-landing

# Set environment variables for specific school
vercel env add NEXT_PUBLIC_SCHOOL_ID
vercel env add NEXT_PUBLIC_CLIENT_ID
vercel env add NEXT_PUBLIC_API_URL

vercel --prod

# Repeat for each school or use script:
# ./scripts/deploy-school.sh <school-id> <client-id>
```

---

## Testing Checklist

### A. API Security Tests

#### 1. Login Endpoint Security ✓
**Test**: Verify no school enumeration

```bash
# Test 1: Non-existent school should return same error as bad password
curl -X POST https://api.your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "wrongpass",
    "schoolSlug": "nonexistent-school"
  }'

# Expected: 401 "Invalid credentials" (NOT "School not found")
# Should take ~100ms due to timing attack prevention

# Test 2: Valid school but wrong password
curl -X POST https://api.your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "wrongpass",
    "schoolSlug": "real-school-slug"
  }'

# Expected: 401 "Invalid credentials" (same message)
# Response time should be similar

# Test 3: Valid credentials
curl -X POST https://api.your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "real-user@example.com",
    "password": "correct-password",
    "schoolSlug": "real-school-slug"
  }'

# Expected: 200 with user object and Set-Cookie header
```

#### 2. Public Endpoints Removed ✓
```bash
# Test: Public schools list should be gone
curl https://api.your-domain.com/api/public/schools

# Expected: 404 Not Found
```

#### 3. New Accessible Schools Endpoint ✓
```bash
# Login first, then test
curl https://api.your-domain.com/api/auth/me \
  -H "Cookie: auth_token=YOUR_TOKEN"

# Expected: Response includes "schools" array with accessible schools
# {
#   "user": { ... },
#   "schools": [
#     { "id": "...", "slug": "...", "name": "..." }
#   ]
# }
```

#### 4. New Admin Endpoints ✓
```bash
# Login and get token first
TOKEN="your-auth-token"

# Test: List accessible schools
curl https://api.your-domain.com/api/admin/schools \
  -H "Cookie: auth_token=$TOKEN"

# Expected: 200 with schools list

# Test: Old route should fail
curl https://api.your-domain.com/api/admin/school-slug/metrics \
  -H "Cookie: auth_token=$TOKEN"

# Expected: 404 Not Found

# Test: New route should work
curl https://api.your-domain.com/api/admin/schools/SCHOOL_ID/metrics \
  -H "Cookie: auth_token=$TOKEN"

# Expected: 200 with metrics data
```

#### 5. Middleware Access Control ✓
```bash
# Test: Access school from different client should be denied
# Login as user from Client A
TOKEN_A="client-a-token"

# Try to access school from Client B
curl https://api.your-domain.com/api/admin/schools/CLIENT_B_SCHOOL_ID/metrics \
  -H "Cookie: auth_token=$TOKEN_A"

# Expected: 403 Forbidden
```

### B. Worker Validation Tests

#### 1. Client Context Validation ✓
```bash
# This is harder to test directly, but you can:

# 1. Check worker logs for validation messages
# Look for: "Job validation failed: client_id mismatch"

# 2. Submit a lead and watch it process
curl -X POST https://api.your-domain.com/api/submit \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Test",
    "lastName": "User",
    "email": "test@example.com",
    "schoolId": "valid-school-id",
    "campusId": "valid-campus-id",
    "programId": "valid-program-id",
    "consent": {
      "consented": true,
      "textVersion": "v1",
      "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"
    }
  }'

# Check worker logs - should see:
# - "Submission received"
# - "Create lead job queued"
# - Worker processing with client_id validation
# - "Lead created successfully" (if CRM connection works)
```

### C. Database Query Tests

#### 1. Verify Client Isolation ✓
```bash
# This requires database access

# Test: Check that submissions query includes client_id
psql $DATABASE_URL -c "
SELECT client_id, school_id, email
FROM submissions
WHERE email = 'test@example.com'
LIMIT 5;
"

# Test: Check that idempotency queries use compound index
psql $DATABASE_URL -c "
EXPLAIN ANALYZE
SELECT id FROM submissions
WHERE client_id = 'test-client'
  AND idempotency_key = 'test-key';
"

# Expected: Should use idx_submissions_idempotency_client
```

#### 2. Performance Check ✓
```bash
# Test: Email search should be fast
psql $DATABASE_URL -c "
EXPLAIN ANALYZE
SELECT id, email, created_at
FROM submissions
WHERE client_id = 'test-client'
  AND email ILIKE '%test@example.com%'
LIMIT 10;
"

# Expected: Should use idx_submissions_email_client
# Execution time < 10ms
```

### D. Web Admin Portal Tests

#### 1. Access web-admin in browser
```
https://admin.your-domain.com
```

**Tests:**
1. ✓ Login page loads
2. ✓ Login with valid credentials works
3. ✓ After login, redirected to dashboard
4. ✓ Dashboard shows accessible schools
5. ✓ Can navigate to school metrics: `/admin/schools/[schoolId]/metrics`
6. ✓ Metrics load correctly
7. ✓ Database view works: `/admin/schools/[schoolId]/database`
8. ✓ Can export submissions
9. ✓ User management works (if client_admin)
10. ✓ Cannot access schools from other clients (403 error)

#### 2. Role-Based Access ✓
**As school_admin:**
- ✓ Can only see assigned school
- ✓ Cannot access other schools
- ✓ Cannot manage users

**As client_admin:**
- ✓ Can see all schools in client
- ✓ Can manage users
- ✓ Cannot access other clients' data

**As super_admin:**
- ✓ Can access all data
- ✓ Can create new clients

### E. Web Landing Page Tests

#### 1. Access web-landing in browser
```
https://school-slug.your-domain.com
```

**Tests:**
1. ✓ Landing page loads
2. ✓ Correct school branding displayed
3. ✓ Program pages load: `/medical-assistant`, `/nursing`, etc.
4. ✓ Form engine works
5. ✓ Form submission succeeds
6. ✓ Redirects to success page
7. ✓ Privacy/Terms pages load

#### 2. Form Submission Test ✓
```bash
# Use browser network tab to inspect:
# 1. POST to /api/submit
# 2. Request includes schoolId, campusId, programId
# 3. Response is 202 with submissionId
# 4. No errors in console
# 5. Success page shows confirmation
```

### F. Integration Tests

#### 1. End-to-End Lead Flow ✓
1. ✓ User fills form on landing page
2. ✓ Submission created in database with correct client_id
3. ✓ Worker picks up job
4. ✓ Worker validates client_id matches
5. ✓ Lead sent to CRM
6. ✓ Submission status updated to 'delivered'
7. ✓ Appears in admin database view
8. ✓ Admin can export the lead

#### 2. Multi-Tenant Isolation ✓
1. ✓ Login as Client A admin
2. ✓ Verify can only see Client A schools
3. ✓ Verify cannot access Client B school IDs
4. ✓ Logout
5. ✓ Login as Client B admin
6. ✓ Verify can only see Client B schools
7. ✓ Verify data is completely separate

---

## Load Testing (Optional)

```bash
# Install Apache Bench
sudo apt-get install apache2-utils

# Test API endpoints
ab -n 100 -c 10 \
  -H "Cookie: auth_token=$TOKEN" \
  https://api.your-domain.com/api/admin/schools

# Test login endpoint
ab -n 50 -c 5 \
  -p login-payload.json \
  -T application/json \
  https://api.your-domain.com/api/auth/login

# Test form submission
ab -n 50 -c 5 \
  -p submit-payload.json \
  -T application/json \
  https://api.your-domain.com/api/submit
```

---

## Monitoring During Deployment

### API Health
```bash
# Check health endpoint
curl https://api.your-domain.com/healthz

# Expected: { "status": "ok" }
```

### Database Connections
```bash
# Check active connections
psql $DATABASE_URL -c "
SELECT count(*) as connections,
       state
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY state;
"
```

### Worker Status
```bash
# Check Redis queue
redis-cli -u $REDIS_URL LLEN bull:delivery:waiting
redis-cli -u $REDIS_URL LLEN bull:delivery:active
redis-cli -u $REDIS_URL LLEN bull:delivery:failed

# Check worker logs for errors
# AWS CloudWatch, Docker logs, etc.
```

### Application Logs
Watch for:
- ❌ "Unauthorized" without auth token (expected)
- ❌ "Forbidden" when accessing wrong client (expected)
- ✅ "Submission received"
- ✅ "Create lead job queued"
- ✅ "Lead created successfully"
- ❌ "Job validation failed: client_id mismatch" (should not happen in normal operation)

---

## Rollback Plan

If critical issues are found:

### 1. Immediate Rollback
```bash
# Revert to previous API/Worker deployment
# This will restore old endpoints

# web-admin will be broken, but old apps/web still works
```

### 2. Database Rollback
```bash
# If needed, drop the new indexes (they don't break anything)
psql $DATABASE_URL -c "
DROP INDEX IF EXISTS idx_submissions_idempotency_client;
DROP INDEX IF EXISTS idx_submissions_email_client;
DROP INDEX IF EXISTS idx_submissions_phone_client;
-- etc
"
```

### 3. Revert Code Changes
```bash
git revert HEAD~N  # Revert last N commits
git push origin main
```

---

## Common Issues & Solutions

### Issue: "School not found" errors
**Cause:** Using school slug instead of school ID
**Solution:** Update API calls to use school IDs

### Issue: 403 Forbidden on admin endpoints
**Cause:** User doesn't have access to school, or middleware not applied
**Solution:** Check user roles and school assignments

### Issue: Old /api/admin/:school/* routes return 404
**Cause:** Expected - routes changed to /api/admin/schools/:schoolId/*
**Solution:** Update client code to use new routes

### Issue: Worker jobs failing with client_id mismatch
**Cause:** Job data missing or incorrect client_id
**Solution:** Check job creation code, ensure client_id is included

### Issue: Login timing inconsistency
**Cause:** Network latency or database response time
**Solution:** 100ms delay masks most timing differences, but not all

---

## Success Criteria

Phase 1 deployment is successful when:

✅ All 15 unit tests pass
✅ Login endpoint doesn't reveal school existence
✅ New admin endpoints work with school IDs
✅ Middleware enforces tenant isolation
✅ Worker validates client context
✅ Database queries use new indexes
✅ web-admin can list and access schools
✅ web-landing can submit leads
✅ End-to-end lead flow works
✅ No cross-tenant data leakage
✅ Performance is acceptable (< 200ms for most endpoints)

---

## Post-Deployment Tasks

1. ✅ Monitor error rates for 24 hours
2. ✅ Check database query performance
3. ✅ Verify worker job success rate
4. ✅ Delete old `apps/web` directory
5. ✅ Update any documentation with new API routes
6. ✅ Create backup of production database
7. ✅ Plan for Phase 2 deployment

---

## Questions to Answer During Testing

1. Are all admin endpoints returning data?
2. Can school_admin users only see their schools?
3. Can client_admin users see all schools in their client?
4. Are submissions being created with correct client_id?
5. Are workers processing jobs without errors?
6. Are database queries using the new indexes?
7. Is the login endpoint timing consistent?
8. Can users submit leads from landing pages?
9. Are leads appearing in the admin portal?
10. Is there any cross-tenant data visible?

---

Good luck with deployment! 🚀
