---
phase: 21-event-window-datetime-range-selector
plan: 01
subsystem: database, api, ui
tags: [timezone, prisma, zod, trpc, date-fns, react-timezone-select, validation]

# Dependency graph
requires:
  - phase: 20-mobile-responsive-ui
    provides: shadcn UI components (tooltip), component directories structure
provides:
  - Event.timezone and User.timezone database fields
  - Server-side window overlap validation (defense in depth)
  - Timezone-aware datetime display component with hover tooltip
  - Timezone selector component for user preferences
  - Events API accepts timezone on create/update
  - Users API provides me query and updateTimezone mutation
affects: [21-02, 21-03, window-management, event-forms, settings-page]

# Tech tracking
tech-stack:
  added: [@date-fns/tz, react-timezone-select, shadcn calendar component]
  patterns: [overlap validation with OR conditions, timezone-aware display with primary/secondary pattern, nullable field handling in Prisma updates]

key-files:
  created:
    - apps/admin/src/components/events/datetime-display.tsx
    - apps/customer/src/components/events/datetime-display.tsx
    - apps/admin/src/components/settings/timezone-selector.tsx
    - apps/customer/src/components/settings/timezone-selector.tsx
    - apps/admin/src/components/ui/calendar.tsx
    - apps/customer/src/components/ui/calendar.tsx
  modified:
    - packages/database/prisma/schema.prisma
    - packages/api/src/routers/windows.ts
    - packages/api/src/routers/users.ts
    - packages/api/src/routers/events.ts

key-decisions:
  - "Event.timezone defaults to UTC, User.timezone nullable for browser detection fallback"
  - "Overlap validation uses lte/gte boundaries to prevent adjacent windows"
  - "Primary display in event timezone, secondary (user preference) in tooltip on hover"
  - "date-fns v4 with @date-fns/tz using tz() function and in option, not formatInTimeZone"
  - "Nullable fields in Prisma update handled by filtering undefined values (null is valid)"

patterns-established:
  - "DateTimeDisplay component accepts event timezone and optional user timezone, renders tooltip only when different"
  - "TimezoneSelector uses react-timezone-select with browser detection fallback until explicitly set"
  - "Window overlap validation query pattern: three OR conditions covering all overlap scenarios"

# Metrics
duration: 14min
completed: 2026-02-12
---

# Phase 21 Plan 01: Schema Foundation & Timezone Components Summary

**Database schema with Event.timezone and User.timezone, server-side overlap validation for windows, and timezone-aware display components using date-fns v4 with @date-fns/tz**

## Performance

- **Duration:** 14 min (836 seconds)
- **Started:** 2026-02-12T22:34:31Z
- **Completed:** 2026-02-12T22:48:27Z
- **Tasks:** 3
- **Files modified:** 15

## Accomplishments
- Database schema updated with timezone fields (Event default UTC, User nullable for preference)
- Window overlap validation prevents adjacent and overlapping windows on create/update
- DateTimeDisplay component shows event timezone with user preference tooltip on hover
- TimezoneSelector component with browser detection and live save feedback
- Timezone dependencies installed and shadcn components added for Plan 02 range picker

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema migration + dependency installation** - `aae1d78` (feat)
2. **Task 2: API overlap validation + timezone mutations** - `55a3d62` (feat)
3. **Task 3: Shared DateTimeDisplay and TimezoneSelector components** - `83a1993` (feat)

## Files Created/Modified

**Schema:**
- `packages/database/prisma/schema.prisma` - Added Event.timezone (default "UTC") and User.timezone (nullable)

**API:**
- `packages/api/src/routers/windows.ts` - Added overlap validation with TRPCError, prevents adjacent windows
- `packages/api/src/routers/users.ts` - Added me query and updateTimezone mutation
- `packages/api/src/routers/events.ts` - Added timezone field to create/update inputs, fixed nullable field handling

**UI Components (both apps):**
- `apps/{admin,customer}/src/components/events/datetime-display.tsx` - Timezone-aware display with tooltip
- `apps/{admin,customer}/src/components/settings/timezone-selector.tsx` - User timezone preference picker
- `apps/{admin,customer}/src/components/ui/calendar.tsx` - shadcn Calendar component (for Plan 02)
- `apps/{admin,customer}/src/components/ui/tooltip.tsx` - shadcn Tooltip component

**Dependencies:**
- `apps/admin/package.json` - Added @date-fns/tz, react-timezone-select
- `apps/customer/package.json` - Added @date-fns/tz, react-timezone-select

## Decisions Made

1. **Event.timezone defaults to UTC** - Existing events without timezone will use UTC, new events must specify or accept default
2. **User.timezone nullable** - Allows browser timezone detection as fallback until user explicitly sets preference
3. **Adjacent windows not allowed** - Overlap query uses `<=` and `>=` to prevent windows that touch (per user decision: gap required)
4. **date-fns v4 API** - Uses `format(date, fmt, { in: tz(timezone) })` pattern, not `formatInTimeZone` from older versions
5. **Primary/secondary timezone display** - Event timezone always shown, user timezone only in tooltip when different
6. **Nullable field handling** - Filter undefined values before Prisma update, null is valid for nullable fields

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed events.update type safety for nullable fields**
- **Found during:** Task 3 (Building customer app)
- **Issue:** Pre-existing TypeScript error - Prisma update rejected `nullable().optional()` Zod schema type (`string | null | undefined` incompatible with Prisma's update input)
- **Fix:** Filter undefined values before passing to Prisma update, preserving null as valid for nullable fields
- **Files modified:** packages/api/src/routers/events.ts
- **Verification:** Both admin and customer apps build successfully without TypeScript errors
- **Committed in:** 83a1993 (Task 3 commit)

**2. [Rule 3 - Blocking] Corrected @date-fns/tz import API**
- **Found during:** Task 3 (TypeScript compilation)
- **Issue:** Plan referenced `formatInTimeZone` from @date-fns/tz, but v1.4.1 uses different API (tz() function with date-fns format)
- **Fix:** Updated DateTimeDisplay to use `format(date, fmt, { in: tz(timezone) })` pattern
- **Files modified:** apps/admin/src/components/events/datetime-display.tsx, apps/customer/src/components/events/datetime-display.tsx
- **Verification:** TypeScript compilation succeeds, imports resolve correctly
- **Committed in:** 83a1993 (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both auto-fixes necessary for correctness. Pre-existing type safety bug would have blocked builds. Correct API usage required for runtime functionality.

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Schema foundation complete with timezone fields in database
- Server-side overlap validation enforces non-overlapping windows
- Shared UI components ready for integration in Plan 02 (range picker) and Plan 03 (settings page)
- Dependencies installed (date-fns/tz, react-timezone-select, shadcn calendar)
- Type-safe API with timezone support on events.create/update
- Users can query their profile and update timezone preference

**Ready for Plan 02:** Event window datetime range picker implementation using Calendar component and DateTimeDisplay for preview.

---
*Phase: 21-event-window-datetime-range-selector*
*Completed: 2026-02-12*

## Self-Check: PASSED

- All created files exist (datetime-display.tsx, timezone-selector.tsx, calendar.tsx, tooltip.tsx in both apps)
- All commits exist (aae1d78, 55a3d62, 83a1993)
- Schema fields verified via successful db push
- API builds successfully
- Both apps build successfully without TypeScript errors
