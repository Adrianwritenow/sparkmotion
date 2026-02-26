---
phase: 30-add-analytics-tracking-for-fallback-and-org-url-taps
plan: 01
subsystem: hub-redirect, analytics-api
tags: [analytics, logging, tap-tracking, trpc, testing]
dependency_graph:
  requires: []
  provides: [tapsByRedirectType, campaignTapsByRedirectType, complete-hub-tap-logging]
  affects: [apps/hub, packages/api/routers/analytics]
tech_stack:
  added: []
  patterns: [SQL-CASE-redirect-classification, IS-NOT-NULL-guard, LEFT-JOIN-EventWindow]
key_files:
  created: []
  modified:
    - apps/hub/src/app/e/route.ts
    - packages/api/src/routers/analytics.ts
    - packages/api/src/routers/analytics.test.ts
decisions:
  - IS NOT NULL guard required before NULL equality checks in SQL CASE (NULL=NULL is NULL not TRUE)
  - LEFT JOIN on EventWindow (not INNER JOIN) to include windowId=NULL tap rows
  - logTapAsync called only when band is truthy at the no-event check (bandless paths cannot log due to NOT NULL FK)
  - mode passed as activeWindow.windowType.toLowerCase() or 'pre' fallback on no-redirectUrl path
metrics:
  duration_minutes: 15
  completed: "2026-02-26T18:34:31Z"
  tasks_completed: 2
  files_modified: 3
---

# Phase 30 Plan 01: Analytics Tracking for Fallback and Org URL Taps Summary

Hub route now logs taps on all valid-band redirect paths; two new tRPC procedures derive redirect category (PRE/LIVE/POST/FALLBACK/ORG/DEFAULT) from TapLog.redirectUrl using SQL CASE at query time.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Fix hub route logging gaps for band-bearing redirect paths | 3270ca4 | apps/hub/src/app/e/route.ts |
| 2 | Add tapsByRedirectType and campaignTapsByRedirectType procedures with tests | aa3ca5c | packages/api/src/routers/analytics.ts, analytics.test.ts |

## What Was Built

### Task 1: Hub Route Logging Gaps Fixed

Two redirect paths in `apps/hub/src/app/e/route.ts` that previously silently skipped tap logging now call `logTapAsync`:

**Path 1 — Band found, no event (`band` truthy, `band.event` null):**
```typescript
if (!band || !band.event) {
  const dest = orgWebsiteUrl || FALLBACK_URL;
  if (band) {
    logTapAsync(request, {
      bandId: band.bandId,  // NFC string, NOT band.id
      eventId: band.eventId,
      mode: "pre",
      windowId: null,
      redirectUrl: dest,
      ...utmParams
    });
  }
  return NextResponse.redirect(dest, 302);
}
```

**Path 2 — Band found, no active window and no fallbackUrl:**
```typescript
if (!redirectUrl) {
  const dest = band.event.org?.websiteUrl || FALLBACK_URL;
  logTapAsync(request, {
    bandId: band.bandId,
    eventId: band.eventId,
    mode: activeWindow?.windowType?.toLowerCase() ?? "pre",
    windowId: null,
    redirectUrl: dest,
    ...utmParams
  });
  return NextResponse.redirect(dest, 302);
}
```

Total `logTapAsync` calls in route: **5** (3 existing + 2 new).

### Task 2: New tRPC Analytics Procedures

**`tapsByRedirectType`** — event-level redirect category breakdown:
- Input: `{ eventId, from?, to? }`
- SQL CASE expression with LEFT JOIN EventWindow derives category from `TapLog.redirectUrl`
- CUSTOMER org-scoping enforced via `event.orgId` check
- Returns `Array<{ category: string; count: number }>`

**`campaignTapsByRedirectType`** — campaign-level with optional event filter:
- Input: `{ campaignId, eventId?, from?, to? }`
- Fetches ACTIVE/COMPLETED campaign events, scopes to single eventId if provided
- Same CASE SQL, early return `[]` when no events
- Returns `Array<{ category: string; count: number }>`

**Category derivation logic:**
```sql
CASE
  WHEN tl."windowId" IS NOT NULL THEN ew."windowType"          -- PRE/LIVE/POST
  WHEN e."fallbackUrl" IS NOT NULL AND tl."redirectUrl" = e."fallbackUrl" THEN 'FALLBACK'
  WHEN o."websiteUrl" IS NOT NULL AND tl."redirectUrl" = o."websiteUrl" THEN 'ORG'
  ELSE 'DEFAULT'
END AS category
```

**6 new tests added** — all pass alongside 92 existing tests (98 total).

## Decisions Made

1. **IS NOT NULL guard in SQL CASE** — `NULL = NULL` evaluates to NULL (not TRUE) in SQL. Without the `IS NOT NULL AND` guards, rows where `fallbackUrl` or `websiteUrl` is NULL would incorrectly fall through to 'ORG' or 'DEFAULT' categories when the tap URL happens to match. Guards prevent false classification.

2. **LEFT JOIN EventWindow** — Using `INNER JOIN` would drop all tap rows where `windowId` is NULL (the majority of taps during non-window periods). LEFT JOIN ensures every TapLog row is classified, with NULL windowId rows evaluated by the URL comparison branches.

3. **logTapAsync called only when band is truthy** — The `TapLog` table has a NOT NULL FK on `bandId`. If we reach the `!band || !band.event` branch and `band` is null/undefined, there's no valid `bandId` to log. The guard `if (band)` ensures we only log when we have the necessary data.

4. **mode on no-redirectUrl path** — Uses `activeWindow?.windowType?.toLowerCase() ?? "pre"` rather than hardcoding `"pre"`. If an active window exists (but has no URL configured), the mode reflects the actual window type instead of always logging as pre-mode.

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

1. `grep -c "logTapAsync" apps/hub/src/app/e/route.ts` → **5** (3 existing + 2 new)
2. `pnpm --filter @sparkmotion/api test -- --run` → **98 passed** (9 test files)
3. `tapsByRedirectType` and `campaignTapsByRedirectType` procedures present in analytics router
4. No schema changes (no new migrations, no new Prisma fields)

## Self-Check: PASSED

Files verified:
- `apps/hub/src/app/e/route.ts` — exists, contains 5 logTapAsync calls
- `packages/api/src/routers/analytics.ts` — exists, contains tapsByRedirectType at line 1011
- `packages/api/src/routers/analytics.test.ts` — exists, all 15 analytics tests pass

Commits verified:
- `3270ca4` — hub route logging gaps fix
- `aa3ca5c` — new analytics procedures and tests
