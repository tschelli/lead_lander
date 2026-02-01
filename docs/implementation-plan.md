# Lead Lander - Implementation Plan (Option A: Separate Deployments)

## Architecture Overview

### Deployment Model
- **Landing Pages**: One Vercel deployment per school → `school.mycompany.com`
- **Admin Portal**: Single Vercel deployment for all clients → `admin.mycompany.com`
- **API/Worker**: Single AWS ECS deployment serving all deployments
- **Database**: Single RDS Postgres with multi-tenant data (client_id scoping)

### Project Structure
```
lead_lander/
├── apps/
│   ├── web-landing/       # School landing pages (NEW - split from web)
│   │   ├── app/
│   │   │   ├── [program]/
│   │   │   ├── success/
│   │   │   ├── privacy/
│   │   │   └── terms/
│   │   └── components/
│   │       └── FormEngine.tsx
│   │
│   ├── web-admin/         # Admin portal (NEW - split from web)
│   │   ├── app/
│   │   │   ├── login/
│   │   │   ├── dashboard/
│   │   │   ├── schools/
│   │   │   │   └── [schoolId]/
│   │   │   │       ├── database/
│   │   │   │       ├── config/
│   │   │   │       ├── users/
│   │   │   │       └── audit/
│   │   │   └── super/
│   │   └── components/
│   │
│   ├── api/               # Express API (existing)
│   └── worker/            # Background worker (existing)
│
├── packages/
│   └── config-schema/     # Shared config types (existing)
│
├── configs/               # YAML configs (transition to DB in Phase 2)
├── migrations/            # SQL migrations
└── scripts/               # Deployment & utility scripts
```

---

## Phase 1: Security Hardening & Repository Split (Week 1-2)

### 1.1 Critical Security Fixes

**Backend Changes (apps/api/src/server.ts)**

- [ ] Fix login endpoint to prevent school enumeration
  - Change schema to accept `clientId` instead of `schoolSlug`
  - Return generic "Invalid credentials" for all auth failures
  - Location: `apps/api/src/server.ts:465-501`

- [ ] Remove public school listing endpoint
  - Delete `GET /api/public/schools` (not needed with per-school deployments)
  - Location: `apps/api/src/server.ts:586-600`

- [ ] Add explicit client_id validation to all admin endpoints
  ```typescript
  // Example pattern for all admin routes
  const school = await getSchoolById(schoolId);
  if (!school || school.client_id !== auth.user.clientId) {
    return res.status(403).json({ error: "Forbidden" });
  }
  ```

- [ ] Add client context validation middleware
  ```typescript
  // apps/api/src/middleware/clientScope.ts
  export function requireClientScope(req, res, next) {
    const clientIdHeader = req.get('X-Client-ID');
    if (!clientIdHeader) {
      return res.status(400).json({ error: "Missing client context" });
    }
    res.locals.requestClientId = clientIdHeader;
    next();
  }
  ```

**Worker Changes (apps/worker/src/worker.ts)**

- [ ] Add explicit client_id validation in job processing
  ```typescript
  if (submission.client_id !== clientId) {
    await logAudit(clientId, submissionId, "client_mismatch", {...});
    throw new Error("Client ID mismatch");
  }
  ```
  - Location: `apps/worker/src/worker.ts:125-132`

- [ ] Add tenant validation before CRM delivery
  - Verify school belongs to client_id from job

**Database Audit**

- [ ] Review all queries to ensure client_id filtering
  - Check submissions queries
  - Check delivery_attempts queries
  - Check audit_log queries
  - Check config queries

- [ ] Add missing indexes for tenant-scoped queries
  ```sql
  CREATE INDEX IF NOT EXISTS idx_submissions_client_status
    ON submissions (client_id, status, created_at DESC);
  ```

### 1.2 Split Repository Structure

**Create web-landing (public-facing landing pages)**

- [ ] Create `apps/web-landing/` directory structure
- [ ] Copy relevant files from `apps/web/`:
  - [ ] `app/[school]/[program]/page.tsx` → `app/[program]/page.tsx`
  - [ ] `components/FormEngine.tsx`
  - [ ] `components/questions.ts`
  - [ ] `app/globals.css`
  - [ ] `app/layout.tsx` (simplified - no admin nav)

- [ ] Create `apps/web-landing/package.json`
  ```json
  {
    "name": "@lead_lander/web-landing",
    "scripts": {
      "dev": "next dev -p 3000",
      "build": "next build",
      "start": "next start"
    },
    "dependencies": {
      "next": "^14.0.0",
      "react": "^18.0.0",
      "@lead_lander/config-schema": "*"
    }
  }
  ```

- [ ] Create `apps/web-landing/lib/schoolContext.ts`
  ```typescript
  export const SCHOOL_ID = process.env.NEXT_PUBLIC_SCHOOL_ID!;
  export const CLIENT_ID = process.env.NEXT_PUBLIC_CLIENT_ID!;
  export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

  if (!SCHOOL_ID || !CLIENT_ID) {
    throw new Error("School context not configured");
  }
  ```

- [ ] Update landing page to use school context
  - Remove dynamic `[school]` route
  - Landing URL: `/{program}` instead of `/{school}/{program}`
  - Fetch school data from `SCHOOL_ID` env var

- [ ] Add success/privacy/terms pages to web-landing

**Create web-admin (admin portal)**

- [ ] Create `apps/web-admin/` directory structure
- [ ] Copy relevant files from `apps/web/`:
  - [ ] All `app/admin/**` files
  - [ ] Admin components (DatabaseView, ConfigBuilder, UsersView, etc.)
  - [ ] Admin styles (admin.css, [school]/styles.css)

- [ ] Create `apps/web-admin/package.json`

- [ ] Update admin routes (remove `[school]` dynamic segment):
  - [ ] `/admin/page.tsx` → Multi-school dashboard
  - [ ] `/admin/schools/[schoolId]/database/page.tsx`
  - [ ] `/admin/schools/[schoolId]/config/page.tsx`
  - [ ] `/admin/schools/[schoolId]/users/page.tsx`
  - [ ] `/admin/schools/[schoolId]/audit/page.tsx`

- [ ] Create multi-school dashboard view
  ```tsx
  // apps/web-admin/app/dashboard/page.tsx
  // Shows all schools user has access to
  // Click school → go to /schools/{schoolId}
  ```

- [ ] Update admin API calls to use new school-scoped routes
  - Change: `/api/admin/${schoolSlug}/metrics`
  - To: `/api/admin/schools/${schoolId}/metrics`

**Update root workspace**

- [ ] Update `package.json` to include new workspaces
  ```json
  {
    "workspaces": [
      "apps/web-landing",
      "apps/web-admin",
      "apps/api",
      "apps/worker",
      "packages/*"
    ]
  }
  ```

- [ ] Update npm scripts
  ```json
  {
    "scripts": {
      "dev:landing": "npm --workspace apps/web-landing run dev",
      "dev:admin": "npm --workspace apps/web-admin run dev",
      "dev": "concurrently \"npm:dev:landing\" \"npm:dev:admin\" \"npm:dev:api\" \"npm:dev:worker\""
    }
  }
  ```

- [ ] Delete `apps/web/` after migration confirmed

### 1.3 API Route Updates

**Add school-scoped endpoints**

- [ ] Create new endpoint: `GET /api/public/school/:schoolId/landing/:programSlug`
  - Replaces: `GET /api/public/landing/:school/:program`
  - Takes school ID from URL, no school slug needed
  - Returns landing page config for that school+program

- [ ] Update admin endpoints to use schoolId instead of schoolSlug
  - [ ] `GET /api/admin/schools` - List all schools user can access
  - [ ] `GET /api/admin/schools/:schoolId/metrics`
  - [ ] `GET /api/admin/schools/:schoolId/submissions`
  - [ ] `GET /api/admin/schools/:schoolId/submissions/export`
  - [ ] `GET /api/admin/schools/:schoolId/config`
  - [ ] `GET /api/admin/schools/:schoolId/users`
  - [ ] `GET /api/admin/schools/:schoolId/audit`

