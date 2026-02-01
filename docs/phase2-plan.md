# Phase 2 Implementation Plan

Branch: `phase2`

## Overview

Phase 2 focuses on building the **Config Builder** - a comprehensive admin interface for managing landing pages and form flows without touching code or YAML files.

**Part 1: Landing Page Builder** (Start here)
**Part 2: Custom Quiz/Form Builder** (Later in phase 2)

---

## Part 1: Landing Page Builder (Weeks 1-2)

### Goals
- Full visual control over landing page content
- **Landing page template selection** (Minimal vs Full-featured)
- Access restricted to super_admin and client_admin only
- Live preview as you edit
- Draft/approval workflow for changes
- Auto-deployment on approval

### Key Design Decisions
- **Template Choice**: Admins can choose "Minimal" (hero + embedded form) or "Full" (all sections) layout
- **Contact Info First**: Landing page collects name/email/phone BEFORE quiz starts
- **Quiz Entry**: After contact submission, user proceeds to quiz/routing questions

---

## Task Breakdown

### Task 1: Access Control & Routing

**Backend:**
- [ ] Add permission check middleware for config builder
  ```typescript
  // apps/api/src/middleware/configAccess.ts
  export function requireConfigAccess(req, res, next) {
    const auth = res.locals.auth;
    const canEdit = auth?.roles.some(r =>
      r.role === 'super_admin' || r.role === 'client_admin'
    );
    if (!canEdit) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  }
  ```
- [ ] Apply middleware to all config endpoints

**Frontend:**
- [ ] Hide config builder nav items for school_admin/staff
  ```typescript
  // apps/web-admin/components/Sidebar.tsx
  const canEditConfig = user.roles.some(r =>
    r.role === 'super_admin' || r.role === 'client_admin'
  );
  ```
- [ ] Create route: `/admin/schools/[schoolId]/config`
- [ ] Add "Config Builder" menu item (visible to super/client admins only)

**Estimated Time:** 2-3 hours

---

### Task 2: Database Schema for Enhanced Landing Pages

Create migration to support rich landing page content.

```sql
-- Migration 013: Enhanced landing pages
-- File: migrations/013_landing_page_builder.sql

-- Add rich content fields to programs table
ALTER TABLE programs ADD COLUMN hero_image TEXT;
ALTER TABLE programs ADD COLUMN hero_background_color TEXT;
ALTER TABLE programs ADD COLUMN hero_background_image TEXT;
ALTER TABLE programs ADD COLUMN duration TEXT;
ALTER TABLE programs ADD COLUMN salary_range TEXT;
ALTER TABLE programs ADD COLUMN placement_rate TEXT;
ALTER TABLE programs ADD COLUMN graduation_rate TEXT;

-- Rich content arrays
ALTER TABLE programs ADD COLUMN highlights JSONB DEFAULT '[]';
-- Structure: [{ icon: string, text: string }]

ALTER TABLE programs ADD COLUMN testimonials JSONB DEFAULT '[]';
-- Structure: [{ quote: string, author: string, role: string, photo: string }]

ALTER TABLE programs ADD COLUMN faqs JSONB DEFAULT '[]';
-- Structure: [{ question: string, answer: string }]

ALTER TABLE programs ADD COLUMN stats JSONB DEFAULT '{}';
-- Structure: { placementRate: string, avgSalary: string, duration: string }

-- Section visibility/ordering
ALTER TABLE programs ADD COLUMN sections_config JSONB DEFAULT '{}';
-- Structure: {
--   order: ['hero', 'highlights', 'stats', 'testimonials', 'faqs', 'form'],
--   visible: { hero: true, highlights: true, ... }
-- }

-- Footer content
ALTER TABLE schools ADD COLUMN footer_content JSONB DEFAULT '{}';
-- Structure: {
--   socialLinks: { facebook: '', twitter: '', linkedin: '' },
--   customLinks: [{ label: '', url: '' }]
-- }

-- Create indexes
CREATE INDEX idx_programs_client_school ON programs(client_id, school_id);
```

**Tasks:**
- [ ] Create migration file
- [ ] Run migration in development
- [ ] Update TypeScript types in `packages/config-schema`

**Estimated Time:** 1-2 hours

---

### Task 3: TypeScript Type Updates

Update types to match new schema.

