# Lead Lander - Implementation Checklist

Track progress through all implementation phases. Check off items as they're completed.

---

## Phase 1: Security Hardening & Repository Split ✅ COMPLETE

### 1.1 Critical Security Fixes ✅
- [x] Fix login endpoint - prevent school enumeration (use clientId)
- [x] Remove public school listing endpoint
- [x] Add explicit client_id validation to all admin endpoints
- [x] Add client context validation middleware
- [x] Add explicit client_id validation in worker
- [x] Audit all queries for client_id filtering
- [x] Add missing tenant-scoped indexes

### 1.2 Split Repository Structure ✅
- [x] Create `apps/web-landing/` directory
- [x] Copy landing page files to web-landing
- [x] Create web-landing package.json
- [x] Create schoolContext.ts with SCHOOL_ID, CLIENT_ID
- [x] Update landing page routes (remove [school] segment)
- [x] Add success/privacy/terms pages to web-landing
- [x] Create `apps/web-admin/` directory
- [x] Copy admin files to web-admin
- [x] Create web-admin package.json
- [x] Update admin routes (add /schools/[schoolId])
- [x] Create multi-school dashboard
- [x] Update root workspace package.json
- [x] Update npm scripts for new structure
- [ ] Delete `apps/web/` after migration (TODO: Delete after testing)

### 1.3 API Route Updates ✅
- [x] Create `GET /api/public/school/:schoolId/landing/:programSlug`
- [x] Update admin endpoints to use schoolId
- [x] Add `GET /api/admin/schools` (list schools user can access)
- [x] Update all admin endpoints to new pattern
- [x] Add requireSchoolAccess helper function
- [x] Update authentication to return accessible schools

### 1.4 Config Management Decision
- [ ] Create migration 012_config_storage.sql (Deferred to Phase 2)
- [ ] Create seed script to migrate YAML → DB (Deferred to Phase 2)
- [ ] Update getConfigForClient() to read from database (Deferred to Phase 2)
- [ ] Add cache layer for config (Deferred to Phase 2)

**✅ Phase 1 Complete:** Security hardened, repository split, API updated
**Note:** Config management (1.4) deferred to Phase 2 - current YAML approach works fine for now

---

## Phase 2: Core Functionality & Database Completion ⏱️ Week 3-4

### 2.1 Complete Config Builder UI
- [ ] Create tabbed interface (Schools, Programs, Campuses, CRM, Branding)
- [ ] Build SchoolEditor component
- [ ] Build ProgramEditor component
- [ ] Build CampusEditor component
- [ ] Build CrmConnectionEditor component
- [ ] Build BrandingEditor component
- [ ] Create preview iframe component
- [ ] Create preview endpoint in web-landing

### 2.2 Implement Draft System
- [ ] Update config_versions table with status column
- [ ] Create draft management API endpoints
- [ ] Add approval permission checks
- [ ] Build approval UI in admin panel
- [ ] Remove hardcoded mock draft data
- [ ] Implement deployment webhook
- [ ] Add deployment status tracking
- [ ] Create deployment_log table

### 2.3 Enhanced Data Models
- [ ] Update programs table with new fields (hero_image, duration, etc.)
- [ ] Update TypeScript types for programs
- [ ] Add testimonials support
- [ ] Add FAQs support
- [ ] Add highlights support

### 2.4 Complete Admin Views
- [ ] Complete UsersView (list, create, edit, bulk actions)
- [ ] Complete AuditView (timeline, filters, export)
- [ ] Complete SuperAdminView (list clients, create wizard, health dashboard)

**✅ Phase 2 Complete:** Config builder functional, draft system working, admin views complete

---

## Phase 3: Landing Page & Form Enhancements ⏱️ Week 5-6

### 3.1 Enhanced Landing Pages
- [ ] Create new layout with sections
- [ ] Build HeroSection component
- [ ] Build HighlightsSection component
- [ ] Build TestimonialsSection component
- [ ] Build FAQSection component
- [ ] Replace all `<img>` with Next.js `<Image>`
- [ ] Set up S3 bucket for images
- [ ] Set up CloudFront for image CDN
- [ ] Create image upload endpoint in API

### 3.2 Form Validation & Accessibility
- [ ] Install react-hook-form, zod, @hookform/resolvers
- [ ] Create validation schemas
- [ ] Integrate react-hook-form into FormEngine
- [ ] Add field-level error messages
- [ ] Add phone number formatting
- [ ] Add ARIA labels to all form controls
- [ ] Add progress bar ARIA attributes
- [ ] Add keyboard navigation
- [ ] Add focus management
- [ ] Add screen reader announcements
- [ ] Implement progress saving to localStorage
- [ ] Implement restore on page load