- [ ] Add authorization check helper
  ```typescript
  async function requireSchoolAccess(auth: AuthContext, schoolId: string) {
    const school = await getSchoolById(schoolId);
    if (!school) {
      return { ok: false, status: 404, error: "School not found" };
    }

    if (school.client_id !== auth.user.clientId) {
      return { ok: false, status: 403, error: "Forbidden" };
    }

    const allowed = getAllowedSchools(auth, config);
    if (!allowed.some(s => s.id === schoolId)) {
      return { ok: false, status: 403, error: "Forbidden" };
    }

    return { ok: true, school };
  }
  ```

**Update authentication flow**

- [ ] Change login to use clientId instead of schoolSlug
  ```typescript
  // New schema
  const AuthLoginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
    clientId: z.string().min(1),  // Changed from schoolSlug
  });
  ```

- [ ] Update admin login page to get clientId from school selection

### 1.4 Config Management Decision

**Choose and implement:**

- [ ] **Decision**: Database as source of truth (recommended)
  - YAML files become seed data only
  - All config CRUD happens via API
  - Easier for per-deployment model

- [ ] Create migration for config tables
  ```sql
  -- migrations/012_config_storage.sql
  CREATE TABLE config_schools (...);
  CREATE TABLE config_programs (...);
  CREATE TABLE config_campuses (...);
  CREATE TABLE config_landing_pages (...);
  CREATE TABLE config_crm_connections (...);
  ```

- [ ] Create seed script to migrate YAML → Database
  ```bash
  npm run seed:config
  ```

- [ ] Update `getConfigForClient()` to read from database
  - Location: `apps/api/src/config.ts` and `apps/worker/src/config.ts`

- [ ] Add cache layer for config (Redis or in-memory with TTL)

**Acceptance Criteria:**
- [ ] All security vulnerabilities addressed
- [ ] Repository split into web-landing and web-admin
- [ ] API routes updated for new structure
- [ ] Config management decision implemented
- [ ] All tests passing
- [ ] No console errors in dev mode

---

## Phase 2: Core Functionality & Database Completion (Week 3-4)

### 2.1 Complete Config Builder UI

**Expand ConfigBuilder to full config management**

- [ ] Create tabbed interface for different config sections
  ```tsx
  <Tabs>
    <Tab label="Schools" />
    <Tab label="Programs" />
    <Tab label="Campuses" />
    <Tab label="CRM Connections" />
    <Tab label="Branding" />
  </Tabs>
  ```

- [ ] Build SchoolEditor component
  - [ ] Edit school name, slug
  - [ ] Upload logo (S3 integration)
  - [ ] Configure colors (color pickers)
  - [ ] Edit compliance disclaimer
  - [ ] Select CRM connection

- [ ] Build ProgramEditor component
  - [ ] Add/edit/delete programs
  - [ ] Edit landing copy (headline, subheadline, body, CTA)
  - [ ] Add hero image URL
  - [ ] Add program details (duration, salary, placement rate)
  - [ ] Add highlights (bullet points)
  - [ ] Add testimonials
  - [ ] Add FAQs
  - [ ] Configure question overrides

- [ ] Build CampusEditor component
  - [ ] Add/edit/delete campuses
  - [ ] Configure routing tags
  - [ ] Set notification recipients
  - [ ] Enable/disable email notifications

- [ ] Build CrmConnectionEditor component
  - [ ] Configure webhook URL
  - [ ] Set auth header name and env var
  - [ ] Test connection button
  - [ ] View delivery history

- [ ] Build BrandingEditor component
  - [ ] Upload school logo
  - [ ] Configure color scheme with live preview
  - [ ] Set default fonts (if supported)

**Add live preview**

- [ ] Create preview iframe component
  ```tsx
  <div className="config-editor-layout">
    <div className="editor-panel">
      {/* Form fields */}
    </div>
    <div className="preview-panel">
      <iframe
        src={`/preview/${schoolId}/${programSlug}?draft=${draftId}`}
        className="preview-frame"
      />
    </div>
  </div>
  ```

- [ ] Create preview endpoint in web-landing
  ```typescript
  // apps/web-landing/app/preview/[schoolId]/[programSlug]/page.tsx
  // Fetches draft config from API using ?draft=<draftId>
  ```

### 2.2 Implement Draft System

**Create draft/approval workflow**

- [ ] Update config_versions table to track status
  ```sql
  ALTER TABLE config_versions ADD COLUMN status TEXT DEFAULT 'draft';
  -- Status: 'draft', 'pending_approval', 'approved', 'rejected'
  ```

- [ ] Create API endpoints for draft management
  - [ ] `POST /api/admin/schools/:schoolId/config/draft` - Save draft
  - [ ] `POST /api/admin/schools/:schoolId/config/submit` - Submit for approval
  - [ ] `POST /api/admin/schools/:schoolId/config/approve` - Approve (client_admin+)
  - [ ] `POST /api/admin/schools/:schoolId/config/reject` - Reject with reason
  - [ ] `GET /api/admin/schools/:schoolId/config/drafts` - List drafts

- [ ] Add approval permission check
  ```typescript
  // Only client_admin and super_admin can approve
  const canApprove = auth.roles.some(r =>
    r.role === 'client_admin' || r.role === 'super_admin'
  );
  ```

- [ ] Build approval UI in admin panel
  ```tsx
  // apps/web-admin/app/schools/[schoolId]/config/approvals/page.tsx
  {drafts.map(draft => (
    <DraftCard
      draft={draft}
      onApprove={handleApprove}
      onReject={handleReject}
    />
  ))}
  ```

- [ ] Remove hardcoded mock draft data from dashboard
  - Location: `apps/web-admin/app/schools/[schoolId]/page.tsx`

**Trigger redeployment on approval**

- [ ] Implement deployment webhook
  ```typescript
  async function triggerSchoolRedeployment(schoolId: string) {
    const school = await getSchoolById(schoolId);
    const hookUrl = `https://api.vercel.com/v1/integrations/deploy/...`;

    await fetch(hookUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.VERCEL_DEPLOY_HOOK_TOKEN}` }
    });

    return { status: 'deploying' };
  }
  ```

- [ ] Add deployment status tracking
  ```sql
  CREATE TABLE deployment_log (
    id UUID PRIMARY KEY,
    school_id TEXT NOT NULL,
    config_version_id UUID,
    status TEXT NOT NULL,
    vercel_deployment_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  ```

### 2.3 Enhanced Data Models

**Add program richness fields**

- [ ] Update programs table
  ```sql
  ALTER TABLE config_programs ADD COLUMN hero_image TEXT;
  ALTER TABLE config_programs ADD COLUMN duration TEXT;
  ALTER TABLE config_programs ADD COLUMN salary_range TEXT;
  ALTER TABLE config_programs ADD COLUMN placement_rate TEXT;
  ALTER TABLE config_programs ADD COLUMN certifications JSONB;
  ALTER TABLE config_programs ADD COLUMN highlights JSONB;
  ALTER TABLE config_programs ADD COLUMN testimonials JSONB;
  ALTER TABLE config_programs ADD COLUMN faqs JSONB;
  ```

- [ ] Update TypeScript types
  ```typescript
  type Program = {
    // ... existing fields
    heroImage?: string;
    duration?: string;
    salaryRange?: string;
    placementRate?: string;
    certifications?: string[];
    highlights?: string[];
    testimonials?: Array<{
      quote: string;
      author: string;
      role?: string;
      photo?: string;
    }>;
    faqs?: Array<{
      question: string;
      answer: string;
    }>;
  };
  ```

### 2.4 Complete Admin Views

**UsersView (apps/web-admin/app/schools/[schoolId]/users/page.tsx)**

- [ ] List all users for client
  - Show email, role, school assignment, status, last login
  - Filter by role, school, status

- [ ] Create user modal
  - [ ] Email input with validation
  - [ ] Role selector (super_admin, client_admin, school_admin, staff)
  - [ ] School selector (if school_admin or staff)
  - [ ] Auto-generate temporary password
  - [ ] Send invite email

