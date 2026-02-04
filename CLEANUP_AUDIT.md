# Cleanup Audit - accounts-refactor Branch

This document lists all files and directories identified for cleanup during the accounts-refactor initiative.

## Files to Archive (Move to docs/archive/)

These files contain historical progress notes but are outdated:

- `LANDING_PAGE_INTEGRATION_COMPLETE.md` - Outdated landing page integration notes
- `LANDING_QUESTIONS_AND_WEBHOOKS.md` - Old webhook implementation notes
- `QUIZ_REFACTORING_COMPLETE.md` - Previous quiz refactoring notes
- `QUIZ_SYSTEM_README.md` - Old quiz system documentation
- `REFACTORING_STATUS.md` - Previous refactoring status (no longer relevant)
- `UX_IMPROVEMENTS_COMPLETE.md` - Completed UX improvement notes

## Directories to Archive

### migrations/ → migrations/legacy/
All existing migrations (001-020) will be archived since we're starting with a fresh schema_v2.sql:
- `001_init.sql` through `020_landing_questions_and_webhooks.sql`
- Keep for reference but won't be executed

## Files/Directories to Remove

### apps/web/ (Deprecated)
**Size:** 440KB
**Reason:** Replaced by `apps/web-landing` and `apps/web-admin`
**Still referenced in:**
- `package.json` - `dev:web` script (marked DEPRECATED)
- `apps/web/package.json` - references `sync-web-configs.js` in prebuild

**Dependencies to remove with apps/web:**
- `scripts/sync-web-configs.js` - Only used by apps/web

### configs/
Old school-based config files to be replaced:
- `configs/asher.yml` - Old school config
- `configs/northwood.yml` - Old school config

**Action:** Archive to `configs/legacy/` and create new account-based structure

## Scripts to Update/Remove

### To Remove:
- `scripts/sync-web-configs.js` - Only used by deprecated apps/web

### To Review:
- `scripts/check-duplicate-slugs.ts` - May need updating for account structure
- `scripts/seed-config.ts` - Will be replaced with new seed-data.ts
- `scripts/monthly-summary.ts` - May need updating for account terminology
- `scripts/requeue-missing-crm.ts` - May need updating for new schema

## package.json Cleanup

### Scripts to Remove:
- `dev:web` - Deprecated script for apps/web

### Scripts to Update:
- `build` - Remove apps/web if it exists
- `seed:config` - Will be replaced with `seed` script

## Configuration Files to Review

### docker-compose.yml
**Current issues:**
- References old `apps/web` instead of `apps/web-landing` and `apps/web-admin`
- Missing Mailhog for email testing
- Missing webhook mock server
- Needs health checks

### .env.example
**Needs review for:**
- Deprecated environment variables
- New ZIP code API credentials
- Account-based variables vs school-based

## Dependencies to Audit

### Check for unused packages in:
- Root package.json
- apps/api/package.json
- apps/worker/package.json
- apps/web-landing/package.json
- apps/web-admin/package.json
- packages/config-schema/package.json

### Security:
- Run `npm audit` to fix vulnerabilities
- Update outdated dependencies

## File Structure After Cleanup

```
lead_lander/
├── apps/
│   ├── api/              (updated)
│   ├── worker/           (updated)
│   ├── web-landing/      (refactored)
│   └── web-admin/        (refactored)
├── configs/
│   ├── legacy/           (archived old configs)
│   └── accounts/         (new account-based configs)
├── docs/
│   ├── archive/          (old progress docs)
│   ├── ARCHITECTURE.md   (new)
│   ├── LOCAL_SETUP.md    (new)
│   └── DEPLOYMENT.md     (new)
├── migrations/
│   ├── legacy/           (old migrations 001-020)
│   └── schema_v2.sql     (new fresh schema)
├── packages/
│   └── config-schema/    (updated types)
├── scripts/
│   ├── seed-data.ts      (new)
│   ├── zip-lookup.ts     (new)
│   └── migrate.ts        (updated for v2)
├── README.md             (rewritten)
└── docker-compose.yml    (enhanced)
```

## Estimated Cleanup Impact

- **Space freed:** ~500KB (apps/web + old docs)
- **Files removed:** ~8 files
- **Files archived:** ~27 files (docs + migrations)
- **Scripts removed:** 1 (sync-web-configs.js)
- **Scripts to refactor:** 4-5

## Next Steps

1. ✅ Create CLEANUP_AUDIT.md (this file)
2. Create docs/archive/ directory
3. Move documentation files
4. Create migrations/legacy/ directory
5. Move old migrations
6. Remove apps/web and sync-web-configs.js
7. Update package.json scripts
8. Archive old config files
9. Audit and update dependencies
