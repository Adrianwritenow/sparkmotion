---
phase: 25-band-activity-tab
plan: 01
subsystem: api, database
tags: [prisma, trpc, postgres, bands, tags, redis]

# Dependency graph
requires:
  - phase: 24-01
    provides: Band compound unique [bandId, eventId], Prisma schema foundation
  - phase: 23-01
    provides: invalidateEventCache Redis utility, Band.autoAssigned field

provides:
  - BandTag Prisma model with unique name, hex color, and Band[] relation
  - Band model extended with optional name, email, tagId fields
  - tags tRPC router with list (protected), create/update/delete (admin-only)
  - bands.listAll: paginated cross-event band list with tag/event includes, tag/search/autoAssigned filters
  - bands.bulkReassign: bulk reassign with TapLog deletion, counter reset, collision handling, async Redis invalidation
  - bands.activityFeed: paginated TapLog feed with time range and tag filters
  - bands.register: upsert bands with optional name/email/tagId (NFC scan-to-register backend)

affects:
  - 25-02 (activity feed UI, NFC scan-to-register dialog)
  - 25-03 (tag management admin UI)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Collision prevention in bulkReassign: delete conflicting target-event bands before updateMany to avoid P2002 compound unique violation
    - Async Redis invalidation fire-and-forget pattern after DB mutations
    - TapLog where filter via band relation: { band: { tagId: input.tagId } }

key-files:
  created:
    - packages/api/src/routers/tags.ts
  modified:
    - packages/database/prisma/schema.prisma
    - packages/api/src/routers/bands.ts
    - packages/api/src/root.ts

key-decisions:
  - "BandTag uses onDelete: SetNull on Band.tagId — deleting a tag un-tags all bands automatically (no FK violation)"
  - "bulkReassign deletes conflicting bands in target event before updateMany to prevent P2002 compound unique violation"
  - "activityFeed accepts ISO datetime strings (not Date objects) to match tRPC superjson transport for time range filters"
  - "register mutation allows empty string for email (or(z.literal(''))) — converts to null before saving"
  - "tags.list accessible to all protected users; only CRUD is admin-only (customers can assign tags in register dialog)"

patterns-established:
  - "Collision prevention: pre-delete conflicting records before bulk updateMany when compound unique constraint exists"
  - "Tag filter on TapLog: use nested band relation filter { band: { tagId } } rather than join"

requirements-completed:
  - TAG-MODEL
  - TAG-CRUD
  - BAND-EXTENSIONS
  - ACTIVITY-FEED-API
  - BAND-LISTALL
  - BAND-BULKREASSIGN
  - BAND-REGISTER

# Metrics
duration: 4min
completed: 2026-02-22
---

# Phase 25 Plan 01: Band Activity Tab Backend Summary

**BandTag Prisma model, Band extensions (name/email/tagId), tags CRUD router, and four new bands procedures (listAll, bulkReassign, activityFeed, register) providing the complete backend for the band activity tab**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-02-22T17:33:17Z
- **Completed:** 2026-02-22T17:36:49Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added BandTag model to Prisma schema with unique name, hex color, and index — pushed to database and regenerated client
- Extended Band model with optional name, email, tagId fields; BandTag relation with onDelete: SetNull
- Created tags tRPC router with list (all protected users) and create/update/delete (admin-only) with P2002 conflict handling
- Added bands.listAll: paginated cross-event band query with tag/event includes and tag/search/autoAssigned/lastTapAt filters
- Added bands.bulkReassign: deletes TapLogs, resets counters, handles compound unique collision prevention, fires async Redis invalidation
- Added bands.activityFeed: paginated TapLog query with time range, tag filter, and org/event scoping
- Added bands.register: upsert bands with optional name/email/tagId for NFC scan-to-register workflow
- Registered tagsRouter in appRouter root

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema migration — BandTag model and Band field extensions** - `0fccd9c` (feat)
2. **Task 2: Tags CRUD router and bands router procedure additions** - `c2eb502` (feat)

## Files Created/Modified

- `packages/database/prisma/schema.prisma` - Added BandTag model; extended Band with name/email/tagId/tag relation/@@index([tagId])
- `packages/api/src/routers/tags.ts` - New tags CRUD router (list, create, update, delete)
- `packages/api/src/routers/bands.ts` - Added listAll, bulkReassign, activityFeed, register procedures; added Prisma and invalidateEventCache imports
- `packages/api/src/root.ts` - Registered tagsRouter as `tags: tagsRouter`

## Decisions Made

- **BandTag onDelete: SetNull** — When a tag is deleted, all bands that used it have tagId set to null automatically. No FK violation, clean behavior.
- **bulkReassign collision prevention** — Before `updateMany`, delete any bands already in the target event with the same `bandId` values (but not the ones being reassigned). Prevents P2002 on the compound unique `[bandId, eventId]`.
- **activityFeed uses ISO datetime strings** — `from`/`to` accept `z.string().datetime({ offset: true })` instead of `z.date()` for correct tRPC transport over superjson.
- **register allows empty string email** — `z.string().email().optional().or(z.literal(''))` handles UI clearing the email field; converted to null before saving.
- **tags.list is protectedProcedure** — Customers can read the tag list to assign tags in the scan-to-register dialog; only CRUD operations are admin-only.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Complete backend for Phase 25 is ready: tags CRUD, bands listAll, bulkReassign, activityFeed, and register are all TypeScript-clean and schema-backed
- Phase 25-02 (activity feed UI + NFC scan-to-register dialog) can proceed immediately
- Phase 25-03 (tag management admin UI) can proceed immediately

---
*Phase: 25-band-activity-tab*
*Completed: 2026-02-22*