- [ ] Edit user modal
  - [ ] Change role
  - [ ] Reassign school
  - [ ] Enable/disable account
  - [ ] Reset password

- [ ] Bulk actions
  - [ ] Export users to CSV
  - [ ] Bulk disable/enable

**AuditView (apps/web-admin/app/schools/[schoolId]/audit/page.tsx)**

- [ ] Fetch and display audit log
  - Timeline view with event cards
  - Show: timestamp, event type, user, payload

- [ ] Filter controls
  - [ ] Event type dropdown
  - [ ] Date range picker
  - [ ] User filter
  - [ ] Search by submission ID or email

- [ ] Event details modal
  - [ ] Show full payload as formatted JSON
  - [ ] Show before/after for config changes
  - [ ] Link to related resources (submission, user, etc.)

- [ ] Export audit log to CSV

**SuperAdminView (apps/web-admin/app/super/page.tsx)**

- [ ] List all clients with stats
  - Client name, # schools, # programs, # users, created date

- [ ] Create client wizard
  - [ ] Client info (id, name)
  - [ ] Create first school
  - [ ] Create first admin user
  - [ ] Trigger school deployment

- [ ] Bulk operations
  - [ ] Import schools from CSV
  - [ ] Export all clients

- [ ] System health dashboard
  - [ ] API health
  - [ ] Worker health
  - [ ] Queue depth by client
  - [ ] Error rate by client

**Acceptance Criteria:**
- [ ] Config builder can manage all config aspects
- [ ] Draft/approval workflow functional
- [ ] All admin views complete and functional
- [ ] Program data model supports rich content
- [ ] Config changes trigger redeployment

---

## Phase 3: Landing Page & Form Enhancements (Week 5-6)

### 3.1 Enhanced Landing Pages

**Update landing page layout**

- [ ] Create new layout with sections
  ```tsx
  <main>
    <HeroSection school={school} program={program} />
    <HighlightsSection highlights={program.highlights} />
    <TestimonialsSection testimonials={program.testimonials} />
    <FormSection schoolId={schoolId} programId={programId} />
    <FAQSection faqs={program.faqs} />
  </main>
  ```

- [ ] Build HeroSection component
  - [ ] Background image support
  - [ ] Overlay with headline/subheadline
  - [ ] CTA button
  - [ ] School logo

- [ ] Build HighlightsSection
  - [ ] Icon grid or card layout
  - [ ] Program duration, salary, placement rate
  - [ ] Key selling points

- [ ] Build TestimonialsSection
  - [ ] Carousel or grid
  - [ ] Student photos (optional)
  - [ ] Quote, name, role

- [ ] Build FAQSection
  - [ ] Accordion/collapsible design
  - [ ] Q&A pairs from program config

**Add image optimization**

- [ ] Replace all `<img>` with Next.js `<Image>`
  - Location: Throughout web-landing components
  - Add proper width/height attributes
  - Use priority for above-fold images

- [ ] Set up image hosting
  - [ ] S3 bucket for uploaded images
  - [ ] CloudFront CDN in front of S3
  - [ ] Image upload endpoint in API

### 3.2 Form Validation & Accessibility

**Install validation libraries**

- [ ] Install dependencies
  ```bash
  npm install --workspace apps/web-landing react-hook-form zod @hookform/resolvers
  ```

**Refactor FormEngine with react-hook-form**

- [ ] Create validation schemas
  ```typescript
  const contactSchema = z.object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    email: z.string().email("Invalid email address"),
    phone: z.string()
      .regex(/^[\d\s\-\(\)]+$/, "Invalid phone number")
      .min(10, "Phone number too short"),
  });
  ```

- [ ] Integrate react-hook-form
  ```tsx
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(contactSchema),
  });
  ```

- [ ] Add field-level error messages
  ```tsx
  {errors.email && (
    <span className="field-error" role="alert">
      {errors.email.message}
    </span>
  )}
  ```

- [ ] Add input validation styles
  ```css
  .field-input--error {
    border-color: #d9534f;
  }
  ```

**Add progressive enhancements**

- [ ] Phone number formatting
  ```typescript
  const formatPhone = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
    if (match) {
      return '(' + match[1] + ') ' + match[2] + '-' + match[3];
    }
    return value;
  };
  ```

- [ ] Email confirmation field (optional)

- [ ] Password strength indicator (if adding user accounts)

**Add accessibility improvements**

- [ ] Add ARIA labels to all form controls
  ```tsx
  <input
    {...register('firstName')}
    aria-label="First name"
    aria-invalid={!!errors.firstName}
    aria-describedby={errors.firstName ? 'firstName-error' : undefined}
  />
  ```

- [ ] Add progress bar ARIA
  ```tsx
  <div
    role="progressbar"
    aria-valuenow={progress}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-label={`Form progress: ${progress}%`}
  >
    <span style={{ width: `${progress}%` }} />
  </div>
  ```

- [ ] Add keyboard navigation
  - [ ] Tab order correct
  - [ ] Enter submits current step
  - [ ] Escape cancels/goes back

- [ ] Add focus management
  - [ ] Focus first field on step change
  - [ ] Focus error message on validation failure

- [ ] Add screen reader announcements
  ```tsx
  <div role="status" aria-live="polite" className="sr-only">
    {error && error}
  </div>
  ```

**Add progress saving**

- [ ] Save form state to localStorage on change
  ```typescript
  useEffect(() => {
    const draftKey = `form_draft_${schoolId}_${programId}`;
    localStorage.setItem(draftKey, JSON.stringify({
      answers,
      contact,
      step: currentStep,
      savedAt: new Date().toISOString(),
    }));
  }, [answers, contact, currentStep]);
  ```

- [ ] Restore on page load with confirmation
  ```typescript
  useEffect(() => {
    const saved = localStorage.getItem(draftKey);
    if (saved && confirm('Resume your previous application?')) {
      const data = JSON.parse(saved);
      setAnswers(data.answers);
      setContact(data.contact);
      setCurrentStep(data.step);
    }
  }, []);
  ```

- [ ] Clear on successful submission

### 3.3 Success Page

**Create enhanced success page**

- [ ] Create `apps/web-landing/app/success/page.tsx`
  ```tsx
  export default function SuccessPage({ searchParams }) {
    const submissionId = searchParams.submission;

    return (
      <main className="success-page">
        <div className="success-icon">✓</div>
        <h1>Application Submitted!</h1>
        <p>Reference: {submissionId?.slice(0, 8)}</p>
        <NextSteps school={school} program={program} />
        <AdditionalActions />
      </main>
    );
  }
  ```

- [ ] Add "What happens next" section
  - Timeline of follow-up steps
  - Expected response time
  - Contact information

- [ ] Add email confirmation
  - Send confirmation email to applicant
  - Include submission details
  - Include next steps

- [ ] Add social sharing
  - "I just applied to {program} at {school}"
  - Share to social media (optional)

**Acceptance Criteria:**
- [ ] Landing pages have rich content sections
- [ ] Form validation works with proper error messages
- [ ] All accessibility requirements met (WCAG AA)
- [ ] Progress saving works
- [ ] Success page provides clear next steps
- [ ] Images optimized and loading fast

---

## Phase 4: Admin Dashboard Polish (Week 7-8)

### 4.1 Real-Time Metrics & Alerts

**Add date range controls**

- [ ] Create DateRangePicker component
  ```tsx
  <DateRangePicker
    from={dateRange.from}
    to={dateRange.to}
    onChange={setDateRange}
  />
  ```

- [ ] Add preset ranges (Today, Last 7 days, Last 30 days, Custom)

- [ ] Update metrics API to accept date range parameters

**Add real-time alerts**

- [ ] Calculate alert conditions
  ```typescript
  const failureRate = (failed / (delivered + failed)) * 100;
  const queueBacklog = delivering + received;
  ```

- [ ] Display alert banners
  ```tsx
  {failureRate > 10 && (
    <Alert severity="danger">
      <strong>High Failure Rate</strong>
      <p>{failureRate.toFixed(1)}% of leads failing to deliver</p>
      <Link href="/schools/{schoolId}/database?status=failed">
        View failed submissions
      </Link>
    </Alert>
  )}
  ```

