# Phase 1 & Phase 2 - Comprehensive Test Plan

## Deployment Checklist

### 1. Database Migration
Run migrations in order:
```bash
# Connect to API container and run:
npm run migrate
```

**Expected Migrations:**
- ✅ Migration 013: Landing Page Builder (adds template_type, hero_image, highlights, testimonials, faqs, stats, sections_config to programs table)
- ✅ Migration 014: Quiz Builder (adds quiz_questions and quiz_answer_options tables)

### 2. AWS ECS Deployment

**API Service:**
1. Update task definition for `api` with latest image tag
2. Update service to use new task definition
3. Wait for deployment to complete
4. Run custom task: `npm run migrate` (via AWS Console or CLI)
5. Verify new task definition is running

**Worker Service:**
1. Update task definition for `worker` with latest image tag
2. Update service to use new task definition
3. Wait for deployment to complete
4. Verify new task definition is running

### 3. Vercel Deployment

**Auto-deploys (no action needed):**
- ✅ web-landing (landing pages)
- ✅ web-admin (admin dashboard)

**Verify Deployments:**
- Check Vercel dashboard for successful deployments
- Verify no build errors
- Check deployment logs

### 4. Environment Variables Check

**No new environment variables required** - all features use existing env vars:
- ✅ `DATABASE_URL` - existing
- ✅ `CONFIG_CACHE_TTL_SECONDS` - existing (optional, defaults to 60)
- ✅ `AUTH_COOKIE_NAME` - existing
- ✅ `NEXT_PUBLIC_API_BASE_URL` - existing
- ✅ Redis connection for queue - existing

### 5. Post-Deployment Verification

**API Health Checks:**
```bash
curl https://api.yourdomain.com/health
curl https://api.yourdomain.com/worker/healthz
```

**Config Cache:**
- After migration, config cache will auto-refresh within 60 seconds
- Or manually restart API/Worker services to force cache refresh

---

## Phase 1 Testing - Security & Multi-Tenancy

### 1.1 Tenant Isolation Tests

**Test Case 1.1.1: Client-Scoped Data Access**
- [ ] Login as Client Admin for School A
- [ ] Verify dashboard only shows School A data
- [ ] Verify cannot access `/admin/school-b` routes (should redirect or 403)
- [ ] Check database endpoint only shows School A submissions

**Test Case 1.1.2: School-Scoped Admin Access**
- [ ] Login as School Admin for School A
- [ ] Verify can only see School A data
- [ ] Verify cannot access other schools' data
- [ ] Verify cannot access config builder (should show "Access Denied")

**Test Case 1.1.3: Super Admin Access**
- [ ] Login as Super Admin
- [ ] Verify can access `/super` route
- [ ] Verify can see all clients
- [ ] Verify can access any school's admin panel
- [ ] Verify can access config builder for any school

### 1.2 API Security Tests

**Test Case 1.2.1: Authentication Required**
- [ ] Try accessing `/api/admin/schools` without cookie → 401
- [ ] Try accessing `/api/admin/schools/:schoolId/config` without auth → 401
- [ ] Try accessing public endpoints without auth → 200 OK

**Test Case 1.2.2: Authorization Checks**
- [ ] School Admin tries to access config builder → 403 Forbidden
- [ ] Client Admin tries to access config builder → 200 OK
- [ ] Staff user tries to access admin dashboard → 403 Forbidden

**Test Case 1.2.3: Tenant Isolation in API**
- [ ] Login as School A admin
- [ ] Try to GET `/api/admin/schools/school-b-id/config` → 403 or 404
- [ ] Try to POST data to school-b-id endpoint → 403 or 404

### 1.3 Database Security Tests

**Test Case 1.3.1: Query-Level Tenant Filtering**
- [ ] Check API logs: All queries should include `client_id` filter
- [ ] Verify submissions endpoint filters by client_id
- [ ] Verify metrics endpoint filters by client_id

**Test Case 1.3.2: Cross-Client Data Leakage**
- [ ] Create submission for School A
- [ ] Login as School B admin
- [ ] Verify cannot see School A submission in database view
- [ ] Verify metrics don't include School A data

