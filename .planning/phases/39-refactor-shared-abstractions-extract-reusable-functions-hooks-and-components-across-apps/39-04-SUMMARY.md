---
phase: 39-refactor-shared-abstractions
plan: "04"
subsystem: api-routers
tags: [refactor, auth, org-scoping, trpc, dry]
dependency_graph:
  requires: []
  provides: [getOrgFilter helper in packages/api/src/lib/auth.ts]
  affects:
    - packages/api/src/routers/events.ts
    - packages/api/src/routers/campaigns.ts
    - packages/api/src/routers/analytics.ts
tech_stack:
  added: []
  patterns:
    - "getOrgFilter for list-level org scoping in tRPC routers (alongside existing enforceOrgAccess for entity-level)"
key_files:
  created: []
  modified:
    - packages/api/src/lib/auth.ts
    - packages/api/src/routers/events.ts
    - packages/api/src/routers/campaigns.ts
    - packages/api/src/routers/analytics.ts
decisions:
  - "getOrgFilter returns { orgId?: string } for spreading into Prisma where clauses — clean fit for list procedures"
  - "bands.listAll and bands.listAllIds use nested event relation filter (event: { orgId }) — not a direct orgId filter; getOrgFilter does not cleanly apply, left as-is per plan guidance"
  - "windows.ts has no list-level org filter procedures — only entity-level enforceOrgAccess calls, nothing to replace"
  - "analytics kpis/tapsByDay/topEvents eventWhere pattern replaced using spread: { ...getOrgFilter(ctx, orgId) } — cleaner than mutable eventWhere.orgId assignment"
metrics:
  duration: "~8 minutes"
  completed: "2026-03-11"
  tasks_completed: 2
  files_modified: 4
---

# Phase 39 Plan 04: getOrgFilter Helper + Router Audit Summary

**One-liner:** Extracted `getOrgFilter` helper to `packages/api/src/lib/auth.ts` and replaced 10 inline org-scoping patterns across events, campaigns, and analytics routers.

## What Was Built

### New Helper: `getOrgFilter`

Added to `packages/api/src/lib/auth.ts` alongside `enforceOrgAccess`:

```typescript
export function getOrgFilter(
  ctx: { user: { role: string; orgId?: string | null } | null },
  inputOrgId?: string
): { orgId?: string } {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (ctx.user.role === "CUSTOMER") {
    return { orgId: ctx.user.orgId ?? undefined };
  }
  return inputOrgId ? { orgId: inputOrgId } : {};
}
```

**Usage pattern:**
```typescript
// List procedures (e.g., events.list, campaigns.list)
const where = { ...getOrgFilter(ctx, input?.orgId), ...ACTIVE };

// listIds procedures with additional filters
const where: any = {
  ...ACTIVE,
  ...getOrgFilter(ctx, input?.orgId),
  ...(input?.search ? { name: { contains: input.search, mode: "insensitive" } } : {}),
};
```

### Routers Refactored

| Router | Procedures | Pattern Replaced |
|--------|-----------|-----------------|
| events.ts | `list`, `listIds` | Inline ternary org-scoping |
| campaigns.ts | `list`, `listIds` | Inline ternary org-scoping |
| analytics.ts | `kpis`, `tapsByDay`, `topEvents` | Mutable `eventWhere.orgId` assignment |

### Router Audit Findings

- **bands.ts**: `listAll` and `listAllIds` use nested relation filter (`event: { orgId }`) — different structure from direct orgId filter, left as-is
- **windows.ts**: No list-level org filter procedures — only `enforceOrgAccess` for entity-level checks
- **No other 3+ repeated patterns found** worth extracting — other patterns (pagination, include clauses) are sufficiently varied or single-purpose

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `getOrgFilter` exported from `packages/api/src/lib/auth.ts`
- 10 inline org-scoping patterns replaced across 3 router files
- 96 tests pass after refactor
- Pure refactor — no behavioral changes

## Self-Check: PASSED

- packages/api/src/lib/auth.ts: FOUND
- packages/api/src/routers/events.ts: FOUND
- packages/api/src/routers/campaigns.ts: FOUND
- packages/api/src/routers/analytics.ts: FOUND
- Commit 2e3a3b3 (Task 1): FOUND
- Commit c380e54 (Task 2): FOUND