- [ ] Add alert types:
  - [ ] High failure rate (>10%)
  - [ ] Queue backlog (>100 jobs)
  - [ ] No submissions in 24h
  - [ ] Worker unhealthy

**Add metric drill-down**

- [ ] Make KPI cards clickable
  ```tsx
  <div
    className="kpi kpi--clickable"
    onClick={() => router.push(`/schools/${schoolId}/database?status=failed`)}
  >
    <span className="admin-muted">Failed deliveries</span>
    <strong>{failed}</strong>
  </div>
  ```

- [ ] Add tooltips with additional context
  - Hover to see trend vs. previous period
  - Show percentage change

### 4.2 Database View Enhancements

**Add bulk actions**

- [ ] Add checkbox column to table
  ```tsx
  <th>
    <input
      type="checkbox"
      checked={selectedAll}
      onChange={toggleSelectAll}
    />
  </th>
  ```

- [ ] Add bulk action bar
  ```tsx
  {selectedIds.size > 0 && (
    <BulkActionBar
      count={selectedIds.size}
      onExport={bulkExport}
      onRequeue={bulkRequeue}
      onClear={clearSelection}
    />
  )}
  ```

- [ ] Implement bulk export
  - Export selected submissions to CSV
  - Include all selected fields

- [ ] Implement bulk requeue
  - Requeue failed submissions
  - Confirm before action

**Add sortable columns**

- [ ] Add sort state
  ```typescript
  const [sort, setSort] = useState({
    column: 'created_at',
    order: 'desc'
  });
  ```

- [ ] Add sort indicators to table headers
  ```tsx
  <th onClick={() => handleSort('created_at')}>
    Created {sort.column === 'created_at' && (sort.order === 'asc' ? '↑' : '↓')}
  </th>
  ```

- [ ] Update API to support sorting
  ```typescript
  const orderBy = `${sortColumn} ${sortOrder.toUpperCase()}`;
  const query = `SELECT * FROM submissions ... ORDER BY ${orderBy}`;
  ```

**Add row actions menu**

- [ ] Create RowActions component
  ```tsx
  <RowActionsMenu>
    <MenuItem onClick={() => retryDelivery(row.id)}>Retry delivery</MenuItem>
    <MenuItem onClick={() => viewAuditLog(row.id)}>View audit log</MenuItem>
    <MenuItem onClick={() => copyToClipboard(row.id)}>Copy ID</MenuItem>
    <MenuItem onClick={() => downloadPdf(row.id)}>Download PDF</MenuItem>
  </RowActionsMenu>
  ```

- [ ] Implement row actions
  - [ ] Retry delivery (POST to `/api/admin/submissions/:id/retry`)
  - [ ] View audit log (modal or navigate to audit page)
  - [ ] Copy ID to clipboard
  - [ ] Download submission as PDF

### 4.3 Worker Metrics

**Add worker metrics endpoint**

- [ ] Enhance `/worker/metrics` endpoint
  ```typescript
  app.get("/worker/metrics", async (req, res) => {
    const { clientId, schoolId } = req.query;

    const queueCounts = await deliveryQueue.getJobCounts(
      'waiting', 'active', 'failed', 'delayed', 'completed'
    );

    const dbStats = await getDeliveryStats(clientId, schoolId);

    res.json({
      queue: queueCounts,
      database: dbStats,
      worker: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      }
    });
  });
  ```

**Add worker dashboard widget**

- [ ] Create WorkerStatus component for admin dashboard
  ```tsx
  <section className="admin-card">
    <h3>Worker Status</h3>
    <WorkerMetrics clientId={clientId} schoolId={schoolId} />
  </section>
  ```

- [ ] Display queue depth by status
  - Waiting, Active, Failed, Delayed

- [ ] Display delivery stats
  - Last hour, last 24h, last 7 days

- [ ] Add worker health indicator
  - Green: healthy, Yellow: slow, Red: down

**Acceptance Criteria:**
- [ ] Dashboard shows real-time alerts
- [ ] Date range picker works
- [ ] Metrics are clickable and drill-down to filtered views
- [ ] Bulk actions implemented in database view
- [ ] Sortable columns working
- [ ] Row actions menu functional
- [ ] Worker metrics visible in admin

---

## Phase 5: Deployment Infrastructure (Week 9-10)

### 5.1 Vercel Deployment Setup

**Create deployment scripts**

- [ ] Create `scripts/deploy-school.sh`
  ```bash
  #!/bin/bash
  SCHOOL_ID=$1
  SCHOOL_SLUG=$2
  CLIENT_ID=$3
  DOMAIN=$4

  vercel deploy \
    --prod \
    --cwd apps/web-landing \
    --env NEXT_PUBLIC_SCHOOL_ID="$SCHOOL_ID" \
    --env NEXT_PUBLIC_CLIENT_ID="$CLIENT_ID" \
    --env NEXT_PUBLIC_API_BASE_URL="$API_URL"

  vercel domains add "$DOMAIN" --project "landing-$SCHOOL_SLUG"
  ```

- [ ] Create `scripts/deploy-admin.sh`
  ```bash
  #!/bin/bash

  vercel deploy \
    --prod \
    --cwd apps/web-admin \
    --env NEXT_PUBLIC_API_BASE_URL="$API_URL"

  vercel domains add "admin.mycompany.com"
  ```

- [ ] Make scripts executable
  ```bash
  chmod +x scripts/deploy-*.sh
  ```

**Set up Vercel projects**

- [ ] Create Vercel organization (if not exists)

- [ ] Create Vercel project for admin
  - Project name: `lead-lander-admin`
  - Framework: Next.js
  - Root directory: `apps/web-admin`

- [ ] Configure admin environment variables in Vercel
  - `NEXT_PUBLIC_API_BASE_URL`
  - Production, Preview, Development

- [ ] Test admin deployment
  ```bash
  npm run deploy:admin
  ```

**Create deployment template for schools**

- [ ] Document school deployment process
  ```markdown
  # Deploying a New School

  1. Create school in database via Super Admin
  2. Run deployment script:
     ./scripts/deploy-school.sh \
       school_northwood \
       northwood-tech \
       client_acme \
       northwood.mycompany.com
  3. Verify deployment at URL
  4. Configure DNS CNAME if using custom domain
  ```

### 5.2 CI/CD Pipeline

**Create GitHub Actions workflows**

- [ ] Create `.github/workflows/deploy-admin.yml`
  ```yaml
  name: Deploy Admin

  on:
    push:
      branches: [main]
      paths:
        - 'apps/web-admin/**'
        - 'packages/**'

  jobs:
    deploy:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v3
        - uses: actions/setup-node@v3
        - run: npm install
        - run: npm --workspace apps/web-admin run build
        - uses: amondnet/vercel-action@v25
          with:
            vercel-token: ${{ secrets.VERCEL_TOKEN }}
            vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
            vercel-project-id: ${{ secrets.ADMIN_PROJECT_ID }}
  ```

- [ ] Create `.github/workflows/deploy-school.yml`
  ```yaml
  name: Deploy School

  on:
    workflow_dispatch:
      inputs:
        school_id:
          description: 'School ID'
          required: true
        client_id:
          description: 'Client ID'
          required: true
        domain:
          description: 'Domain'
          required: true

  jobs:
    deploy:
      # Similar to admin but with school-specific env vars
  ```

- [ ] Create `.github/workflows/api-worker.yml`
  ```yaml
  name: Deploy API & Worker

  on:
    push:
      branches: [main]
      paths:
        - 'apps/api/**'
        - 'apps/worker/**'

  jobs:
    build-and-push:
      # Build Docker images
      # Push to ECR
      # Update ECS task definitions
  ```

**Set up GitHub secrets**

- [ ] Add Vercel secrets
  - `VERCEL_TOKEN`
  - `VERCEL_ORG_ID`
  - `ADMIN_PROJECT_ID`

- [ ] Add AWS secrets (for API/Worker deployment)
  - `AWS_ACCESS_KEY_ID`
  - `AWS_SECRET_ACCESS_KEY`
  - `AWS_REGION`