### 1.4 Session & Cookie Security

**Test Case 1.4.1: Secure Cookie Handling**
- [ ] Verify session cookie has `HttpOnly` flag
- [ ] Verify session cookie has `Secure` flag (in production)
- [ ] Verify session cookie has `SameSite` attribute

**Test Case 1.4.2: Session Expiration**
- [ ] Login and get session cookie
- [ ] Wait for session timeout
- [ ] Try to access protected route → Should redirect to login

---

## Phase 2 Testing - Landing Page Builder

### 2.1 Config Builder Access Control

**Test Case 2.1.1: Permission Gates**
- [ ] Login as School Admin → Config builder link NOT visible
- [ ] Login as Client Admin → Config builder link visible
- [ ] Login as Super Admin → Config builder link visible
- [ ] Staff user → Cannot access admin at all

**Test Case 2.1.2: Config Builder UI Access**
- [ ] Navigate to `/admin/school-slug/config`
- [ ] School Admin → "Access Denied" message
- [ ] Client Admin → Config builder loads successfully
- [ ] Super Admin → Config builder loads successfully

### 2.2 Landing Page Editor Tests

**Test Case 2.2.1: Template Selection**
- [ ] Select a program in config builder
- [ ] Change template from "full" to "minimal"
- [ ] Save draft
- [ ] Verify landing page renders with minimal template (form only, no extra sections)
- [ ] Change back to "full" template
- [ ] Verify landing page renders all sections

**Test Case 2.2.2: Hero Section Editing**
- [ ] Edit headline, subheadline, body text
- [ ] Add hero image URL
- [ ] Save draft
- [ ] Preview landing page
- [ ] Verify hero content displays correctly
- [ ] Verify hero image appears with overlay

**Test Case 2.2.3: Highlights Section**
- [ ] Add 3 highlights with icons and text
- [ ] Save draft
- [ ] Preview landing page (full template)
- [ ] Verify highlights display in grid
- [ ] Remove one highlight, save, verify removal

**Test Case 2.2.4: Stats Section**
- [ ] Add placement rate: "95%"
- [ ] Add average salary: "$65,000"
- [ ] Add duration: "18 months"
- [ ] Add graduation rate: "92%"
- [ ] Save and preview
- [ ] Verify stats display in colored section

**Test Case 2.2.5: Testimonials Section**
- [ ] Add 2 testimonials with quotes, authors, roles
- [ ] Add photo URL to one testimonial
- [ ] Save and preview
- [ ] Verify testimonials display correctly
- [ ] Verify photo displays as circle avatar

**Test Case 2.2.6: FAQ Section**
- [ ] Add 3 FAQs with questions and answers
- [ ] Save and preview
- [ ] Verify FAQs display with accordion (+/- toggles)
- [ ] Click to expand/collapse FAQs
- [ ] Verify only one open at a time

### 2.3 Draft/Approval Workflow Tests

**Test Case 2.3.1: Draft Creation**
- [ ] Edit landing page config
- [ ] Click "Save Draft"
- [ ] Verify success message
- [ ] Verify draft appears in "Drafts" tab
- [ ] Verify landing page still shows OLD content (draft not live)

**Test Case 2.3.2: Draft Submission**
- [ ] Create/edit draft
- [ ] Click "Submit for Approval"
- [ ] Verify status changes to "Pending Approval"
- [ ] Verify cannot edit while pending

**Test Case 2.3.3: Draft Approval**
- [ ] Login as Super Admin or another Client Admin
- [ ] Navigate to Drafts tab
- [ ] Click "Approve" on pending draft
- [ ] Verify status changes to "Approved"
- [ ] Verify landing page NOW shows NEW content (draft is live)

**Test Case 2.3.4: Draft Rejection**
- [ ] Create and submit draft for approval
- [ ] Login as approver
- [ ] Click "Reject" and provide reason
- [ ] Verify status changes to "Rejected"
- [ ] Verify rejection reason displays
- [ ] Verify landing page still shows old content

### 2.4 Live Preview Tests

**Test Case 2.4.1: Device Preview**
- [ ] Open preview panel in config builder
- [ ] Toggle between desktop/mobile/tablet views
- [ ] Verify responsive layout changes
- [ ] Verify content is readable in all views

