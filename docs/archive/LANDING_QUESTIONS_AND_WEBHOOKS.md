# Landing Page Questions and Progressive Submission System

## Overview

This implementation adds a complete landing page questions system with progressive submission tracking and real-time webhook integration for CRM systems. The system captures lead data immediately on landing page submission and progressively enriches it as users complete quiz stages.

## Architecture

### Data Flow

```
1. User visits landing page
   ↓
2. Submits landing page form (first/last/email/phone + custom questions)
   ↓
3. Submission created in database → webhook: submission_created
   ↓
4. User starts quiz (linked to existing submission)
   ↓
5. Submission updated with quiz_session_id → webhook: quiz_started
   ↓
6. User completes each quiz stage
   ↓
7. Submission updated with progress → webhook: stage_completed (optional)
   ↓
8. User completes final quiz
   ↓
9. Submission updated with final data → webhook: quiz_completed
```

### Key Benefits

- **No Lost Leads**: Even if users abandon the quiz, their contact info is captured
- **Progressive Enrichment**: Quiz data progressively enhances the submission record
- **Real-time CRM Updates**: Webhooks trigger on every significant event
- **Flexible Questions**: Schools can add custom questions to landing pages
- **Direct CRM Mapping**: Questions can map directly to CRM field names

## Database Schema

### New Tables

#### landing_page_questions
Custom questions shown on all program landing pages for a school.