### 5.3 Webhook for Auto-Deploy

**Create deployment webhook endpoint**

- [ ] Add endpoint to API
  ```typescript
  app.post("/api/admin/schools/:schoolId/deploy", async (req, res) => {
    const { schoolId } = req.params;
    const auth = res.locals.auth;

    // Check permissions
    const access = await requireSchoolAccess(auth, schoolId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    // Trigger GitHub Actions workflow
    await triggerSchoolDeployment(schoolId);

    return res.json({ status: 'deploying' });
  });
  ```

- [ ] Implement GitHub Actions trigger
  ```typescript
  async function triggerSchoolDeployment(schoolId: string) {
    const school = await getSchoolById(schoolId);

    const response = await fetch(
      'https://api.github.com/repos/owner/repo/actions/workflows/deploy-school.yml/dispatches',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: {
            school_id: school.id,
            client_id: school.client_id,
            domain: school.domain,
          }
        })
      }
    );

    return response.json();
  }
  ```

**Add deployment status tracking**

- [ ] Create deployment_log table (if not exists from Phase 2)

- [ ] Add deployment status to admin UI
  ```tsx
  <section className="admin-card">
    <h3>Deployment Status</h3>
    <DeploymentLog schoolId={schoolId} />
  </section>
  ```

- [ ] Show recent deployments
  - Timestamp, version, status, initiated by

- [ ] Add manual deploy button
  ```tsx
  <button onClick={triggerDeploy}>
    Deploy Changes
  </button>
  ```

**Acceptance Criteria:**
- [ ] Admin deployed to admin.mycompany.com
- [ ] School deployment script working
- [ ] CI/CD pipelines functional
- [ ] Config changes trigger redeployment
- [ ] Deployment status visible in admin

---

## Phase 6: Production Polish (Week 11-12)

### 6.1 Error Handling & User Feedback

**Add toast notifications**

- [ ] Install toast library
  ```bash
  npm install --workspace apps/web-landing sonner
  npm install --workspace apps/web-admin sonner
  ```

- [ ] Add Toaster to layouts
  ```tsx
  import { Toaster } from 'sonner';

  export default function RootLayout({ children }) {
    return (
      <html>
        <body>
          {children}
          <Toaster position="top-right" richColors />
        </body>
      </html>
    );
  }
  ```

- [ ] Use throughout apps
  ```tsx
  import { toast } from 'sonner';

  toast.success('Saved successfully!');
  toast.error('Failed to save changes');
  toast.loading('Submitting...');
  ```

**Add loading states**

- [ ] Create skeleton components
  ```tsx
  // apps/web-admin/components/skeletons/MetricsSkeleton.tsx
  export function MetricsSkeleton() {
    return (
      <div className="admin-kpi">
        {[1,2,3,4].map(i => (
          <div key={i} className="kpi skeleton">
            <div className="skeleton-text" />
            <div className="skeleton-number" />
          </div>
        ))}
      </div>
    );
  }
  ```

- [ ] Add loading states to all data fetching
  ```tsx
  {loading && <MetricsSkeleton />}
  {!loading && <MetricsDisplay />}
  ```

- [ ] Add Suspense boundaries
  ```tsx
  <Suspense fallback={<MetricsSkeleton />}>
    <MetricsAsync />
  </Suspense>
  ```

**Add error boundaries**

- [ ] Create ErrorBoundary component
  ```tsx
  'use client';

  export class ErrorBoundary extends React.Component {
    state = { hasError: false };

    static getDerivedStateFromError() {
      return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
      console.error('ErrorBoundary caught:', error, errorInfo);
    }

    render() {
      if (this.state.hasError) {
        return <ErrorFallback />;
      }
      return this.props.children;
    }
  }
  ```

- [ ] Wrap components with error boundaries

**Add empty states**

- [ ] Create EmptyState component
  ```tsx
  <EmptyState
    icon="📊"
    title="No submissions yet"
    description="New submissions will appear here"
    action={<button>Create Test Submission</button>}
  />
  ```

- [ ] Add to database view, metrics, etc.

### 6.2 SEO & Meta Tags

**Add metadata to landing pages**

- [ ] Implement generateMetadata
  ```tsx
  export async function generateMetadata({ params }): Promise<Metadata> {
    const { program } = await fetchProgramData(params.program);

    return {
      title: `${program.landingCopy.headline} | ${school.name}`,
      description: program.landingCopy.subheadline,
      keywords: [program.name, school.name, 'trade school', ...],
      openGraph: {
        title: program.landingCopy.headline,
        description: program.landingCopy.body,
        images: [program.heroImage || school.branding.logoUrl],
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title: program.landingCopy.headline,
        description: program.landingCopy.subheadline,
      },
      robots: {
        index: true,
        follow: true,
      },
    };
  }
  ```

**Add structured data**