**Test Case 2.4.2: Real-Time Preview**
- [ ] Edit headline text
- [ ] Observe preview updates (may require refresh)
- [ ] Edit hero image
- [ ] Verify preview shows new image

### 2.5 Contact-First Flow Test (CRITICAL)

**Test Case 2.5.1: Form Order Verification**
- [ ] Visit landing page
- [ ] Verify contact form appears FIRST (above other sections)
- [ ] Fill out: First name, Last name, Email, Phone
- [ ] Check consent checkbox
- [ ] Click "Get Started"
- [ ] Verify CRM lead is created immediately (check database)
- [ ] Verify user proceeds to next step (quiz or questions)

---

## Phase 2 Testing - Quiz Builder

### 3.1 Quiz Builder Access Control

**Test Case 3.1.1: Permission Gates**
- [ ] Login as School Admin → Quiz builder link NOT visible
- [ ] Login as Client Admin → Quiz builder link visible
- [ ] Login as Super Admin → Quiz builder link visible

**Test Case 3.1.2: Quiz Builder UI Access**
- [ ] Navigate to `/admin/school-slug/quiz`
- [ ] School Admin → "Access Denied" message
- [ ] Client Admin → Quiz builder loads successfully
- [ ] Super Admin → Quiz builder loads successfully

### 3.2 Question Management Tests

**Test Case 3.2.1: Create Single Choice Question**
- [ ] Click "+ Create Question"
- [ ] Enter question text: "What is your education level?"
- [ ] Select type: "Single Choice"
- [ ] Add options: "High School", "Some College", "Bachelor's", "Graduate"
- [ ] Set display order: 1
- [ ] Mark as Active
- [ ] Save question
- [ ] Verify question appears in list

**Test Case 3.2.2: Create Multiple Choice Question**
- [ ] Create question: "Which areas interest you?" (Multiple Choice)
- [ ] Add options: "Technology", "Healthcare", "Business", "Creative Arts"
- [ ] Save and verify

**Test Case 3.2.3: Create Text Input Question**
- [ ] Create question: "Tell us about your goals" (Text Input)
- [ ] Add help text: "Describe your career aspirations"
- [ ] Save and verify

**Test Case 3.2.4: Edit Question**
- [ ] Click "Edit" on existing question
- [ ] Modify question text
- [ ] Change display order
- [ ] Save and verify changes

**Test Case 3.2.5: Delete Question**
- [ ] Click "Delete" on a question
- [ ] Confirm deletion
- [ ] Verify question removed from list
- [ ] Verify options also deleted

**Test Case 3.2.6: Inactive Question**
- [ ] Edit question and uncheck "Active"
- [ ] Save
- [ ] Verify question shows "Inactive" badge
- [ ] Visit landing page, verify inactive question NOT shown

### 3.3 Point Assignment Tests

**Test Case 3.3.1: Assign Points to Programs**
- [ ] Edit a question
- [ ] For option "Healthcare": assign 10 points to Nursing program, 5 to Medical Assistant
- [ ] For option "Technology": assign 10 points to IT program, 5 to Cybersecurity
- [ ] Save
- [ ] Verify point assignments display in question card

**Test Case 3.3.2: Zero Points (No Assignment)**
- [ ] Edit question
- [ ] Leave point assignment empty or 0 for some programs
- [ ] Save
- [ ] Verify those programs not listed in point summary

### 3.4 Conditional Logic Tests

**Test Case 3.4.1: Conditional Question Display**
- [ ] Create Question 1: "Are you currently employed?" (Yes/No)
- [ ] Create Question 2: "What is your job title?" (Text)
- [ ] Set Question 2 conditional on Question 1 = "Yes"
- [ ] Save both questions
- [ ] Test on landing page:
  - [ ] Answer "No" to Q1 → Q2 should NOT appear
  - [ ] Answer "Yes" to Q1 → Q2 should appear

### 3.5 Quiz Flow & Recommendation Tests