```typescript
// packages/config-schema/src/types.ts

export type ProgramHighlight = {
  icon?: string;
  text: string;
};

export type ProgramTestimonial = {
  quote: string;
  author: string;
  role?: string;
  photo?: string;
};

export type ProgramFAQ = {
  question: string;
  answer: string;
};

export type ProgramStats = {
  placementRate?: string;
  avgSalary?: string;
  duration?: string;
  graduationRate?: string;
};

export type SectionsConfig = {
  order: string[];
  visible: Record<string, boolean>;
};

export type Program = {
  // ... existing fields
  heroImage?: string;
  heroBackgroundColor?: string;
  heroBackgroundImage?: string;
  duration?: string;
  salaryRange?: string;
  placementRate?: string;
  graduationRate?: string;
  highlights: ProgramHighlight[];
  testimonials: ProgramTestimonial[];
  faqs: ProgramFAQ[];
  stats: ProgramStats;
  sectionsConfig: SectionsConfig;
};

export type SchoolFooter = {
  socialLinks?: {
    facebook?: string;
    twitter?: string;
    linkedin?: string;
    instagram?: string;
  };
  customLinks?: Array<{
    label: string;
    url: string;
  }>;
};

export type School = {
  // ... existing fields
  footerContent: SchoolFooter;
};
```

**Tasks:**
- [ ] Update type definitions
- [ ] Export new types
- [ ] Update config loader to handle new fields

**Estimated Time:** 1 hour

---

### Task 4: Config Builder API Endpoints

Create endpoints for managing landing page config.

```typescript
// apps/api/src/server.ts

// Get current config for editing
app.get('/api/admin/schools/:schoolId/config/landing/:programId',
  requireSchoolAccess,
  requireConfigAccess,
  async (req, res) => {
    const { schoolId } = req.params;
    const { programId } = req.params;
    const school = res.locals.school;

    // Fetch program with all landing page config
    const result = await pool.query(`
      SELECT id, name, slug, landing_copy,
             hero_image, hero_background_color, hero_background_image,
             duration, salary_range, placement_rate, graduation_rate,
             highlights, testimonials, faqs, stats, sections_config
      FROM programs
      WHERE id = $1 AND client_id = $2 AND school_id = $3
    `, [programId, school.client_id, schoolId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Program not found' });
    }

    return res.json({ program: result.rows[0] });
  }
);

// Update landing page config (creates draft)
app.put('/api/admin/schools/:schoolId/config/landing/:programId',
  requireSchoolAccess,
  requireConfigAccess,
  async (req, res) => {
    const { schoolId, programId } = req.params;
    const school = res.locals.school;
    const auth = res.locals.auth;

    const {
      landingCopy,
      heroImage,
      heroBackgroundColor,
      heroBackgroundImage,
      highlights,
      testimonials,
      faqs,
      stats,
      sectionsConfig
    } = req.body;

    // Create draft in config_versions
    const draftId = uuidv4();
    await pool.query(`
      INSERT INTO config_versions
        (id, client_id, school_id, entity_type, entity_id, payload, created_by, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      draftId,
      school.client_id,
      schoolId,
      'program_landing',
      programId,
      {
        landingCopy,
        heroImage,
        heroBackgroundColor,
        heroBackgroundImage,
        highlights,
        testimonials,
        faqs,
        stats,
        sectionsConfig
      },
      auth.user.id,
      'draft'
    ]);

    return res.json({ draftId, status: 'draft' });
  }
);

// Submit draft for approval
app.post('/api/admin/schools/:schoolId/config/drafts/:draftId/submit',
  requireSchoolAccess,
  requireConfigAccess,
  async (req, res) => {
    const { draftId } = req.params;
    const school = res.locals.school;

    await pool.query(`
      UPDATE config_versions
      SET status = 'pending_approval', updated_at = NOW()
      WHERE id = $1 AND client_id = $2
    `, [draftId, school.client_id]);

    return res.json({ status: 'pending_approval' });
  }
);