```sql
CREATE TABLE landing_page_questions (
  id UUID PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('text', 'textarea', 'select', 'radio', 'checkbox', 'number', 'tel', 'email')),
  help_text TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_required BOOLEAN NOT NULL DEFAULT false,
  crm_field_name TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

#### landing_page_question_options
Answer options for select/radio/checkbox questions.

```sql
CREATE TABLE landing_page_question_options (
  id UUID PRIMARY KEY,
  question_id UUID NOT NULL REFERENCES landing_page_questions(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  option_value TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

#### webhook_configs
Webhook configurations for CRM integration per school.

```sql
CREATE TABLE webhook_configs (
  id UUID PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  webhook_url TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT ARRAY['submission_created', 'quiz_started', 'stage_completed', 'submission_updated', 'quiz_completed'],
  headers JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

#### webhook_logs
Log of all webhook deliveries for debugging and monitoring.

```sql
CREATE TABLE webhook_logs (
  id UUID PRIMARY KEY,
  webhook_config_id UUID NOT NULL REFERENCES webhook_configs(id) ON DELETE CASCADE,
  submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### Enhanced submissions Table

New columns added to track progressive enrichment:

```sql
ALTER TABLE submissions ADD COLUMN landing_answers JSONB DEFAULT '{}'::jsonb;
ALTER TABLE submissions ADD COLUMN quiz_progress JSONB DEFAULT '{"current_stage_index": 0, "completed_stages": [], "last_activity_at": null}'::jsonb;
ALTER TABLE submissions ADD COLUMN recommended_program_id UUID REFERENCES programs(id);
ALTER TABLE submissions ADD COLUMN category_scores JSONB DEFAULT '{}'::jsonb;
ALTER TABLE submissions ADD COLUMN program_scores JSONB DEFAULT '{}'::jsonb;
ALTER TABLE submissions ADD COLUMN quiz_started_at TIMESTAMP;
ALTER TABLE submissions ADD COLUMN quiz_completed_at TIMESTAMP;
ALTER TABLE submissions ADD COLUMN source TEXT DEFAULT 'landing_page' CHECK (source IN ('landing_page', 'direct_quiz', 'import', 'manual'));
```

## API Endpoints

### Landing Page Questions (Super Admin)

```
GET    /api/super/schools/:schoolId/landing-questions
POST   /api/super/schools/:schoolId/landing-questions
PATCH  /api/super/landing-questions/:questionId
DELETE /api/super/landing-questions/:questionId

POST   /api/super/landing-questions/:questionId/options
PATCH  /api/super/landing-question-options/:optionId
DELETE /api/super/landing-question-options/:optionId
```

### Landing Page Questions (Public)

```
GET    /api/public/schools/:schoolId/landing-questions
```

### Submissions (Public)

```
POST   /api/public/schools/:schoolId/submissions
```

Creates a submission from landing page data before quiz starts.

### Quiz Sessions (Modified)

```
POST   /api/public/quiz/sessions
```

Now accepts optional `submissionId` parameter to link quiz to existing submission.

```
POST   /api/public/quiz/sessions/:sessionId/submit
```

Now checks for existing submission and updates it instead of creating new one.

### Webhook Configuration (Super Admin)

```
GET    /api/super/schools/:schoolId/webhooks
POST   /api/super/schools/:schoolId/webhooks
PATCH  /api/super/webhooks/:webhookId
DELETE /api/super/webhooks/:webhookId
```

## Webhook Events

### submission_created
Triggered when a user submits the landing page form.

**Payload:**
```json
{
  "event": "submission_created",
  "timestamp": "2026-02-03T10:30:00Z",
  "submissionId": "uuid",
  "schoolId": "uuid",
  "campusId": "uuid",
  "programId": "uuid",
  "contact": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phone": "+1234567890"
  },
  "landingAnswers": {
    "question_id_1": "answer_value_1",
    "question_id_2": "answer_value_2"
  },
  "source": "landing_page",
  "createdAt": "2026-02-03T10:30:00Z"
}
```

### quiz_started
Triggered when a user starts the quiz (after landing page).

**Payload:**
```json
{
  "event": "quiz_started",
  "timestamp": "2026-02-03T10:31:00Z",
  "submissionId": "uuid",
  "quizStartedAt": "2026-02-03T10:31:00Z"
}
```

### stage_completed (Optional)
Can be triggered after each quiz stage completion for real-time updates.

**Payload:**
```json
{
  "event": "stage_completed",
  "timestamp": "2026-02-03T10:32:00Z",
  "submissionId": "uuid",
  "stageId": "uuid",
  "stageName": "Contact Information",
  "quizProgress": {
    "current_stage_index": 1,
    "completed_stages": ["stage_1"],
    "last_activity_at": "2026-02-03T10:32:00Z"
  }
}
```

### submission_updated
Triggered whenever a submission is edited or partially updated.

### quiz_completed
Triggered when the entire quiz is completed.

**Payload:**
```json
{
  "event": "quiz_completed",
  "timestamp": "2026-02-03T10:35:00Z",
  "submissionId": "uuid",
  "recommendedProgramId": "uuid",
  "categoryScores": {
    "category_id_1": 50,
    "category_id_2": 30
  },
  "programScores": {
    "program_id_1": 80,
    "program_id_2": 45
  },
  "isQualified": true,
  "disqualificationReasons": [],
  "quizStartedAt": "2026-02-03T10:31:00Z",
  "quizCompletedAt": "2026-02-03T10:35:00Z"
}
```

## Frontend Components

### SuperAdminLandingQuestionsPage

New page at `/super` → School → Landing tab for managing landing page questions.

**Features:**
- Create/edit/delete landing page questions
- Configure question type (text, textarea, select, radio, checkbox, number, tel, email)
- Add options for select/radio/checkbox questions
- Set display order, required flag, help text
- Map questions to CRM field names
- Preview how questions will appear

### WebhookConfigSection

New section in School Overview tab for configuring webhooks.

**Features:**
- Add/edit/delete webhook URLs
- Select which events to trigger (checkboxes)
- Configure custom headers (JSON) for authentication
- Toggle webhooks active/inactive
- View webhook delivery logs (future enhancement)

## Usage Guide

### 1. Set Up Landing Questions

1. Go to `/super` and select a school
2. Click the "Landing" tab
3. Click "+ Add Question"
4. Configure:
   - Question text (e.g., "What is your date of birth?")
   - Question type (select appropriate input type)
   - Help text (optional guidance)
   - Required flag
   - CRM field name (e.g., "date_of_birth")
5. For select/radio/checkbox questions, add options after saving
6. Repeat for all desired questions

### 2. Configure Webhooks

1. Go to `/super` and select a school
2. On the "Overview" tab, scroll to "Webhook Configuration"
3. Click "+ Add Webhook"
4. Enter:
   - Webhook URL (e.g., "https://your-crm.com/api/webhooks/leads")
   - Select events to trigger
   - Add custom headers (e.g., `{"Authorization": "Bearer YOUR_TOKEN"}`)
   - Set active status
5. Click "Save"
6. Test by submitting a landing page form

### 3. Test the Flow

1. Visit a program landing page
2. Fill out the landing page form (first/last/email/phone + custom questions)
3. Submit → Check CRM for submission_created webhook
4. Start quiz → Check CRM for quiz_started webhook
5. Complete quiz → Check CRM for quiz_completed webhook
6. Verify all data is present in your CRM

## Webhook Security

### Best Practices

1. **Use HTTPS**: Always use HTTPS webhook URLs
2. **Authentication**: Add authentication tokens in custom headers
3. **IP Whitelist**: Configure your CRM to only accept webhooks from known IPs
4. **Signature Verification**: (Future enhancement) Verify webhook signatures

### Example Custom Headers

```json
{
  "Authorization": "Bearer YOUR_SECRET_TOKEN",
  "X-API-Key": "your-api-key",
  "Content-Type": "application/json"
}
```

## Troubleshooting

### Webhooks Not Firing

1. Check webhook is marked as "Active" in config
2. Verify the event is selected in webhook events list
3. Check webhook_logs table for error messages
4. Ensure webhook URL is accessible and returns 200 status
5. Check custom headers are valid JSON

### Questions Not Appearing on Landing Page

1. Verify questions are created for the correct school
2. Check display_order is set correctly
3. Ensure landing page component is fetching questions
4. Check browser console for API errors

### Submission Not Linking to Quiz

1. Verify submissionId is passed to quiz session creation
2. Check quiz_session_id is set on submission record
3. Ensure school_id matches between submission and quiz session

## Future Enhancements

- [ ] Webhook retry logic with exponential backoff
- [ ] Webhook signature verification for security
- [ ] Webhook delivery logs UI in super admin
- [ ] Landing question conditional logic (show/hide based on answers)
- [ ] Landing question validation rules
- [ ] Bulk import/export of landing questions
- [ ] A/B testing for landing questions
- [ ] Analytics dashboard for question completion rates
- [ ] Custom webhook payload templates
- [ ] Webhook testing tool in super admin

## Migration

The migration file `020_landing_questions_and_webhooks.sql` includes:

1. Creates `landing_page_questions` table
2. Creates `landing_page_question_options` table
3. Creates `webhook_configs` table
4. Creates `webhook_logs` table
5. Enhances `submissions` table with new columns
6. Adds appropriate indexes for performance

**To apply:**
```bash
npm run migrate
```

## Related Files

### Backend
- `migrations/020_landing_questions_and_webhooks.sql` - Database schema
- `apps/api/src/server.ts` - API endpoints and webhook trigger logic

### Frontend
- `apps/web-admin/app/super/SuperAdminLayout.tsx` - Main layout with webhook config
- `apps/web-admin/app/super/SuperAdminLandingQuestionsPage.tsx` - Landing questions UI
- `apps/web-admin/app/super/page.tsx` - Entry point

### Documentation
- `QUIZ_SYSTEM_README.md` - Quiz system overview
- `QUIZ_REFACTORING_COMPLETE.md` - Recent refactoring details

## Testing Checklist

- [ ] Create landing page questions via super admin
- [ ] Add options to select/radio/checkbox questions
- [ ] Configure webhook URL and events
- [ ] Submit landing page form
- [ ] Verify submission_created webhook fires
- [ ] Start quiz from landing page
- [ ] Verify quiz_started webhook fires
- [ ] Complete quiz
- [ ] Verify quiz_completed webhook fires
- [ ] Check CRM for all webhook payloads
- [ ] Verify submission record has all data
- [ ] Test with inactive webhook (should not fire)
- [ ] Test with multiple webhooks (all should fire)
- [ ] Test webhook custom headers
- [ ] Verify webhook logs are created
- [ ] Test deleting webhook
- [ ] Test editing webhook events

## Support

For questions or issues with the landing questions and webhooks system, check:
1. `webhook_logs` table for delivery errors
2. Browser console for frontend errors
3. Server logs for backend errors
4. CRM webhook logs for endpoint issues