### 3.3 Success Page
- [ ] Create enhanced success page
- [ ] Add "What happens next" section
- [ ] Add email confirmation
- [ ] Add social sharing (optional)

**✅ Phase 3 Complete:** Landing pages rich with content, forms validated and accessible, success page polished

---

## Phase 4: Admin Dashboard Polish ⏱️ Week 7-8

### 4.1 Real-Time Metrics & Alerts
- [ ] Create DateRangePicker component
- [ ] Add preset date ranges
- [ ] Update metrics API for date ranges
- [ ] Calculate alert conditions
- [ ] Display alert banners
- [ ] Make KPI cards clickable
- [ ] Add tooltips with trends

### 4.2 Database View Enhancements
- [ ] Add checkbox column for bulk selection
- [ ] Add bulk action bar
- [ ] Implement bulk export
- [ ] Implement bulk requeue
- [ ] Add sort state and indicators
- [ ] Update API to support sorting
- [ ] Create RowActionsMenu component
- [ ] Implement row actions (retry, view audit, copy ID, download PDF)

### 4.3 Worker Metrics
- [ ] Enhance `/worker/metrics` endpoint
- [ ] Create WorkerStatus component
- [ ] Display queue depth by status
- [ ] Display delivery stats
- [ ] Add worker health indicator

**✅ Phase 4 Complete:** Dashboard has real-time alerts, database view enhanced, worker metrics visible

---

## Phase 5: Deployment Infrastructure ⏱️ Week 9-10

### 5.1 Vercel Deployment Setup
- [ ] Create scripts/deploy-school.sh
- [ ] Create scripts/deploy-admin.sh
- [ ] Make scripts executable
- [ ] Create Vercel organization
- [ ] Create Vercel project for admin
- [ ] Configure admin environment variables
- [ ] Test admin deployment
- [ ] Document school deployment process

### 5.2 CI/CD Pipeline
- [ ] Create .github/workflows/deploy-admin.yml
- [ ] Create .github/workflows/deploy-school.yml
- [ ] Create .github/workflows/api-worker.yml
- [ ] Add Vercel secrets to GitHub
- [ ] Add AWS secrets to GitHub

### 5.3 Webhook for Auto-Deploy
- [ ] Create deployment webhook endpoint
- [ ] Implement GitHub Actions trigger
- [ ] Add deployment status tracking
- [ ] Show recent deployments in admin UI
- [ ] Add manual deploy button

**✅ Phase 5 Complete:** Vercel deployments automated, CI/CD working, webhooks triggering redeployments

---

## Phase 6: Production Polish ⏱️ Week 11-12

### 6.1 Error Handling & User Feedback
- [ ] Install sonner in both web apps
- [ ] Add Toaster to layouts
- [ ] Use toasts throughout apps
- [ ] Create skeleton components
- [ ] Add loading states to all data fetching
- [ ] Add Suspense boundaries
- [ ] Create ErrorBoundary component
- [ ] Wrap components with error boundaries
- [ ] Create EmptyState component
- [ ] Add empty states to database, metrics, etc.

### 6.2 SEO & Meta Tags
- [ ] Implement generateMetadata for landing pages
- [ ] Add JSON-LD structured data
- [ ] Create dynamic sitemap
- [ ] Create robots.txt

### 6.3 Performance Optimization
- [ ] Replace all `<img>` with `<Image>` (if not done in Phase 3)
- [ ] Set up image CDN (if not done in Phase 3)
- [ ] Use dynamic imports for heavy components
- [ ] Split admin routes
- [ ] Install SWR in web-admin
- [ ] Use SWR for admin data fetching
- [ ] Install bundle analyzer
- [ ] Analyze and optimize bundles

### 6.4 Accessibility Audit
- [ ] Install Playwright and @axe-core/playwright
- [ ] Create accessibility test suite
- [ ] Run tests and fix violations
- [ ] Test keyboard navigation manually
- [ ] Test with screen reader (NVDA/JAWS)
- [ ] Check color contrast
- [ ] Check focus indicators
- [ ] Verify accessibility checklist (11 items in plan)

### 6.5 Legal & Compliance
- [ ] Create privacy policy page
- [ ] Create terms of service page
- [ ] Create accessibility statement page
- [ ] Link to legal pages from footer
- [ ] Install react-cookie-consent
- [ ] Add cookie banner
- [ ] Create data request form
- [ ] Create API endpoint for data requests