- [ ] Add JSON-LD for educational programs
  ```tsx
  <script
    type="application/ld+json"
    dangerouslySetInnerHTML={{
      __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "EducationalOrganization",
        "name": school.name,
        "url": `https://${domain}`,
        "logo": school.branding.logoUrl,
        "offers": {
          "@type": "Offer",
          "category": "EducationalProgram",
          "name": program.name,
        }
      })
    }}
  />
  ```

**Add sitemap**

- [ ] Create dynamic sitemap
  ```tsx
  // apps/web-landing/app/sitemap.ts
  export default async function sitemap() {
    const programs = await getSchoolPrograms(SCHOOL_ID);

    return [
      {
        url: `https://${domain}`,
        lastModified: new Date(),
      },
      ...programs.map(p => ({
        url: `https://${domain}/${p.slug}`,
        lastModified: new Date(p.updated_at),
      }))
    ];
  }
  ```

**Add robots.txt**

- [ ] Create robots.txt
  ```tsx
  // apps/web-landing/app/robots.ts
  export default function robots() {
    return {
      rules: {
        userAgent: '*',
        allow: '/',
      },
      sitemap: `https://${domain}/sitemap.xml`,
    };
  }
  ```

### 6.3 Performance Optimization

**Image optimization**

- [ ] Replace all `<img>` with `<Image>`
  ```tsx
  import Image from 'next/image';

  <Image
    src={school.branding.logoUrl}
    alt={school.name}
    width={240}
    height={64}
    priority
  />
  ```

- [ ] Set up image CDN
  - [ ] Configure Next.js image optimization
  - [ ] Use CloudFront in front of S3 for uploaded images

**Code splitting**

- [ ] Use dynamic imports for heavy components
  ```tsx
  const FormEngine = dynamic(() => import('@/components/FormEngine'), {
    loading: () => <FormSkeleton />,
    ssr: false,
  });
  ```

- [ ] Split admin routes
  ```tsx
  const DatabaseView = dynamic(() => import('./DatabaseView'));
  const ConfigBuilder = dynamic(() => import('./ConfigBuilder'));
  ```

**Add caching with SWR**

- [ ] Install SWR
  ```bash
  npm install --workspace apps/web-admin swr
  ```

- [ ] Use SWR for admin data fetching
  ```tsx
  import useSWR from 'swr';

  function MetricsView() {
    const { data, error, isLoading } = useSWR(
      '/api/admin/schools/123/metrics',
      fetcher,
      { refreshInterval: 30000 }
    );

    if (isLoading) return <Skeleton />;
    if (error) return <Error />;
    return <Metrics data={data} />;
  }
  ```

**Bundle analysis**

- [ ] Install bundle analyzer
  ```bash
  npm install --workspace apps/web-admin @next/bundle-analyzer
  npm install --workspace apps/web-landing @next/bundle-analyzer
  ```

- [ ] Analyze and optimize bundles
  ```bash
  ANALYZE=true npm run build
  ```

### 6.4 Accessibility Audit

**Run automated tests**

- [ ] Install Playwright and axe
  ```bash
  npm install --save-dev @playwright/test @axe-core/playwright
  ```

- [ ] Create accessibility test suite
  ```typescript
  // tests/accessibility.spec.ts
  import { test, expect } from '@playwright/test';
  import AxeBuilder from '@axe-core/playwright';

  test('landing page accessibility', async ({ page }) => {
    await page.goto('/medical-assistant');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('admin dashboard accessibility', async ({ page }) => {
    // Login first
    await page.goto('/admin/login');
    // ... login flow
    await page.goto('/admin/dashboard');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
  ```

- [ ] Run tests and fix violations

**Manual accessibility checks**

- [ ] Test keyboard navigation
  - [ ] Tab through all interactive elements
  - [ ] Enter/Space activates buttons/links
  - [ ] Escape closes modals

- [ ] Test screen reader
  - [ ] Install NVDA or JAWS
  - [ ] Navigate through forms
  - [ ] Verify all content is announced
  - [ ] Verify error messages are announced

- [ ] Check color contrast
  - [ ] Use browser dev tools or online tool
  - [ ] Ensure all text meets WCAG AA (4.5:1 for normal text)

- [ ] Check focus indicators
  - [ ] All interactive elements have visible focus
  - [ ] Focus order is logical

**Accessibility checklist**

- [ ] All images have alt text
- [ ] All form inputs have labels
- [ ] All buttons have accessible names
- [ ] Color is not the only means of conveying information
- [ ] All content is keyboard accessible
- [ ] Focus order is logical
- [ ] Skip to main content link present
- [ ] ARIA attributes used correctly
- [ ] Error messages are clear and actionable
- [ ] Status messages announced to screen readers

### 6.5 Legal & Compliance

**Create legal pages**

- [ ] Create privacy policy page
  - Location: `apps/web-landing/app/privacy/page.tsx`
  - Content: Data collection, usage, sharing, cookies, user rights

- [ ] Create terms of service page
  - Location: `apps/web-landing/app/terms/page.tsx`
  - Content: Acceptable use, disclaimers, liability

- [ ] Create accessibility statement
  - Location: `apps/web-landing/app/accessibility/page.tsx`
  - Content: WCAG compliance level, contact info for issues

- [ ] Link to legal pages from footer

**Add cookie consent**

- [ ] Install react-cookie-consent
  ```bash
  npm install --workspace apps/web-landing react-cookie-consent
  ```

- [ ] Add cookie banner
  ```tsx
  import CookieConsent from 'react-cookie-consent';

  <CookieConsent
    location="bottom"
    buttonText="Accept"
    declineButtonText="Decline"
    enableDeclineButton
    onAccept={() => {
      // Enable analytics
    }}
  >
    We use cookies to improve your experience.
    <a href="/privacy">Learn more</a>
  </CookieConsent>
  ```

**Add GDPR compliance**

- [ ] Create data request form
  ```tsx
  // apps/web-landing/app/data-request/page.tsx
  <form onSubmit={handleDataRequest}>
    <label>
      Email
      <input type="email" name="email" required />
    </label>
    <label>
      Request Type
      <select name="type">
        <option value="export">Export my data</option>
        <option value="delete">Delete my data</option>
      </select>
    </label>
    <button type="submit">Submit Request</button>
  </form>
  ```

- [ ] Create API endpoint for data requests
  ```typescript
  app.post("/api/data-request", async (req, res) => {
    const { email, type } = req.body;

    // Create ticket
    const requestId = uuidv4();
    await pool.query(
      `INSERT INTO data_requests (id, email, type, status)
       VALUES ($1, $2, $3, 'pending')`,
      [requestId, email, type]
    );

    // Send confirmation email
    await sendDataRequestConfirmation(email, requestId, type);

    return res.json({
      message: "Request received. We'll respond within 30 days."
    });
  });
  ```

**Acceptance Criteria:**
- [ ] Toast notifications throughout apps
- [ ] Loading states for all async operations
- [ ] Error boundaries catching errors
- [ ] SEO metadata on all pages
- [ ] Performance metrics: LCP < 2.5s, FID < 100ms, CLS < 0.1
- [ ] Accessibility audit passes (0 violations)
- [ ] Legal pages published
- [ ] Cookie consent implemented
- [ ] GDPR data request flow working

---

## Phase 7: Monitoring & Operations (Week 13-14)

### 7.1 Application Monitoring

**Set up Sentry**

- [ ] Install Sentry SDKs
  ```bash
  npm install --workspace apps/web-landing @sentry/nextjs
  npm install --workspace apps/web-admin @sentry/nextjs
  npm install --workspace apps/api @sentry/node
  npm install --workspace apps/worker @sentry/node
  ```

- [ ] Configure Sentry for web-landing
  ```typescript
  // apps/web-landing/sentry.client.config.ts
  import * as Sentry from '@sentry/nextjs';

  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    beforeSend(event) {
      // Scrub PII
      if (event.request?.data) {
        delete event.request.data.email;
        delete event.request.data.phone;
      }
      return event;
    },
  });
  ```

- [ ] Configure Sentry for web-admin (similar)

- [ ] Configure Sentry for API
  ```typescript
  // apps/api/src/server.ts
  import * as Sentry from '@sentry/node';

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
  });

  app.use(Sentry.Handlers.requestHandler());
  // ... routes
  app.use(Sentry.Handlers.errorHandler());
  ```

- [ ] Configure Sentry for Worker (similar)

- [ ] Set up Sentry alerts
  - Alert on error rate > 1%
  - Alert on new error types
  - Alert on performance degradation

**Enhanced health checks**

- [ ] Create comprehensive health check
  ```typescript
  // apps/api/src/health.ts
  export async function performHealthCheck() {
    const checks = {
      database: await checkDatabase(),
      redis: await checkRedis(),
      worker: await checkWorker(),
    };

    const healthy = Object.values(checks).every(Boolean);

    return {
      healthy,
      checks,
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION || 'unknown',
    };
  }

  async function checkDatabase() {
    try {
      await pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async function checkRedis() {
    try {
      await deliveryQueue.client.ping();
      return true;
    } catch {
      return false;
    }
  }

  async function checkWorker() {
    try {
      const response = await fetch(`${WORKER_URL}/worker/healthz`);
      return response.ok;
    } catch {
      return false;
    }
  }
  ```

- [ ] Update `/healthz` endpoint to use comprehensive check

- [ ] Set up health check monitoring (Pingdom, UptimeRobot, etc.)

**Add application metrics**

- [ ] Install metrics library (optional)
  ```bash
  npm install --workspace apps/api prom-client
  ```

- [ ] Create metrics endpoint
  ```typescript
  import promClient from 'prom-client';

  const register = new promClient.Registry();

  const httpRequestDuration = new promClient.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    registers: [register],
  });

  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });
  ```

### 7.2 Admin Notifications

**Email alert system**

- [ ] Create alert checking service
  ```typescript
  // apps/worker/src/alerts.ts
  export async function checkAndSendAlerts() {
    const clients = await getAllClients();

    for (const client of clients) {
      await checkClientAlerts(client.id);
    }
  }

  async function checkClientAlerts(clientId: string) {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Check failure rate
    const stats = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'failed') as failed,
         COUNT(*) FILTER (WHERE status = 'delivered') as delivered
       FROM submissions
       WHERE client_id = $1 AND created_at >= $2`,
      [clientId, last24h]
    );

    const failureRate = stats.rows[0].failed /
      (stats.rows[0].failed + stats.rows[0].delivered);

    if (failureRate > 0.1) {
      await sendFailureRateAlert(clientId, failureRate);
    }

    // Check queue backlog
    const queueDepth = await getQueueDepthForClient(clientId);
    if (queueDepth > 100) {
      await sendQueueBacklogAlert(clientId, queueDepth);
    }
  }
  ```

- [ ] Implement alert email templates
  ```typescript
  async function sendFailureRateAlert(clientId: string, rate: number) {
    const admins = await getClientAdminEmails(clientId);

    await sendEmail({
      to: admins,
      subject: '⚠️ High Failure Rate Alert',
      html: `
        <h1>High Failure Rate Detected</h1>
        <p>${(rate * 100).toFixed(1)}% of leads failed in the last 24 hours.</p>
        <p><a href="${ADMIN_URL}/dashboard">View Dashboard</a></p>
      `,
    });
  }
  ```

