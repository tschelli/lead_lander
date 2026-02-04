# Quiz System Refactoring Status

## Overview
Refactoring quiz system from client-scoped to school-scoped architecture.

## Completed ✅

### 1. Migration (Task #10) ✅
- Created `migrations/019_refactor_quiz_to_school_scope.sql`
- Drops old quiz_questions and quiz_answer_options tables
- Changes program_categories from client_id to school_id
- Updates quiz_stages to school-only (school_id NOT NULL)
- Adds disqualification_config JSONB to schools table
- Removes use_quiz_routing from programs table

### 2. API Endpoints - Categories (Task #11 - Partial) ✅
All category endpoints updated from client-scope to school-scope:
- ✅ GET `/api/super/schools/:schoolId/categories` (was `/api/super/clients/:clientId/categories`)
- ✅ POST `/api/super/schools/:schoolId/categories`
- ✅ GET `/api/super/schools/:schoolId/categories/:categoryId`
- ✅ PATCH `/api/super/schools/:schoolId/categories/:categoryId`
- ✅ DELETE `/api/super/schools/:schoolId/categories/:categoryId`

### 3. API Endpoints - Quiz Stages (Task #11 - Partial) ✅
- ✅ GET `/api/super/schools/:schoolId/quiz/stages` (was `/api/super/clients/:clientId/quiz/stages`)
- ✅ POST `/api/super/schools/:schoolId/quiz/stages`

## In Progress 🚧

### 4. API Endpoints - Quiz Stages (Remaining)
Need to update:
- ⏳ GET `/api/super/schools/:schoolId/quiz/stages/:stageId`
- ⏳ PATCH `/api/super/schools/:schoolId/quiz/stages/:stageId`
- ⏳ DELETE `/api/super/schools/:schoolId/quiz/stages/:stageId`

### 5. API Endpoints - Quiz Questions/Options
Questions/options endpoints are currently at `/api/super/quiz/...` and don't need URL changes, but need internal query updates to ensure school-scope.

## Remaining Tasks 📋

### Task #11 (API Refactoring) - Remaining Work:
1. Update remaining 3 quiz stage endpoints (GET single, PATCH, DELETE)
2. Update SuperAdminTree endpoint to include categories per school (not client)
3. Add disqualification_config to school PATCH endpoint
4. Remove use_quiz_routing from program GET/PATCH endpoints
5. Update all internal queries to use school_id where applicable

### Task #12 (SuperAdminLayout UI):
- Remove Quiz tab from client level
- Move Quiz tab to school level
- Add disqualification config section to school overview
- Remove Quiz tab from program level
- Remove use_quiz_routing field from program overview

### Task #13 (SuperAdminQuizPage):
- Change prop from clientId to schoolId
- Update all API calls to use school-scoped endpoints
- Update CategoryManager, StageManager, QuestionEditor

## Quick Commands

Run migration:
```bash
npm run migrate
```

Test endpoints after refactoring:
```bash
# Get school categories
curl -X GET http://localhost:3001/api/super/schools/{schoolId}/categories

# Get school quiz stages
curl -X GET http://localhost:3001/api/super/schools/{schoolId}/quiz/stages
```
