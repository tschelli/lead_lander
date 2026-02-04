# Quiz System - Complete Implementation

## Overview
A fully customizable multi-stage quiz system for lead qualification and program recommendation. Built for lead generation in educational institutions.

## Features

### 📊 **Multi-Stage Quiz Flow**
- Contact Information Collection
- Generic Student Qualification Questions
- Category Selection (Business, Medical, IT, etc.)
- Program-Specific Questions
- Recommendation & Confirmation

### 🎯 **Smart Routing & Scoring**
- Point-based scoring for categories and programs
- Automatic program recommendations
- Direct program routing rules
- Lead disqualification flags
- Tie-breaking logic

### ⚙️ **Fully Customizable**
- Create unlimited program categories
- Define multi-stage quiz flows
- Build questions with multiple option types
- Assign points per answer option
- Set routing rules per option
- Flag disqualifying answers

## Database Schema

### New Tables

#### `program_categories`
- Groups programs into categories (BUS, MED, IT)
- Client-scoped
- Display ordering

#### `quiz_stages`
- Defines multi-stage quiz flow
- Can be client-wide, school-specific, or category-specific
- Ordered stages

#### `quiz_sessions`
- Tracks user progress through quiz
- Stores answers, scores, and contact info
- Calculates recommendations
- Tracks qualification status

### Enhanced Tables

#### `quiz_questions`
- Added `stage_id` - belongs to a stage
- Added `is_contact_field` - marks as contact data
- Added `contact_field_type` - first_name, email, etc.
- Added `disqualifies_lead` - can mark as unqualified

#### `quiz_answer_options`
- Added `category_points` - points per category
- Added `disqualifies_lead` - flags unqualified
- Added `routes_to_program_id` - direct routing

#### `programs`
- Added `category_id` - belongs to category

#### `submissions`
- Added `quiz_session_id` - linked session
- Added `is_qualified` - qualification status
- Added `disqualification_reasons` - why disqualified

## API Endpoints

### Super Admin - Categories
```
GET    /api/super/clients/:clientId/categories           # List categories
POST   /api/super/clients/:clientId/categories           # Create category
GET    /api/super/clients/:clientId/categories/:id       # Get category
PATCH  /api/super/clients/:clientId/categories/:id       # Update category
DELETE /api/super/clients/:clientId/categories/:id       # Delete category
```

### Super Admin - Stages
```
GET    /api/super/clients/:clientId/quiz/stages          # List stages
POST   /api/super/clients/:clientId/quiz/stages          # Create stage
GET    /api/super/clients/:clientId/quiz/stages/:id      # Get stage
PATCH  /api/super/clients/:clientId/quiz/stages/:id      # Update stage
DELETE /api/super/clients/:clientId/quiz/stages/:id      # Delete stage
```

### Super Admin - Questions
```
GET    /api/super/quiz/stages/:stageId/questions         # List questions in stage
POST   /api/super/quiz/stages/:stageId/questions         # Create question
PATCH  /api/super/quiz/questions/:id                     # Update question
DELETE /api/super/quiz/questions/:id                     # Delete question
```

### Super Admin - Options
```
POST   /api/super/quiz/questions/:id/options             # Create option
PATCH  /api/super/quiz/options/:id                       # Update option
DELETE /api/super/quiz/options/:id                       # Delete option
```

### Public - Quiz Flow
```
POST   /api/public/quiz/sessions                         # Start new session
GET    /api/public/quiz/sessions/:id/next                # Get next question
POST   /api/public/quiz/sessions/:id/answer              # Submit answer
POST   /api/public/quiz/sessions/:id/submit              # Final submit (create submission)
```

## Admin UI Components

### SuperAdminQuizPage
Main quiz management interface with tabs:
- **Program Categories Tab** - Manage categories
- **Quiz Stages Tab** - Define quiz flow stages

### CategoryManager
CRUD interface for program categories:
- Create/edit/delete categories
- Set slug and display order
- View program count per category

### StageManager
CRUD interface for quiz stages:
- Create/edit/delete stages
- Assign to categories
- Set display order
- Open question editor

### QuestionEditor
Comprehensive question builder:
- Create/edit/delete questions
- Set question type (single, multiple, text)
- Mark as contact field
- Add/edit/delete options
- Set point assignments
- Configure routing rules
- Set disqualification flags

## Public UI Components

### QuizFlow
End-user quiz interface:
- Start quiz session
- Display questions one at a time
- Collect answers
- Handle multiple question types
- Show recommendations
- Submit final lead

## Usage

### 1. Setup Categories
Navigate to Super Admin → Select Client → Quiz Tab → Categories
```
Create categories:
- Business (BUS)
- Medical (MED)
- Information Technology (IT)
```