**✅ Phase 6 Complete:** Error handling polished, SEO optimized, performance tuned, accessibility compliant, legal pages published

---

## Phase 7: Monitoring & Operations ⏱️ Week 13-14

### 7.1 Application Monitoring
- [ ] Install Sentry SDKs in all apps
- [ ] Configure Sentry for web-landing
- [ ] Configure Sentry for web-admin
- [ ] Configure Sentry for API
- [ ] Configure Sentry for Worker
- [ ] Set up Sentry alerts
- [ ] Create comprehensive health check function
- [ ] Update /healthz endpoint
- [ ] Set up health check monitoring (Pingdom, etc.)
- [ ] Install prom-client (optional)
- [ ] Create /metrics endpoint (optional)

### 7.2 Admin Notifications
- [ ] Create alert checking service
- [ ] Implement alert email templates
- [ ] Set up cron job for alert checking
- [ ] Add notifications table
- [ ] Create notification API endpoints
- [ ] Add notification bell to admin header

### 7.3 Documentation & Help
- [ ] Build HelpTooltip component
- [ ] Add tooltips to complex fields
- [ ] Create admin documentation site
- [ ] Add link to docs in admin header
- [ ] Build onboarding wizard for first login
- [ ] Add interactive tour (optional)

**✅ Phase 7 Complete:** Monitoring active, alerts working, documentation published, help system in place

---

## Phase 8: Launch Preparation ⏱️ Week 15-16

### 8.1 Security Audit
- [ ] Run npm audit and fix issues
- [ ] Run Snyk scan and fix issues
- [ ] Complete security checklist (14 items in plan)
- [ ] Conduct penetration testing (8 test areas)
- [ ] Document findings and remediate

### 8.2 Load Testing
- [ ] Install Artillery
- [ ] Create artillery-config.yml
- [ ] Run load tests against staging
- [ ] Analyze results (check p95, p99, error rate, throughput)
- [ ] Identify and fix bottlenecks

### 8.3 Backup & Disaster Recovery
- [ ] Create backup script (scripts/backup-db.sh)
- [ ] Make script executable
- [ ] Set up cron job for daily backups
- [ ] Or enable RDS automated backups
- [ ] Document recovery procedures
- [ ] Test recovery procedure
- [ ] Set up monitoring for backups

### 8.4 Create Runbook
- [ ] Create docs/runbook.md (deployment, monitoring, common issues, escalation)
- [ ] Create docs/troubleshooting.md

### 8.5 Client Onboarding Documentation
- [ ] Create docs/client-onboarding.md
- [ ] Create admin user guide (PDF or video)
- [ ] Create FAQ document

### 8.6 Final Pre-Launch Checklist
- [ ] Infrastructure (6 items)
- [ ] Security (6 items)
- [ ] Performance (6 items)
- [ ] Functionality (7 items)
- [ ] Documentation (5 items)
- [ ] Legal (5 items)
- [ ] Support (4 items)

**✅ Phase 8 Complete:** Security audited, load tested, backups automated, runbook complete, ready to launch! 🚀

---

## Post-Launch Roadmap

### Month 5-6: Iteration
- [ ] Gather client feedback
- [ ] Fix bugs reported by users
- [ ] Optimize based on analytics
- [ ] A/B test landing page variations
- [ ] Add Google Analytics or Mixpanel
- [ ] Implement feature requests

### Month 7-8: Scale
- [ ] Add more CRM integrations (Salesforce, HubSpot)
- [ ] Build landing page template library
- [ ] Add multi-language support
- [ ] Implement SSO for enterprise clients
- [ ] Add API for programmatic access

### Month 9-12: Advanced Features
- [ ] AI-powered lead scoring
- [ ] Chatbot for pre-qualification
- [ ] Video testimonials
- [ ] Virtual campus tours
- [ ] Scholarship calculator
- [ ] Student portal

---

## Quick Progress View

```
Phase 1: Security & Split          [✓] Complete
Phase 2: Core Functionality         [ ] Complete
Phase 3: Landing & Form             [ ] Complete
Phase 4: Admin Polish               [ ] Complete
Phase 5: Deployment Infra           [ ] Complete
Phase 6: Production Polish          [ ] Complete
Phase 7: Monitoring & Ops           [ ] Complete
Phase 8: Launch Prep                [ ] Complete

🎉 LAUNCH READY!                    [ ] Complete
```

---

## Notes Section

Use this space to track blockers, decisions, or important notes:

```
Date: ___________
Notes:




Date: ___________
Notes:




Date: ___________
Notes:



```