**Test Case 3.5.1: Complete Quiz Flow**
- [ ] Set program to use quiz routing (check `use_quiz_routing` in database or config)
- [ ] Visit landing page
- [ ] Fill contact form and submit
- [ ] Verify quiz questions appear one at a time
- [ ] Answer all quiz questions
- [ ] Verify progress bar advances
- [ ] Complete quiz
- [ ] Verify success screen shows recommended program

**Test Case 3.5.2: Point Scoring Calculation**
- [ ] Create test quiz with known point values:
  - Q1: Option A → Nursing +10
  - Q2: Option B → Nursing +5, IT +10
- [ ] Complete quiz selecting Options A and B
- [ ] Expected scores: Nursing = 15, IT = 10
- [ ] Verify Nursing is recommended
- [ ] Check database: verify `quiz_scores` stored in answers JSON

**Test Case 3.5.3: Progressive CRM Updates**
- [ ] Fill contact form and submit
- [ ] Check database submissions table:
  - [ ] Verify submission created with contact info
  - [ ] Verify `crm_lead_id` populated
- [ ] Answer first quiz question
- [ ] Check database:
  - [ ] Verify `answers` JSON updated with `quiz_<question-id>`
  - [ ] Verify `last_step_completed` incremented
- [ ] Complete all quiz questions
- [ ] Check database final answers JSON includes:
  - [ ] `quiz_completed: true`
  - [ ] `quiz_scores: {...}`
  - [ ] `recommended_program: "program-id"`
  - [ ] `recommended_program_name: "Program Name"`

**Test Case 3.5.4: CRM Webhook Delivery**
- [ ] Complete quiz flow end-to-end
- [ ] Check delivery_attempts table:
  - [ ] Verify initial "create_lead" job succeeded
  - [ ] Verify "update_lead" jobs for each quiz step
  - [ ] Verify final "update_lead" with quiz results
- [ ] Check CRM webhook logs:
  - [ ] Verify received initial payload with contact info
  - [ ] Verify received update payloads with quiz answers
  - [ ] Verify final payload includes quiz_completed and recommendation

### 3.6 Skip Quiz Logic Tests

**Test Case 3.6.1: User Already Knows Program**
- [ ] Visit landing page for specific program (e.g., `/nursing`)
- [ ] Program has `useQuizRouting = false`
- [ ] Fill contact form and submit
- [ ] Verify quiz does NOT appear
- [ ] Verify proceeds directly to standard questions or completion

**Test Case 3.6.2: No Quiz Questions Configured**
- [ ] Set program to `useQuizRouting = true`
- [ ] But no quiz questions created for that school
- [ ] Visit landing page
- [ ] Fill contact form
- [ ] Verify gracefully handles no quiz (proceeds to next step)

---

## Integration Tests

### 4.1 End-to-End User Journey

**Test Case 4.1.1: Minimal Template Flow**
- [ ] Admin sets program to "minimal" template
- [ ] Visit landing page
- [ ] Verify ONLY hero + contact form visible
- [ ] Fill form and submit
- [ ] Complete any follow-up questions
- [ ] Verify success screen

**Test Case 4.1.2: Full Template with Quiz Flow**
- [ ] Admin sets program to "full" template with quiz
- [ ] Visit landing page
- [ ] Verify hero, highlights, stats, testimonials, FAQs visible
- [ ] Fill contact form FIRST
- [ ] Complete quiz questions
- [ ] Verify recommendation shown
- [ ] Complete standard questions
- [ ] Verify success screen with recommended program

**Test Case 4.1.3: Multi-School Scenario**
- [ ] Create config for School A and School B under same client
- [ ] Set different quiz questions for each school
- [ ] Set different landing page content for each
- [ ] Test School A flow:
  - [ ] Verify School A branding, content, quiz
  - [ ] Submit and verify CRM lead for School A
- [ ] Test School B flow:
  - [ ] Verify School B branding, content, quiz
  - [ ] Submit and verify CRM lead for School B
- [ ] Verify no data leakage between schools

### 4.2 Performance Tests

**Test Case 4.2.1: Config Cache Performance**
- [ ] Time initial page load (cold cache)
- [ ] Time second page load (warm cache)
- [ ] Verify cache hit (should be faster)
- [ ] Update config in admin
- [ ] Wait 60 seconds or restart service
- [ ] Verify updated config loads