### 2. Create Stages
Switch to Stages Tab:
```
Stage 1: Contact Information (order: 0)
  - school_id: NULL (client-wide)
  - category_id: NULL

Stage 2: Student Qualification (order: 1)
  - school_id: NULL (client-wide)
  - category_id: NULL

Stage 3: Category Selection (order: 2)
  - school_id: NULL
  - category_id: NULL

Stage 4: Medical Programs (order: 3)
  - school_id: NULL
  - category_id: [MED category ID]

Stage 5: Business Programs (order: 3)
  - school_id: NULL
  - category_id: [BUS category ID]
```

### 3. Build Questions
Click "Questions" on each stage:

**Stage 1 (Contact):**
```
Q1: First Name
  - Type: text
  - Is Contact Field: ✓
  - Contact Field Type: first_name

Q2: Last Name
  - Type: text
  - Is Contact Field: ✓
  - Contact Field Type: last_name

Q3: Email
  - Type: text
  - Is Contact Field: ✓
  - Contact Field Type: email

Q4: Phone
  - Type: text
  - Is Contact Field: ✓
  - Contact Field Type: phone
```

**Stage 2 (Qualification):**
```
Q1: How old are you?
  - Type: single_choice
  - Options:
    - Younger than 18 → Disqualifies: ✓ (Reason: "Under 18")
    - 18-25 → No special action
    - 26-30 → No special action
    - 31-40 → No special action
    - 40+ → No special action
```

**Stage 3 (Category Selection):**
```
Q1: What sounds like a good day at work?
  - Type: single_choice
  - Options:
    - Organize schedules, emails → Category Points: {BUS: 1}
    - Fix computers and help with tech → Category Points: {IT: 1}
    - Work with patients' info → Category Points: {MED: 1}
```

**Stage 4 (Medical Programs):**
```
Q1: What kind of work sounds best?
  - Type: single_choice
  - Options:
    - Computer work with forms → Program Points: {medical-billing-coding: 1}
    - Prepare medicine in pharmacy → Program Points: {pharmacy-tech: 1}
    - Keep patient info organized → Program Points: {health-info: 1}
```

### 4. Integrate into Landing Pages
```tsx
import { QuizFlow } from "./components/QuizFlow";

<QuizFlow
  schoolId="school_asher"
  defaultProgramId="program_id"
  apiBaseUrl="https://api.example.com"
  onComplete={(submissionId) => {
    // Redirect to thank you page
    router.push("/thank-you");
  }}
/>
```

## How It Works

### Quiz Flow
1. User lands on landing page
2. QuizFlow component starts a session
3. User answers questions one by one
4. System tracks answers and calculates scores
5. System recommends program based on highest score
6. User confirms and submits
7. Submission is created in database
8. Thank you page displayed

### Scoring Algorithm
1. **Category Scoring**: Sum points from all answers for each category
2. **Determine Category**: Highest category score determines which program stage to show
3. **Program Scoring**: Sum points from program-specific questions
4. **Recommendation**: Highest program score becomes recommendation
5. **Manual Override**: User can select different program at end

### Disqualification
- Any answer option can be marked as disqualifying
- Reasons are collected and stored
- Submission is still created but marked as `is_qualified: false`
- CRM can filter out disqualified submissions

## Migration

Run the migration to create all tables and columns:
```bash
npm run migrate
```

Migration file: `migrations/018_quiz_system_enhancements.sql`

## Files Created/Modified

### Database
- `migrations/018_quiz_system_enhancements.sql` - Complete schema

### API (apps/api/src/server.ts)
- Program Categories endpoints (5 routes)
- Quiz Stages endpoints (5 routes)
- Quiz Questions endpoints (4 routes)
- Quiz Options endpoints (3 routes)
- Public Quiz Session endpoints (4 routes)

### Admin UI (apps/web-admin/app/super/)
- `SuperAdminQuizPage.tsx` - Main quiz management
- `QuestionEditor.tsx` - Question/option builder
- `SuperAdminLayout.tsx` - Integrated quiz tab
- `super-admin.css` - Styles for quiz UI

### Public UI (apps/web-landing/app/components/)
- `QuizFlow.tsx` - End-user quiz component
- `QuizFlow.css` - Quiz flow styles

## Testing Checklist

- [ ] Run migration successfully
- [ ] Create program categories
- [ ] Create quiz stages
- [ ] Add questions to stages
- [ ] Add options with point assignments
- [ ] Test quiz flow on landing page
- [ ] Verify scoring calculation
- [ ] Test disqualification flow
- [ ] Verify submission creation
- [ ] Check qualification flags

## Future Enhancements (Phase 4)

- Drag-and-drop reordering
- Preview mode
- Conditional logic builder
- Analytics dashboard
- A/B testing
- Multi-language support
- Skip logic (conditional questions)
- Progress bar
- Save & resume later

## Support

For questions or issues, refer to the implementation files or contact the development team.
