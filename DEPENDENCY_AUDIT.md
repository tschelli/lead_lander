# Dependency Audit - accounts-refactor Branch

## Security Vulnerabilities Found

### High Priority
- **next**: versions 10.0.0 - 15.5.9 have DoS vulnerabilities
  - Current: ~14.2.5
  - Fix: Update to 16.1.6 (breaking change)
  - Impact: web-landing, web-admin

### Moderate Priority
- **esbuild**: <=0.24.2 has development server vulnerability
  - Via: vite → vitest
  - Fix: Update vitest to 4.0.18 (breaking change)
  - Impact: Root dev dependencies

## Recommended Dependency Updates

### Next.js (web-landing, web-admin)
- Current: ^14.2.5
- Recommended: ^15.0.0 (stable, not 16.x yet for production)
- Breaking changes to review: App Router changes, middleware updates

### Vitest (root)
- Current: ^2.0.5
- Recommended: ^4.0.18 (fixes esbuild vulnerability)
- Breaking changes to review: API changes in v3 and v4

### React (web-landing, web-admin)
- Current: ^18.3.1
- Status: Up to date, no action needed

### TypeScript
- Current: ^5.5.4
- Status: Up to date, no action needed

## Unused Dependencies to Check

### Root
- All dependencies appear to be used

### API
- Need to verify all express middleware is used
- Check if all CRM adapters are needed

### Worker
- Check if all notification providers are used

### Web-landing & Web-admin
- Check for unused UI libraries after refactor

## Action Plan

1. **Defer security fixes to post-refactor** - Since we're doing a major refactor, we can update Next.js and Vitest after the core work is done to avoid dealing with breaking changes during the refactor.

2. **Document for later**:
   - Update Next.js 14 → 15 after refactor complete
   - Update Vitest 2 → 4 after tests are updated
   - Run `npm audit fix --force` in a separate commit

3. **During refactor**:
   - Remove unused imports and dependencies as we refactor each app
   - Don't install new unnecessary dependencies
   - Keep dependencies aligned across workspaces where possible

## Notes

- Security vulnerabilities are in development dependencies (esbuild) and affect self-hosted Next.js apps (DoS). Since we're deploying to Vercel, the Next.js vulnerabilities are less critical.
- We should still plan to update after refactor is complete.