**Test Case 4.2.2: Large Quiz Performance**
- [ ] Create quiz with 20+ questions
- [ ] Each with 5+ options and point assignments
- [ ] Visit landing page
- [ ] Verify questions load quickly
- [ ] Complete quiz
- [ ] Verify recommendation calculates quickly (< 1 second)

### 4.3 Error Handling Tests

**Test Case 4.3.1: API Down**
- [ ] Stop API service
- [ ] Try to load landing page
- [ ] Verify graceful error message
- [ ] Try to submit form
- [ ] Verify user-friendly error

**Test Case 4.3.2: Database Connection Lost**
- [ ] Simulate database disconnect
- [ ] Try to load admin dashboard
- [ ] Verify error logged
- [ ] Verify user sees error message

**Test Case 4.3.3: CRM Webhook Failure**
- [ ] Configure invalid webhook URL
- [ ] Submit form
- [ ] Verify submission saved to database
- [ ] Verify retry scheduled
- [ ] Check delivery_attempts table for failure logged
- [ ] Fix webhook URL
- [ ] Verify retry succeeds

---

## Data Validation Tests

### 5.1 Schema Validation

**Test Case 5.1.1: Config Schema Validation**
- [ ] Try to save invalid landing page config (missing required field)
- [ ] Verify validation error
- [ ] Try to save invalid quiz question (empty text)
- [ ] Verify validation error

**Test Case 5.1.2: Database Constraints**
- [ ] Try to create quiz question without client_id
- [ ] Verify constraint violation
- [ ] Try to create duplicate question with same ID
- [ ] Verify unique constraint

### 5.2 Input Sanitization

**Test Case 5.2.1: XSS Prevention**
- [ ] Try to inject `<script>alert('xss')</script>` in question text
- [ ] Save and view landing page
- [ ] Verify script does NOT execute
- [ ] Verify displayed as plain text

**Test Case 5.2.2: SQL Injection Prevention**
- [ ] Try to inject SQL in quiz answer: `'; DROP TABLE users; --`
- [ ] Submit form
- [ ] Verify database intact
- [ ] Verify answer stored safely

---

## Rollback Plan

If critical issues found during testing:

1. **Rollback Database:**
   ```sql
   -- Rollback migration 014
   DROP TABLE IF EXISTS quiz_answer_options;
   DROP TABLE IF EXISTS quiz_questions;
   ALTER TABLE programs DROP COLUMN IF EXISTS use_quiz_routing;

   -- Rollback migration 013
   ALTER TABLE programs DROP COLUMN IF EXISTS template_type;
   ALTER TABLE programs DROP COLUMN IF EXISTS hero_image;
   -- ... (drop all 013 columns)
   ```

2. **Rollback ECS Services:**
   - Revert to previous task definition revision
   - Update services
   - Verify previous version running

3. **Rollback Vercel:**
   - In Vercel dashboard, redeploy previous commit
   - Or rollback git commit and push

---

## Success Criteria

Phase 1 & 2 testing is complete when:
- [ ] All security tests pass (no data leakage between tenants)
- [ ] All access control tests pass (proper permission gating)
- [ ] Landing page builder fully functional (all sections render correctly)
- [ ] Quiz builder fully functional (questions, scoring, recommendations work)
- [ ] Contact-first flow confirmed working (CRM lead created immediately)
- [ ] Progressive CRM updates confirmed (each step updates lead)
- [ ] Draft/approval workflow functional (changes go live after approval)
- [ ] No critical bugs found
- [ ] Performance acceptable (< 2s page loads, < 1s recommendation calculation)
- [ ] Error handling graceful (no crashes, user-friendly errors)

---

## Post-Testing Tasks

After successful testing:
- [ ] Document any issues found and resolved
- [ ] Update monitoring/alerting for new endpoints
- [ ] Train client admin users on new features
- [ ] Create user guide for config builder and quiz builder
- [ ] Monitor production logs for first 48 hours
- [ ] Review CRM webhook delivery success rates
- [ ] Gather user feedback on quiz flow