- [ ] Set up cron job for alert checking
  ```typescript
  // Run every hour
  setInterval(checkAndSendAlerts, 60 * 60 * 1000);
  ```

**In-app notifications**

- [ ] Add notifications table
  ```sql
  CREATE TABLE notifications (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    client_id TEXT NOT NULL REFERENCES clients(id),
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    link TEXT,
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  ```

- [ ] Create notification API endpoints
  - [ ] `GET /api/admin/notifications` - List notifications
  - [ ] `POST /api/admin/notifications/:id/read` - Mark as read
  - [ ] `POST /api/admin/notifications/read-all` - Mark all as read

- [ ] Add notification bell to admin header
  ```tsx
  <NotificationBell
    count={unreadCount}
    notifications={notifications}
    onMarkRead={markAsRead}
  />
  ```

### 7.3 Documentation & Help

**Create contextual help**

- [ ] Build HelpTooltip component
  ```tsx
  export function HelpTooltip({ content }: { content: string }) {
    const [show, setShow] = useState(false);

    return (
      <div className="help-tooltip">
        <button
          onMouseEnter={() => setShow(true)}
          onMouseLeave={() => setShow(false)}
          aria-label="Help"
        >
          ?
        </button>
        {show && (
          <div className="help-tooltip-content">
            {content}
          </div>
        )}
      </div>
    );
  }
  ```

- [ ] Add tooltips to complex fields
  ```tsx
  <label>
    CRM Webhook URL
    <HelpTooltip content="The endpoint where lead data will be sent..." />
    <input {...} />
  </label>
  ```

**Create admin documentation**

- [ ] Create documentation site (or use GitHub Pages)
  - Getting Started
  - User Management
  - Config Builder Guide
  - Database View Guide
  - CRM Integration Guide
  - Troubleshooting

- [ ] Add link to docs in admin header
  ```tsx
  <header className="admin-header">
    <nav>...</nav>
    <div>
      <a href="https://docs.mycompany.com" target="_blank">
        📚 Documentation
      </a>
    </div>
  </header>
  ```

**Create onboarding flow**

- [ ] Build onboarding wizard for first login
  ```tsx
  export function OnboardingWizard() {
    return (
      <Modal open={isFirstLogin}>
        <Step1Welcome />
        <Step2UploadLogo />
        <Step3ConfigureCRM />
        <Step4CreateProgram />
        <Step5Complete />
      </Modal>
    );
  }
  ```

- [ ] Add interactive tour (optional)
  ```bash
  npm install --workspace apps/web-admin react-joyride
  ```

**Acceptance Criteria:**
- [ ] Sentry monitoring active for all apps
- [ ] Health checks comprehensive
- [ ] Email alerts working for critical issues
- [ ] In-app notifications implemented
- [ ] Documentation published
- [ ] Help tooltips added to complex UI
- [ ] Onboarding wizard for new users

---

## Phase 8: Launch Preparation (Week 15-16)

### 8.1 Security Audit

**Run security scanners**

- [ ] Run npm audit
  ```bash
  npm audit
  npm audit fix
  ```

- [ ] Run Snyk scan
  ```bash
  npx snyk test
  npx snyk code test
  ```

- [ ] Fix all high/critical vulnerabilities

**Security checklist**

- [ ] All API endpoints have authentication
- [ ] All queries filter by client_id/school_id
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (React escapes by default)
- [ ] CSRF protection (SameSite cookies)
- [ ] Rate limiting enabled
- [ ] Secrets in environment variables only
- [ ] HTTPS enforced everywhere
- [ ] Database connection uses SSL
- [ ] Redis connection uses TLS (if applicable)
- [ ] File uploads validated and sanitized
- [ ] Password reset tokens expire
- [ ] Session tokens expire
- [ ] No sensitive data logged
- [ ] Error messages don't reveal system info

**Penetration testing**

- [ ] Test authentication bypass attempts
- [ ] Test authorization bypass (accessing other tenants)
- [ ] Test SQL injection
- [ ] Test XSS
- [ ] Test CSRF
- [ ] Test file upload vulnerabilities
- [ ] Test rate limiting
- [ ] Test session fixation
- [ ] Document findings and remediate

### 8.2 Load Testing

**Install load testing tools**

- [ ] Install Artillery
  ```bash
  npm install --save-dev artillery
  ```

**Create load test scenarios**

- [ ] Create `artillery-config.yml`
  ```yaml
  config:
    target: 'https://api.mycompany.com'
    phases:
      - duration: 60
        arrivalRate: 10
        name: Warm up
      - duration: 300
        arrivalRate: 50
        name: Sustained load
      - duration: 60
        arrivalRate: 100
        name: Peak load

  scenarios:
    - name: "Submit lead"
      flow:
        - post:
            url: "/api/lead/start"
            json:
              firstName: "Load"
              lastName: "Test"
              email: "loadtest{{ $randomNumber() }}@example.com"
              phone: "{{ $randomNumber() }}"
              schoolId: "{{ $randomString() }}"
              campusId: "{{ $randomString() }}"
              programId: "{{ $randomString() }}"
              answers: {}
              consent:
                consented: true
                textVersion: "2026-01"
                timestamp: "{{ $timestamp() }}"
        - think: 3

    - name: "Admin dashboard"
      flow:
        - post:
            url: "/api/auth/login"
            json:
              email: "admin@example.com"
              password: "password"
        - get:
            url: "/api/admin/schools/{{ $randomString() }}/metrics"
  ```

**Run load tests**

- [ ] Run against staging environment
  ```bash
  npx artillery run artillery-config.yml --output report.json
  npx artillery report report.json
  ```

- [ ] Analyze results
  - [ ] p95 latency < 500ms
  - [ ] p99 latency < 1000ms
  - [ ] Error rate < 0.1%
  - [ ] Throughput > 500 req/min

- [ ] Identify and fix bottlenecks
  - [ ] Add database indexes if queries slow
  - [ ] Increase connection pool size if needed
  - [ ] Add caching if appropriate
  - [ ] Scale ECS tasks if CPU/memory high

### 8.3 Backup & Disaster Recovery

**Automate database backups**

- [ ] Create backup script
  ```bash
  #!/bin/bash
  # scripts/backup-db.sh

  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  BACKUP_FILE="backup_${TIMESTAMP}.sql"

  # Dump database
  pg_dump $DATABASE_URL > $BACKUP_FILE
  gzip $BACKUP_FILE

  # Upload to S3
  aws s3 cp ${BACKUP_FILE}.gz s3://mycompany-backups/db/

  # Keep only last 30 days
  aws s3 ls s3://mycompany-backups/db/ | \
    awk '{print $4}' | \
    sort -r | \
    tail -n +31 | \
    xargs -I {} aws s3 rm s3://mycompany-backups/db/{}

  echo "Backup complete: ${BACKUP_FILE}.gz"
  ```

- [ ] Make script executable
  ```bash
  chmod +x scripts/backup-db.sh
  ```

- [ ] Set up cron job
  ```cron
  # Run daily at 2 AM UTC
  0 2 * * * /path/to/scripts/backup-db.sh >> /var/log/backup.log 2>&1
  ```

- [ ] Or use AWS RDS automated backups
  - Enable automated backups in RDS console
  - Set retention period (7-35 days)
  - Enable point-in-time recovery

**Create disaster recovery plan**

- [ ] Document recovery procedures
  ```markdown
  # Disaster Recovery Plan

  ## Database Recovery

  1. Stop all services (API, Worker)
  2. Restore from backup:
     ```
     aws s3 cp s3://mycompany-backups/db/backup_YYYYMMDD.sql.gz .
     gunzip backup_YYYYMMDD.sql.gz
     psql $DATABASE_URL < backup_YYYYMMDD.sql
     ```
  3. Verify data integrity
  4. Restart services

  ## Full System Recovery

  1. Provision new infrastructure (Terraform/CloudFormation)
  2. Restore database from backup
  3. Deploy API and Worker from Docker images
  4. Deploy admin from Vercel (auto-deploy from main branch)
  5. Deploy schools from Vercel (run deployment scripts)
  6. Update DNS if needed
  7. Verify all systems operational

  ## Recovery Time Objective (RTO): 4 hours
  ## Recovery Point Objective (RPO): 24 hours
  ```

