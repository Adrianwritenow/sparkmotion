---
phase: 36-code-cleanup-dead-code-removal-and-reusable-abstractions
plan: "03"
subsystem: api-routers
tags: [refactor, cleanup, dead-code, abstractions, tRPC]
dependency_graph:
  requires: ["36-01"]
  provides: ["packages/api/src/lib/auth.ts", "packages/api/src/lib/soft-delete.ts", "packages/api/src/lib/trash.ts"]
  affects: ["packages/api/src/routers/events.ts", "packages/api/src/routers/campaigns.ts", "packages/api/src/routers/bands.ts", "packages/api/src/routers/organizations.ts", "packages/api/src/routers/windows.ts", "packages/api/src/routers/analytics.ts", "packages/api/src/routers/infrastructure.ts"]
tech_stack:
  added: []
  patterns: ["factory function for procedure generation", "explicit helper functions over middleware (locked decision)"]
key_files:
  created:
    - packages/api/src/lib/auth.ts
    - packages/api/src/lib/soft-delete.ts
    - packages/api/src/lib/trash.ts
  modified:
    - packages/api/src/routers/events.ts
    - packages/api/src/routers/campaigns.ts
    - packages/api/src/routers/bands.ts
    - packages/api/src/routers/organizations.ts
    - packages/api/src/routers/windows.ts
    - packages/api/src/routers/analytics.ts
    - packages/api/src/routers/infrastructure.ts
    - packages/api/src/routers/infrastructure.test.ts
    - apps/admin/src/app/(dashboard)/usage/page.tsx
  deleted:
    - apps/admin/src/components/usage/cost-projection-card.tsx
decisions:
  - "createTrashProcedures factory covers events/campaigns/organizations only — bands retain inline trash procedures due to unique eventId-scoped input signature (KISS: factory complexity would exceed value)"
  - "enforceOrgAccess used for simple org-check; analytics procedures retain pattern-level org-scoping (list events by org then filter) since they build eventId lists, not check individual entity access"
  - "organizations.ts DELETED import removed after factory extraction; enforceOrgAccess kept for updateName/updateWebsiteUrl (protectedProcedure)"
metrics:
  duration_seconds: 835
  completed_date: "2026-03-02"
  tasks_completed: 2
  files_changed: 11
---

# Phase 36 Plan 03: Extract reusable tRPC patterns and remove dead code

One-liner: enforceOrgAccess helper, ACTIVE/DELETED soft-delete constants, createTrashProcedures factory for events/campaigns/orgs, and ~90 lines of dead costProjection code deleted — all 96 tests green.

## What Was Built

### Task 1: enforceOrgAccess helper + ACTIVE/DELETED constants

**packages/api/src/lib/auth.ts** — `enforceOrgAccess(ctx, entityOrgId)` replaces 15+ inline three-line org-check blocks with a single call. ADMIN users always pass; CUSTOMER users throw FORBIDDEN when orgId doesn't match.

**packages/api/src/lib/soft-delete.ts** — `ACTIVE = { deletedAt: null }` and `DELETED = { deletedAt: { not: null } }` constants replace raw Prisma filter literals throughout all routers.

**Routers refactored:** events, campaigns, bands, organizations, windows, analytics — all inline org checks and raw deletedAt literals replaced with the helpers.

### Task 2: createTrashProcedures factory + dead code removal

**packages/api/src/lib/trash.ts** — `createTrashProcedures(options)` factory generates `trashCount`, `listDeleted`, `restore`, and `restoreAll` procedures for any supported entity. Entity-specific restore logic is passed via `onRestore`/`onRestoreAll` callbacks. Supports `adminOnly` flag for organizations (uses adminProcedure with no CUSTOMER scoping).

Routers refactored:
- **events.ts**: `...createTrashProcedures(...)` with cascade band restore + campaignId FK restoration callbacks
- **campaigns.ts**: `...createTrashProcedures(...)` with event re-association callback
- **organizations.ts**: `...createTrashProcedures({ adminOnly: true, ... })` with cascade restore of events/campaigns/bands

**bands.ts** retains inline trash procedures — their signature takes an additional `eventId` optional parameter that scopes both queries and restoreAll differently from other entities. Forcing them into the factory would require complexity exceeding the value gained (KISS).

**Dead code removed:**
- `infrastructure.costProjection` procedure deleted (~90 lines)
- `apps/admin/src/components/usage/cost-projection-card.tsx` deleted
- CostProjectionCard import + usage removed from usage/page.tsx
- Two costProjection test cases removed from infrastructure.test.ts

## Deviations from Plan

**[Rule 1 - Scope Adjustment] bands.ts excluded from createTrashProcedures**

- **Found during:** Task 2 planning
- **Issue:** The bands trash procedures take `eventId` optional input for all four procedures (trashCount, listDeleted, restore uses `event.orgId` via nested join, restoreAll scopes to `event: { orgId }`). This differs fundamentally from the flat orgId-scoped pattern in other entities.
- **Fix:** Kept bands trash procedures inline. Factory covers the three entities with identical patterns (events, campaigns, organizations).
- **Rationale:** KISS — the factory would need conditional input schema generation and WHERE clause building, which would exceed the readability benefit. The plan acknowledged entity-specific differences are handled via callbacks; the input schema difference is a step further.
- **Tracking:** Noted in decisions frontmatter.

## Self-Check: PASSED

- packages/api/src/lib/auth.ts: FOUND
- packages/api/src/lib/soft-delete.ts: FOUND
- packages/api/src/lib/trash.ts: FOUND
- apps/admin/src/components/usage/cost-projection-card.tsx: DELETED (confirmed)
- Commit d54b7b2: FOUND (Task 1)
- Commit 37ed691: FOUND (Task 2)
- All 96 tests: PASSED
- Lint: 0 new errors (pre-existing warnings only)