// Approve draft (client_admin or super_admin only)
app.post('/api/admin/schools/:schoolId/config/drafts/:draftId/approve',
  requireSchoolAccess,
  requireConfigAccess,
  async (req, res) => {
    const { draftId } = req.params;
    const school = res.locals.school;
    const auth = res.locals.auth;

    // Check if user can approve
    const canApprove = auth.roles.some(r =>
      r.role === 'super_admin' || r.role === 'client_admin'
    );
    if (!canApprove) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Get draft
    const draftResult = await pool.query(`
      SELECT entity_type, entity_id, payload
      FROM config_versions
      WHERE id = $1 AND client_id = $2
    `, [draftId, school.client_id]);

    if (draftResult.rows.length === 0) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    const draft = draftResult.rows[0];

    // Apply changes to programs table
    if (draft.entity_type === 'program_landing') {
      const payload = draft.payload;
      await pool.query(`
        UPDATE programs
        SET landing_copy = $1,
            hero_image = $2,
            hero_background_color = $3,
            hero_background_image = $4,
            highlights = $5,
            testimonials = $6,
            faqs = $7,
            stats = $8,
            sections_config = $9,
            updated_at = NOW()
        WHERE id = $10 AND client_id = $11
      `, [
        payload.landingCopy,
        payload.heroImage,
        payload.heroBackgroundColor,
        payload.heroBackgroundImage,
        payload.highlights,
        payload.testimonials,
        payload.faqs,
        payload.stats,
        payload.sectionsConfig,
        draft.entity_id,
        school.client_id
      ]);
    }

    // Mark draft as approved
    await pool.query(`
      UPDATE config_versions
      SET status = 'approved', approved_by = $1, approved_at = NOW()
      WHERE id = $2
    `, [auth.user.id, draftId]);

    // TODO Phase 2: Trigger school redeployment
    // await triggerSchoolRedeployment(school.id);

    return res.json({ status: 'approved' });
  }
);

// List drafts for school
app.get('/api/admin/schools/:schoolId/config/drafts',
  requireSchoolAccess,
  requireConfigAccess,
  async (req, res) => {
    const school = res.locals.school;

    const result = await pool.query(`
      SELECT id, entity_type, entity_id, status, created_by, created_at, updated_at
      FROM config_versions
      WHERE client_id = $1 AND school_id = $2
      ORDER BY created_at DESC
      LIMIT 50
    `, [school.client_id, school.id]);

    return res.json({ drafts: result.rows });
  }
);
```

**Tasks:**
- [ ] Create `requireConfigAccess` middleware
- [ ] Implement GET endpoint for program landing config
- [ ] Implement PUT endpoint for creating drafts
- [ ] Implement POST endpoints for draft submission/approval
- [ ] Implement GET endpoint for listing drafts
- [ ] Add audit logging for all config changes

**Estimated Time:** 4-5 hours

---

### Task 5: Config Builder UI Foundation

Create the config builder page structure.

```typescript
// apps/web-admin/app/admin/schools/[schoolId]/config/page.tsx