- [ ] Test recovery procedure
  - [ ] Restore backup to staging environment
  - [ ] Verify data integrity
  - [ ] Time the process
  - [ ] Document any issues

**Set up monitoring for backups**

- [ ] Alert if backup fails
- [ ] Alert if no backup in 24h
- [ ] Monitor backup file sizes

### 8.4 Create Runbook

**Document operational procedures**

- [ ] Create `docs/runbook.md`
  ```markdown
  # Operations Runbook

  ## Deployment

  ### Deploying Admin
  ```
  ./scripts/deploy-admin.sh
  ```

  ### Deploying a School
  ```
  ./scripts/deploy-school.sh <school_id> <school_slug> <client_id> <domain>
  ```

  ### Deploying API/Worker
  - Push to main branch
  - GitHub Actions builds and deploys automatically
  - Monitor CloudWatch logs for errors

  ## Monitoring

  ### Health Checks
  - API: https://api.mycompany.com/healthz
  - Worker: https://api.mycompany.com/worker/healthz
  - Admin: https://admin.mycompany.com

  ### Dashboards
  - Sentry: https://sentry.io/organizations/mycompany
  - CloudWatch: [link]
  - Vercel: https://vercel.com/mycompany

  ## Common Issues

  ### High Failure Rate
  1. Check CRM webhook is responding
  2. Check CRM credentials are valid
  3. Check network connectivity
  4. View failed submissions in admin
  5. Retry failed submissions

  ### Queue Backlog
  1. Check worker is running
  2. Check Redis connectivity
  3. Scale up worker tasks if needed
  4. Check for worker errors in logs

  ### Database Connection Errors
  1. Check RDS is running
  2. Check security groups allow connections
  3. Check connection pool settings
  4. Restart API/Worker if needed

  ## Escalation

  - Level 1: On-call engineer
  - Level 2: Lead developer
  - Level 3: CTO

  Contact: [emergency contact info]
  ```

**Create troubleshooting guide**

- [ ] Create `docs/troubleshooting.md`
  - Common error messages and solutions
  - How to read logs
  - How to access production systems
  - How to run SQL queries safely

### 8.5 Client Onboarding Documentation

**Create onboarding guide**

- [ ] Create `docs/client-onboarding.md`
  ```markdown
  # Client Onboarding Guide

  ## Prerequisites
  - Client information (name, contact, domain)
  - CRM webhook URL and credentials
  - School branding (logo, colors)
  - Program information

  ## Step 1: Create Client & School

  1. Login to super admin: https://admin.mycompany.com/super
  2. Click "Add Client"
  3. Fill in client information
  4. Click "Add School" under the client
  5. Upload school logo
  6. Configure school colors

  ## Step 2: Configure CRM

  1. Navigate to school config
  2. Click "CRM Connections" tab
  3. Add webhook URL
  4. Configure authentication
  5. Test connection

  ## Step 3: Create Programs

  1. Click "Programs" tab
  2. Click "Add Program"
  3. Fill in program information:
     - Name, slug
     - Landing copy
     - Program details
  4. Add testimonials (optional)
  5. Add FAQs (optional)
  6. Save

  ## Step 4: Create Campuses

  1. Click "Campuses" tab
  2. Add each campus
  3. Configure notification recipients

  ## Step 5: Deploy School

  1. Run deployment script:
     ```
     ./scripts/deploy-school.sh \
       <school_id> \
       <school_slug> \
       <client_id> \
       <domain>
     ```
  2. Wait for deployment to complete (2-3 minutes)
  3. Configure DNS CNAME (if custom domain)

  ## Step 6: Create Admin Users

  1. Navigate to Users section
  2. Click "Invite User"
  3. Enter email, select role
  4. Send invitation
  5. User receives email with temporary password

  ## Step 7: Testing

  1. Visit school landing page
  2. Submit test lead
  3. Verify delivery to CRM
  4. Check admin dashboard shows submission
  5. Verify email notification (if enabled)

  ## Step 8: Training

  - Schedule walkthrough call with client
  - Share documentation links
  - Answer questions
  - Set up support channel
  ```

**Create client training materials**

- [ ] Create admin user guide (PDF or video)
  - How to view dashboard
  - How to export submissions
  - How to manage users
  - How to update config

- [ ] Create FAQ document
  - How to add a new program
  - How to change school logo
  - How to update CRM settings
  - What to do if leads aren't delivering

### 8.6 Final Pre-Launch Checklist

**Infrastructure**

- [ ] SSL certificates valid and auto-renewing
- [ ] DNS configured correctly
- [ ] CDN caching configured
- [ ] Backups automated and tested
- [ ] Monitoring alerts configured
- [ ] Health checks passing

**Security**

- [ ] All vulnerabilities remediated
- [ ] Penetration testing complete
- [ ] Security headers configured
- [ ] Rate limiting tuned
- [ ] CORS configured correctly
- [ ] Secrets rotated to production values

**Performance**

- [ ] Load testing passed
- [ ] Page load times < 2s
- [ ] API response times < 200ms
- [ ] Database queries optimized
- [ ] Images optimized
- [ ] Bundle sizes reasonable

**Functionality**

- [ ] All features tested end-to-end
- [ ] Form submissions working
- [ ] CRM delivery working
- [ ] Email notifications working
- [ ] Admin dashboard functional
- [ ] CSV exports working
- [ ] User management working
- [ ] Config builder working

**Documentation**

- [ ] Runbook complete
- [ ] Troubleshooting guide complete
- [ ] Onboarding guide complete
- [ ] API documentation complete
- [ ] User guide complete

**Legal**

- [ ] Privacy policy published
- [ ] Terms of service published
- [ ] Cookie consent implemented
- [ ] GDPR compliance ready
- [ ] Data deletion process documented

**Support**

- [ ] Support email configured
- [ ] Ticketing system set up (optional)
- [ ] On-call schedule created
- [ ] Escalation path defined

**Acceptance Criteria:**
- [ ] All pre-launch checklist items complete
- [ ] Security audit passed
- [ ] Load testing passed
- [ ] Disaster recovery tested
- [ ] Documentation complete
- [ ] First client ready to onboard

---

## Post-Launch (Month 5+)

### Month 5-6: Iteration

- [ ] Gather client feedback
- [ ] Fix bugs reported by users
- [ ] Optimize based on analytics
- [ ] A/B test landing page variations
- [ ] Add Google Analytics or Mixpanel integration
- [ ] Implement feature requests from clients

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
- [ ] Student portal (track application status)

---

## Timeline Summary

| Phase | Duration | Key Milestones |
|-------|----------|----------------|
| 1. Security & Split | 2 weeks | Repository split, security fixes, API updates |
| 2. Core Functionality | 2 weeks | Config builder complete, draft system, admin views |
| 3. Landing & Form | 2 weeks | Enhanced landing pages, form validation, accessibility |
| 4. Admin Polish | 2 weeks | Real-time metrics, database enhancements, worker metrics |
| 5. Deployment Infra | 2 weeks | Per-school deployment, CI/CD, webhooks |
| 6. Production Polish | 2 weeks | Error handling, SEO, performance, legal compliance |
| 7. Monitoring & Ops | 2 weeks | Sentry, alerts, notifications, documentation |
| 8. Launch Prep | 2 weeks | Security audit, load testing, runbook, onboarding docs |

**Total: 16 weeks (4 months)**

---

## Success Metrics

### Technical
- [ ] Page load time < 2 seconds
- [ ] API response time < 200ms
- [ ] Error rate < 0.1%
- [ ] Uptime > 99.9%
- [ ] Form completion rate > 60%

### Business
- [ ] Client satisfaction > 4.5/5
- [ ] Lead delivery success rate > 95%
- [ ] Time to onboard new client < 1 day
- [ ] Support ticket resolution time < 24h

### Security
- [ ] Zero security incidents
- [ ] No high/critical vulnerabilities
- [ ] GDPR compliance maintained
