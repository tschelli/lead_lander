# Quiz System Refactoring - COMPLETE ✅

## Overview
Successfully refactored the quiz system from client-scoped to school-scoped architecture.

## What Changed

### Architecture
**Before:**
- Client Level: Had Quiz tab with quiz management
- School Level: Had old simple quiz builder
- Program Level: Had Quiz tab and `use_quiz_routing` flag

**After:**
- Client Level: Overview and Audit tabs only
- School Level: Overview, Quiz (master quiz system), and Audit tabs
- Program Level: Overview, Config, and Audit tabs only

### Database Changes (Migration 019)
✅ Dropped old `quiz_questions` and `quiz_answer_options` tables (migration 014)
✅ Changed `program_categories` from `client_id` to `school_id`
✅ Updated `quiz_stages` to school-only (`school_id` NOT NULL, removed `client_id`)
✅ Added `disqualification_config` JSONB to `schools` table
✅ Removed `use_quiz_routing` from `programs` table
✅ Updated all foreign keys and indexes

### API Endpoints Refactored

#### Program Categories (School-Scoped)
- `GET /api/super/schools/:schoolId/categories`
- `POST /api/super/schools/:schoolId/categories`
- `GET /api/super/schools/:schoolId/categories/:categoryId`
- `PATCH /api/super/schools/:schoolId/categories/:categoryId`
- `DELETE /api/super/schools/:schoolId/categories/:categoryId`

#### Quiz Stages (School-Scoped)
- `GET /api/super/schools/:schoolId/quiz/stages`
- `POST /api/super/schools/:schoolId/quiz/stages`
- `GET /api/super/schools/:schoolId/quiz/stages/:stageId`
- `PATCH /api/super/schools/:schoolId/quiz/stages/:stageId`
- `DELETE /api/super/schools/:schoolId/quiz/stages/:stageId`

#### Quiz Questions & Options
- Unchanged URLs but now properly school-scoped internally

#### Schools Endpoint
- Added `disqualification_config` field to GET/PATCH responses

#### Programs Endpoint
- Removed `use_quiz_routing` field from GET/PATCH

#### SuperAdminTree Endpoint
- Categories now returned per school (not per client)

### UI Components Refactored

#### SuperAdminLayout.tsx
✅ Client level: Shows only Overview and Audit tabs
✅ School level: Shows Overview, Quiz, and Audit tabs
✅ Program level: Shows Overview, Config, and Audit tabs
✅ Added Disqualification Configuration section to school overview:
  - Headline
  - Subheadline
  - Message text
  - Link URL (optional)
✅ Removed "Enable Quiz Routing" checkbox from program overview
✅ Categories now loaded from school level (not client level)
✅ Quiz tab now renders SuperAdminQuizPage for schools only

#### SuperAdminQuizPage.tsx
✅ Changed prop from `clientId` to `schoolId`
✅ Updated all API calls to use school-scoped endpoints
✅ Updated types to use `schoolId` instead of `clientId`

## How It Works Now

### School Master Quiz
1. Each school has its own quiz system (categories, stages, questions)
2. Schools create program categories (BUS, MED, IT, etc.)
3. Schools define quiz stages (Contact → Generic → Category Selection → Program-Specific)
4. Schools build questions with routing rules and point assignments
5. All programs in that school use the school's master quiz

### Program Landing Pages
- Programs are just content/landing pages
- They route users to the school's master quiz
- No per-program quiz configuration needed
- Always use quiz routing (no toggle)

### Disqualification Flow
- Schools configure disqualification page content
- Quiz questions can mark answers as disqualifying
- Disqualified users see the school's custom disqualification page
- Submissions are still created but marked as `is_qualified: false`

## Testing Instructions

### 1. Run Migration
```bash
npm run migrate
```

### 2. Test in Super Admin UI

**School Quiz Management:**
1. Navigate to Super Admin (`/super`)
2. Select a school from the tree
3. Click the "Quiz" tab
4. Create categories (Business, Medical, IT)
5. Create quiz stages
6. Add questions with routing rules

**School Disqualification Config:**
1. Select a school
2. Click "Overview" tab
3. Scroll to "Disqualification Page" section
4. Configure headline, subheadline, message, and link

**Program Category Assignment:**
1. Select a program
2. Click "Overview" tab
3. Select category from dropdown
4. Save changes

### 3. Verify API Endpoints
```bash
# Get school categories
curl http://localhost:3001/api/super/schools/{schoolId}/categories

# Get school quiz stages
curl http://localhost:3001/api/super/schools/{schoolId}/quiz/stages

# Get school details (should include disqualification_config)
curl http://localhost:3001/api/super/clients/{clientId}/schools/{schoolId}
```

## Files Modified

### Database
- `migrations/019_refactor_quiz_to_school_scope.sql` (NEW)

### API
- `apps/api/src/server.ts` (MODIFIED)
  - 5 category endpoints updated
  - 5 quiz stage endpoints updated
  - School GET/PATCH updated
  - Program GET/PATCH updated
  - SuperAdminTree updated

### Admin UI
- `apps/web-admin/app/super/SuperAdminLayout.tsx` (MODIFIED)
  - Tab structure refactored
  - Disqualification config section added
  - Use quiz routing removed
- `apps/web-admin/app/super/SuperAdminQuizPage.tsx` (MODIFIED)
  - Changed from clientId to schoolId
  - All API calls updated

## Breaking Changes

⚠️ **Important:** This is a breaking change for existing quiz data.

### Migration Path for Existing Data
If you have existing quiz data from the old client-scoped system, you'll need to:
1. Backup your database
2. Manually migrate existing `program_categories` and `quiz_stages` to assign them to specific schools
3. Run the migration
4. Verify all schools have their quiz data properly assigned

### If Starting Fresh
If you don't have existing quiz data:
1. Run the migration
2. Start building school-specific quizzes

## Next Steps

Now that the refactoring is complete, you can:
1. Run the migration
2. Test the new school-scoped quiz system
3. Build your first school quiz with categories and stages
4. Configure disqualification pages per school
5. Assign programs to categories

## Support

If you encounter any issues:
- Check migration logs for errors
- Verify API endpoints are responding correctly
- Check browser console for frontend errors
- Refer to QUIZ_SYSTEM_README.md for usage documentation