'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function ConfigBuilderPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const [programs, setPrograms] = useState([]);
  const [selectedProgram, setSelectedProgram] = useState(null);

  useEffect(() => {
    // Fetch programs for school
    fetch(`/api/admin/schools/${schoolId}/programs`)
      .then(res => res.json())
      .then(data => setPrograms(data.programs));
  }, [schoolId]);

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Config Builder</h1>

      <Tabs defaultValue="landing">
        <TabsList>
          <TabsTrigger value="landing">Landing Pages</TabsTrigger>
          <TabsTrigger value="school">School Settings</TabsTrigger>
          <TabsTrigger value="forms">Forms & Quiz</TabsTrigger>
          <TabsTrigger value="drafts">Drafts & Approvals</TabsTrigger>
        </TabsList>

        <TabsContent value="landing">
          <LandingPageBuilder
            schoolId={schoolId}
            programs={programs}
          />
        </TabsContent>

        <TabsContent value="school">
          <SchoolSettingsEditor schoolId={schoolId} />
        </TabsContent>

        <TabsContent value="forms">
          <div className="p-8 text-center text-gray-500">
            Form builder coming soon...
          </div>
        </TabsContent>

        <TabsContent value="drafts">
          <DraftsManager schoolId={schoolId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

**Tasks:**
- [ ] Create config builder route
- [ ] Create tab navigation structure
- [ ] Add permission check (redirect if not super/client admin)
- [ ] Create placeholder components for each tab

**Estimated Time:** 2 hours

---

### Task 6: Landing Page Builder Component

Create the main landing page editing interface.

**Structure:**
```
LandingPageBuilder
├── ProgramSelector (dropdown)
├── EditorPanel (left side)
│   ├── HeroSectionEditor
│   ├── HighlightsEditor
│   ├── TestimonialsEditor
│   ├── FAQsEditor
│   ├── StatsEditor
│   └── SectionsOrderEditor
└── PreviewPanel (right side, iframe)
```

**Implementation:**
```typescript
// apps/web-admin/components/config-builder/LandingPageBuilder.tsx

export function LandingPageBuilder({ schoolId, programs }) {
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [config, setConfig] = useState(null);
  const [isDirty, setIsDirty] = useState(false);

  const loadProgramConfig = async (programId) => {
    const res = await fetch(
      `/api/admin/schools/${schoolId}/config/landing/${programId}`
    );
    const data = await res.json();
    setConfig(data.program);
  };

  const saveDraft = async () => {
    const res = await fetch(
      `/api/admin/schools/${schoolId}/config/landing/${selectedProgram.id}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      }
    );
    const data = await res.json();
    toast.success('Draft saved!');
    setIsDirty(false);
  };

  return (
    <div className="grid grid-cols-2 gap-6 h-full">
      {/* Editor Panel */}
      <div className="space-y-6 overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 pb-4">
          <ProgramSelector
            programs={programs}
            selected={selectedProgram}
            onChange={(p) => {
              setSelectedProgram(p);
              loadProgramConfig(p.id);
            }}
          />

          {isDirty && (
            <div className="mt-4 flex gap-2">
              <Button onClick={saveDraft}>Save Draft</Button>
              <Button variant="outline" onClick={() => loadProgramConfig(selectedProgram.id)}>
                Discard Changes
              </Button>
            </div>
          )}
        </div>

        {config && (
          <>
            <HeroSectionEditor
              value={config.landingCopy}
              heroImage={config.heroImage}
              bgColor={config.heroBackgroundColor}
              bgImage={config.heroBackgroundImage}
              onChange={(updates) => {
                setConfig({ ...config, ...updates });
                setIsDirty(true);
              }}
            />

            <HighlightsEditor
              value={config.highlights || []}
              onChange={(highlights) => {
                setConfig({ ...config, highlights });
                setIsDirty(true);
              }}
            />

            <TestimonialsEditor
              value={config.testimonials || []}
              onChange={(testimonials) => {
                setConfig({ ...config, testimonials });
                setIsDirty(true);
              }}
            />

            <FAQsEditor
              value={config.faqs || []}
              onChange={(faqs) => {
                setConfig({ ...config, faqs });
                setIsDirty(true);
              }}
            />

            <StatsEditor
              value={config.stats || {}}
              onChange={(stats) => {
                setConfig({ ...config, stats });
                setIsDirty(true);
              }}
            />

            <SectionsOrderEditor
              value={config.sectionsConfig || { order: [], visible: {} }}
              onChange={(sectionsConfig) => {
                setConfig({ ...config, sectionsConfig });
                setIsDirty(true);
              }}
            />
          </>
        )}
      </div>

      {/* Preview Panel */}
      <div className="sticky top-0 h-[calc(100vh-200px)]">
        <PreviewPanel
          schoolId={schoolId}
          programId={selectedProgram?.id}
          config={config}
        />
      </div>
    </div>
  );
}
```

**Tasks:**
- [ ] Create LandingPageBuilder component
- [ ] Create ProgramSelector dropdown
- [ ] Implement save/discard functionality
- [ ] Add dirty state tracking
- [ ] Create editor component structure

**Estimated Time:** 3-4 hours

---

### Task 7: Individual Editor Components

Build each section editor.

**A. Hero Section Editor**
```typescript
export function HeroSectionEditor({ value, heroImage, bgColor, bgImage, onChange }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Hero Section</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Headline</Label>
          <Input
            value={value?.headline || ''}
            onChange={(e) => onChange({
              landingCopy: { ...value, headline: e.target.value }
            })}
          />
        </div>

        <div>
          <Label>Subheadline</Label>
          <Textarea
            value={value?.subheadline || ''}
            onChange={(e) => onChange({
              landingCopy: { ...value, subheadline: e.target.value }
            })}
          />
        </div>

        <div>
          <Label>Body Text</Label>
          <Textarea
            rows={5}
            value={value?.body || ''}
            onChange={(e) => onChange({
              landingCopy: { ...value, body: e.target.value }
            })}
          />
        </div>

        <div>
          <Label>CTA Button Text</Label>
          <Input
            value={value?.ctaText || ''}
            onChange={(e) => onChange({
              landingCopy: { ...value, ctaText: e.target.value }
            })}
          />
        </div>

        <div>
          <Label>Hero Image URL</Label>
          <Input
            value={heroImage || ''}
            onChange={(e) => onChange({ heroImage: e.target.value })}
            placeholder="https://..."
          />
          {/* TODO: Add image upload */}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Background Color</Label>
            <Input
              type="color"
              value={bgColor || '#ffffff'}
              onChange={(e) => onChange({ heroBackgroundColor: e.target.value })}
            />
          </div>
          <div>
            <Label>Background Image URL</Label>
            <Input
              value={bgImage || ''}
              onChange={(e) => onChange({ heroBackgroundImage: e.target.value })}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

**B. Highlights Editor**
```typescript
export function HighlightsEditor({ value, onChange }) {
  const addHighlight = () => {
    onChange([...value, { icon: '', text: '' }]);
  };

  const updateHighlight = (index, updates) => {
    const newHighlights = [...value];
    newHighlights[index] = { ...newHighlights[index], ...updates };
    onChange(newHighlights);
  };

  const removeHighlight = (index) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Highlights / Benefits</CardTitle>
        <CardDescription>
          Key selling points for this program
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {value.map((highlight, index) => (
          <div key={index} className="flex gap-2 items-start">
            <Input
              placeholder="Icon (emoji or URL)"
              value={highlight.icon}
              onChange={(e) => updateHighlight(index, { icon: e.target.value })}
              className="w-24"
            />
            <Input
              placeholder="Highlight text"
              value={highlight.text}
              onChange={(e) => updateHighlight(index, { text: e.target.value })}
              className="flex-1"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeHighlight(index)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}

        <Button onClick={addHighlight} variant="outline" size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Add Highlight
        </Button>
      </CardContent>
    </Card>
  );
}
```

**C. Testimonials Editor**
```typescript
export function TestimonialsEditor({ value, onChange }) {
  // Similar structure to HighlightsEditor
  // Fields: quote, author, role, photo
}
```

**D. FAQs Editor**
```typescript
export function FAQsEditor({ value, onChange }) {
  // Similar structure to HighlightsEditor
  // Fields: question, answer
}
```

**E. Stats Editor**
```typescript
export function StatsEditor({ value, onChange }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Program Stats</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4">
        <div>
          <Label>Placement Rate</Label>
          <Input
            value={value.placementRate || ''}
            onChange={(e) => onChange({ ...value, placementRate: e.target.value })}
            placeholder="e.g., 95%"
          />
        </div>
        <div>
          <Label>Average Salary</Label>
          <Input
            value={value.avgSalary || ''}
            onChange={(e) => onChange({ ...value, avgSalary: e.target.value })}
            placeholder="e.g., $65,000"
          />
        </div>
        <div>
          <Label>Duration</Label>
          <Input
            value={value.duration || ''}
            onChange={(e) => onChange({ ...value, duration: e.target.value })}
            placeholder="e.g., 18 months"
          />
        </div>
        <div>
          <Label>Graduation Rate</Label>
          <Input
            value={value.graduationRate || ''}
            onChange={(e) => onChange({ ...value, graduationRate: e.target.value })}
            placeholder="e.g., 92%"
          />
        </div>
      </CardContent>
    </Card>
  );
}
```

**Tasks:**
- [ ] Create HeroSectionEditor
- [ ] Create HighlightsEditor
- [ ] Create TestimonialsEditor
- [ ] Create FAQsEditor
- [ ] Create StatsEditor
- [ ] Create SectionsOrderEditor (drag-drop for section ordering)

**Estimated Time:** 6-8 hours

---

### Task 8: Preview Panel

Create live preview of landing page.

```typescript
// apps/web-admin/components/config-builder/PreviewPanel.tsx

export function PreviewPanel({ schoolId, programId, config }) {
  const [previewMode, setPreviewMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const previewUrl = `/api/admin/schools/${schoolId}/config/preview/${programId}`;

  return (
    <div className="flex flex-col h-full border rounded-lg bg-gray-50">
      {/* Preview Controls */}
      <div className="flex items-center justify-between p-4 border-b bg-white">
        <h3 className="font-semibold">Live Preview</h3>
        <div className="flex gap-2">
          <Button
            variant={previewMode === 'desktop' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPreviewMode('desktop')}
          >
            <Monitor className="w-4 h-4" />
          </Button>
          <Button
            variant={previewMode === 'tablet' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPreviewMode('tablet')}
          >
            <Tablet className="w-4 h-4" />
          </Button>
          <Button
            variant={previewMode === 'mobile' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPreviewMode('mobile')}
          >
            <Smartphone className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Preview Frame */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div
          className={cn(
            'bg-white shadow-lg transition-all',
            previewMode === 'desktop' && 'w-full h-full',
            previewMode === 'tablet' && 'w-3/4 h-full',
            previewMode === 'mobile' && 'w-96 h-full'
          )}
        >
          {programId ? (
            <iframe
              src={previewUrl}
              className="w-full h-full border-0"
              title="Landing Page Preview"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              Select a program to preview
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

**Preview Endpoint:**
```typescript
// apps/api/src/server.ts

app.get('/api/admin/schools/:schoolId/config/preview/:programId',
  requireSchoolAccess,
  requireConfigAccess,
  async (req, res) => {
    // Return HTML that renders the landing page with current draft config
    // This would use the same landing page components but with draft data

    // For MVP, can redirect to actual landing page
    // Later, render with draft config inline

    const { schoolId, programId } = req.params;
    res.redirect(`${process.env.LANDING_PAGE_URL}/${programSlug}?preview=true`);
  }
);
```

**Tasks:**
- [ ] Create PreviewPanel component
- [ ] Add device size toggles (desktop/tablet/mobile)
- [ ] Create preview endpoint (can start simple with redirect)
- [ ] Later: Render preview with draft config inline

**Estimated Time:** 3-4 hours

---

### Task 9: Drafts & Approvals Manager

Create UI for managing drafts.

```typescript
// apps/web-admin/components/config-builder/DraftsManager.tsx

export function DraftsManager({ schoolId }) {
  const [drafts, setDrafts] = useState([]);

  useEffect(() => {
    fetch(`/api/admin/schools/${schoolId}/config/drafts`)
      .then(res => res.json())
      .then(data => setDrafts(data.drafts));
  }, [schoolId]);

  const submitForApproval = async (draftId) => {
    await fetch(
      `/api/admin/schools/${schoolId}/config/drafts/${draftId}/submit`,
      { method: 'POST' }
    );
    toast.success('Draft submitted for approval');
    // Reload drafts
  };

  const approveDraft = async (draftId) => {
    await fetch(
      `/api/admin/schools/${schoolId}/config/drafts/${draftId}/approve`,
      { method: 'POST' }
    );
    toast.success('Draft approved! Deployment triggered.');
    // Reload drafts
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Drafts & Approvals</h2>
      </div>

      <div className="grid gap-4">
        {drafts.map(draft => (
          <Card key={draft.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle>{draft.entity_type}</CardTitle>
                  <CardDescription>
                    Created {new Date(draft.created_at).toLocaleDateString()}
                  </CardDescription>
                </div>
                <Badge variant={
                  draft.status === 'draft' ? 'secondary' :
                  draft.status === 'pending_approval' ? 'default' :
                  draft.status === 'approved' ? 'success' : 'destructive'
                }>
                  {draft.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                {draft.status === 'draft' && (
                  <Button onClick={() => submitForApproval(draft.id)}>
                    Submit for Approval
                  </Button>
                )}
                {draft.status === 'pending_approval' && (
                  <>
                    <Button onClick={() => approveDraft(draft.id)}>
                      Approve
                    </Button>
                    <Button variant="outline">
                      Reject
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

**Tasks:**
- [ ] Create DraftsManager component
- [ ] Display list of drafts with status
- [ ] Add submit for approval button
- [ ] Add approve/reject buttons (for client_admin/super_admin)
- [ ] Show approval status badges

**Estimated Time:** 3-4 hours

---

### Task 10: Update Landing Page to Use New Fields

Update the landing page to render the new rich content.

```typescript
// apps/web-landing/app/[program]/page.tsx

export default async function ProgramPage({ params }) {
  const { program } = params;

  // Fetch landing page data (now includes highlights, testimonials, FAQs, etc.)
  const data = await fetch(`${API_URL}/api/public/school/${SCHOOL_ID}/landing/${program}`);
  const { landing } = await data.json();

  return (
    <div className="min-h-screen">
      <HeroSection
        headline={landing.program.landingCopy.headline}
        subheadline={landing.program.landingCopy.subheadline}
        body={landing.program.landingCopy.body}
        ctaText={landing.program.landingCopy.ctaText}
        heroImage={landing.program.heroImage}
        bgColor={landing.program.heroBackgroundColor}
        bgImage={landing.program.heroBackgroundImage}
      />

      {landing.program.highlights?.length > 0 && (
        <HighlightsSection highlights={landing.program.highlights} />
      )}

      {landing.program.stats && (
        <StatsSection stats={landing.program.stats} />
      )}

      {landing.program.testimonials?.length > 0 && (
        <TestimonialsSection testimonials={landing.program.testimonials} />
      )}

      <FormSection
        schoolId={SCHOOL_ID}
        programId={landing.program.id}
        campuses={landing.campuses}
      />

      {landing.program.faqs?.length > 0 && (
        <FAQSection faqs={landing.program.faqs} />
      )}

      <Footer school={landing.school} />
    </div>
  );
}
```

**New Components to Create:**
```typescript
// apps/web-landing/components/HighlightsSection.tsx
export function HighlightsSection({ highlights }) {
  return (
    <section className="py-16 px-4">
      <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-8">
        {highlights.map((highlight, i) => (
          <div key={i} className="text-center">
            {highlight.icon && (
              <div className="text-4xl mb-4">{highlight.icon}</div>
            )}
            <p className="text-lg">{highlight.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// apps/web-landing/components/TestimonialsSection.tsx
export function TestimonialsSection({ testimonials }) {
  return (
    <section className="py-16 px-4 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-12">
          What Our Students Say
        </h2>
        <div className="grid md:grid-cols-2 gap-8">
          {testimonials.map((testimonial, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <p className="text-lg italic mb-4">"{testimonial.quote}"</p>
                <div className="flex items-center gap-3">
                  {testimonial.photo && (
                    <img
                      src={testimonial.photo}
                      alt={testimonial.author}
                      className="w-12 h-12 rounded-full"
                    />
                  )}
                  <div>
                    <p className="font-semibold">{testimonial.author}</p>
                    {testimonial.role && (
                      <p className="text-sm text-gray-600">{testimonial.role}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

// apps/web-landing/components/FAQSection.tsx
export function FAQSection({ faqs }) {
  return (
    <section className="py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-12">
          Frequently Asked Questions
        </h2>
        <Accordion type="single" collapsible>
          {faqs.map((faq, i) => (
            <AccordionItem key={i} value={`item-${i}`}>
              <AccordionTrigger>{faq.question}</AccordionTrigger>
              <AccordionContent>{faq.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

// apps/web-landing/components/StatsSection.tsx
export function StatsSection({ stats }) {
  const statItems = [
    { label: 'Placement Rate', value: stats.placementRate },
    { label: 'Average Salary', value: stats.avgSalary },
    { label: 'Program Duration', value: stats.duration },
    { label: 'Graduation Rate', value: stats.graduationRate },
  ].filter(item => item.value);

  if (statItems.length === 0) return null;

  return (
    <section className="py-16 px-4 bg-blue-50">
      <div className="max-w-6xl mx-auto grid md:grid-cols-4 gap-8 text-center">
        {statItems.map((stat, i) => (
          <div key={i}>
            <div className="text-4xl font-bold text-blue-600 mb-2">
              {stat.value}
            </div>
            <div className="text-gray-600">{stat.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

**Tasks:**
- [ ] Update ProgramPage to fetch new fields
- [ ] Create HighlightsSection component
- [ ] Create TestimonialsSection component
- [ ] Create FAQSection component
- [ ] Create StatsSection component
- [ ] Update HeroSection to use new fields
- [ ] Test rendering with sample data

**Estimated Time:** 4-5 hours

---

## Part 1 Summary

**Total Estimated Time:** 30-40 hours (1.5-2 weeks)

**What You'll Have:**
- ✅ Config builder accessible only to super_admin and client_admin
- ✅ Full visual editor for landing pages
- ✅ Hero, highlights, testimonials, FAQs, stats sections
- ✅ Live preview panel
- ✅ Draft/approval workflow
- ✅ Landing pages render rich content

**Ready for Part 2:**
- Form/quiz builder with conditional logic
- Point-based program recommendation
- Custom routing rules

---

## Next Steps

1. **Review this plan** - Any changes needed?
2. **Create tasks** - Should I create task tracking for these items?
3. **Start with Task 1** - Access control & routing
4. **Iterate** - Build, test, refine each component

Let me know if this looks good and I'll start with Task 1!
