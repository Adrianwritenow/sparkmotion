---
phase: 19
plan: 01
subsystem: api
tags: [analytics, engagement, location, api-enhancement]
dependency_graph:
  requires: [redis-analytics, prisma-schema]
  provides: [engagement-percent-api, location-data-api]
  affects: [event-cards, campaign-cards, event-detail]
tech_stack:
  added: []
  patterns: [redis-analytics-integration, parallel-promise-all]
key_files:
  created: []
  modified:
    - packages/database/prisma/schema.prisma
    - packages/api/src/routers/events.ts
    - packages/api/src/routers/campaigns.ts
decisions:
  - Event.location field is nullable to support existing events without location data
  - Engagement calculation uses Redis analytics (uniqueTaps / totalBands * 100)
  - Campaign engagement aggregates across all child events using parallel Promise.all
  - tapCount added to events API to replace missing field that cards already reference
  - Location field accepted on create/update but remains optional in database
metrics:
  duration_seconds: 194
  tasks_completed: 2
  files_modified: 3
  commits: 2
  completed_at: "2026-02-10T23:15:41Z"
---

# Phase 19 Plan 01: Analytics & Location API Enhancement Summary

**One-liner:** Added Event.location field and engagement percentage calculations to events/campaigns API using Redis analytics data.

## Overview

Enhanced the tRPC API layer to provide engagement metrics and location data for UI card displays. Events now return engagement percentages calculated from Redis analytics (uniqueTaps / totalBands), and campaigns aggregate engagement across child events. Added location field to Event schema for display purposes.

## What Was Built

### Database Schema
- Added optional `location` field to Event model (nullable String)
- Field placed after `venue` for logical grouping
- Supports "City, ST" format for display
- Nullable to preserve existing events without location data

### Events Router Enhancements
**events.list:**
- Fetches Redis analytics for each event using `getAnalytics(eventId)`
- Calculates `engagementPercent = (uniqueTaps / totalBands) * 100` rounded
- Adds `tapCount: analytics.totalTaps` to response
- Uses `Promise.all` for parallel analytics fetching across events
- Returns 0% engagement when no bands exist

**events.byId:**
- Same engagement calculation as list
- Adds `tapCount` and `engagementPercent` to existing response
- Preserves existing `currentMode` calculation

**events.create/update:**
- Accept optional `location` parameter in input schema
- create: `location: z.string().optional()`
- update: `location: z.string().nullable().optional()`

### Campaigns Router Enhancements
**campaigns.list:**
- Changed event include to fetch `id`, `location`, and `_count.bands`
- Aggregates analytics across all child events using parallel `Promise.all`
- Calculates aggregate metrics:
  - `totalUniqueTaps`: sum of uniqueTaps across events
  - `totalBands`: sum of bands across events
  - `aggregateEngagement`: (totalUniqueTaps / totalBands) * 100, rounded
  - `locations`: array of unique location strings from child events (filtered for truthy values)

**campaigns.byId:**
- Same aggregation pattern as list
- Returns all aggregate metrics alongside campaign data
- Changed event select to minimal fields needed for aggregation

## Technical Implementation

### Engagement Calculation Pattern
```typescript
const analytics = await getAnalytics(event.id);
const totalBands = event._count.bands;
const engagementPercent = totalBands > 0
  ? Math.round((analytics.uniqueTaps / totalBands) * 100)
  : 0;
```

### Campaign Aggregation Pattern
```typescript
const analyticsResults = await Promise.all(
  campaign.events.map((event) => getAnalytics(event.id))
);
campaign.events.forEach((event, i) => {
  const analytics = analyticsResults[i];
  if (analytics) {
    totalUniqueTaps += analytics.uniqueTaps;
    totalBands += event._count.bands;
  }
});
```

### TypeScript Safety
- Added null checks for `analyticsResults[i]` to satisfy TypeScript strict mode
- Used type predicate filter for locations: `.filter((loc): loc is string => !!loc)`
- All code compiles without errors

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

### TypeScript Compilation
```bash
npx tsc --noEmit -p packages/api/tsconfig.json
```
PASSED - No compilation errors

### Prisma Client Generation
```bash
pnpm db:push && pnpm db:generate
```
PASSED - Schema synced, client regenerated successfully

### Database Migration
- Schema change applied using `pnpm db:push` (dev mode)
- Location column added to Event table
- Existing events remain valid with NULL location

## Files Modified

| File | Changes | LOC Changed |
|------|---------|-------------|
| packages/database/prisma/schema.prisma | Added location field to Event model | +1 |
| packages/api/src/routers/events.ts | Added engagement calculation, location input schemas | +56 |
| packages/api/src/routers/campaigns.ts | Added aggregate engagement and locations | +50 |

**Total:** 107 insertions, 7 deletions across 3 files

## Commits

| Hash | Message |
|------|---------|
| d3c817c | feat(19-01): add location field to Event model |
| bc4d898 | feat(19-01): add engagement and location data to events and campaigns routers |

## Dependencies

### Requires
- `@sparkmotion/redis` - getAnalytics function for tap metrics
- Prisma schema with Event and Campaign models
- Redis analytics keys populated by redirect worker

### Provides
- `engagementPercent` on events.list and events.byId
- `tapCount` on events.list and events.byId
- `aggregateEngagement`, `totalBands`, `totalUniqueTaps`, `locations` on campaigns.list and campaigns.byId
- `location` field on Event model (readable/writable via API)

### Affects
- Event card components (can now display engagement %)
- Campaign card components (can now display aggregate engagement and locations)
- Event detail overview tab (can now display/edit location)
- Event forms (can now accept location input)

## Next Steps

This plan provides the API foundation for UI refinements in Phase 19:
- Plan 02: Display engagement % and location on event cards
- Plan 03: Display aggregate engagement and locations on campaign cards
- Plan 04: Add location selection to event overview tab
- Plan 05: Refactor URL manager tab to use card layout

All subsequent plans depend on this API enhancement.

## Self-Check: PASSED

### Created Files
None - only modified existing files

### Modified Files
- [FOUND] packages/database/prisma/schema.prisma
- [FOUND] packages/api/src/routers/events.ts
- [FOUND] packages/api/src/routers/campaigns.ts

### Commits
- [FOUND] d3c817c: feat(19-01): add location field to Event model
- [FOUND] bc4d898: feat(19-01): add engagement and location data to events and campaigns routers

All claims verified. Plan execution complete.
