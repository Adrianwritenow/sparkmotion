---
phase: 32-soc-2-backend-compliance-hardening
plan: 01
subsystem: audit-logging
tags: [soc2, audit, trpc, auth, prisma]
dependency_graph:
  requires: []
  provides: [AuditLog schema model, tRPC mutation audit middleware, auth event audit logging]
  affects: [packages/database, packages/api, packages/auth]
tech_stack:
  added: []
  patterns: [fire-and-forget audit writes, middleware chaining, append-only audit log]
key_files:
  created: []
  modified:
    - packages/database/prisma/schema.prisma
    - packages/api/src/trpc.ts
    - packages/auth/src/auth.ts
decisions:
  - "AuditLog writes are fire-and-forget (.catch) — mutations and auth flows never block on audit I/O"
  - "rawInput not stored in audit logs — may contain passwords; only result.data captured as newValue"
  - "oldValue always null in tRPC middleware — pre-fetching old state adds latency with minimal SOC 2 benefit"
  - "Resource type derived from tRPC path prefix automatically — zero per-router instrumentation"
  - "Prisma.InputJsonValue type used for newValue — avoids unsafe casts while satisfying strict Prisma JSON types"
  - "auditLog middleware positioned after isAuthed/isAdmin in chain — captures userId from enriched ctx"
metrics:
  duration: "287 seconds"
  completed_date: "2026-02-28"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 3
---

# Phase 32 Plan 01: Audit Logging Foundation Summary

**One-liner:** AuditLog Prisma model + fire-and-forget tRPC mutation middleware + auth event logging (login success/failure/lockout) for SOC 2 immutable audit trail.

## What Was Built

### Task 1: AuditLog Prisma Model
Added `AuditLog` model to `packages/database/prisma/schema.prisma` with:
- `id`, `userId?`, `action`, `resource`, `resourceId?`, `oldValue?`, `newValue?`, `ipAddress?`, `userAgent?`, `createdAt`
- 4 indexes: `[userId]`, `[action]`, `[resource, resourceId]`, `[createdAt]`
- No `updatedAt` — audit logs are immutable append-only records
- `userId` nullable to support unauthenticated auth events (lockout without user lookup)
- Prisma client regenerated and DB confirmed in sync

### Task 2: tRPC Audit Middleware
Added `auditLog` middleware to `packages/api/src/trpc.ts`:
- Intercepts all `mutation` type calls (skips queries/subscriptions)
- Awaits `next()` then fires-and-forgets `db.auditLog.create()` — never delays mutation response
- Captures: `userId` from `ctx.user?.id`, `action` as tRPC path (e.g. `"events.create"`), `resource` from path prefix (e.g. `"Events"`), `resourceId` from `rawInput.id/eventId/userId/bandId/orgId`, `newValue` from serialized `result.data`
- `rawInput` NOT stored — may contain passwords
- `oldValue` always omitted — pre-fetching adds latency with minimal SOC 2 benefit
- All three procedure exports chain it: `publicProcedure`, `protectedProcedure`, `adminProcedure`

### Task 3: Auth Event Logging
Added 3 `db.auditLog.create()` calls to `packages/auth/src/auth.ts` authorize callback:
- **auth.lockout**: fires when `attempts >= MAX_LOGIN_ATTEMPTS` — logs `email`, `userId: null`
- **auth.login_failure**: fires after bcrypt mismatch — logs `email`, `userId`, `attemptNumber`
- **auth.login_success**: fires after `redis.del(lockoutKey)` — logs `email`, `userId`
- All calls use `.catch()` — auth flow never blocked
- No passwords or tokens in any audit log entry

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] tRPC v10 middleware uses `rawInput` not `getRawInput`**
- **Found during:** Task 2 TypeScript check
- **Issue:** Plan specified `getRawInput` as middleware parameter, but tRPC v10's `MiddlewareFunction` signature exposes `rawInput: unknown` as a direct property, not a function
- **Fix:** Changed `getRawInput` to `rawInput` in middleware destructuring; removed async wrapper around input access
- **Files modified:** `packages/api/src/trpc.ts`
- **Commit:** f91a11a

**2. [Rule 1 - Bug] Prisma `InputJsonValue` strict typing for Json? fields**
- **Found during:** Task 2 TypeScript check
- **Issue:** `Record<string, unknown>` not assignable to Prisma's `NullableJsonNullValueInput | InputJsonValue` — Prisma's JSON input type is strict and does not accept plain object types
- **Fix:** Imported `Prisma` namespace from `@sparkmotion/database` and typed `newValue` as `Prisma.InputJsonValue | undefined`; used `undefined` instead of `null` to leverage optional field behavior
- **Files modified:** `packages/api/src/trpc.ts`
- **Commit:** f91a11a

## Verification Results

1. `pnpm --filter database exec npx prisma generate` — PASSED
2. `npx tsc --noEmit --project packages/api/tsconfig.json` — PASSED (0 errors)
3. `npx tsc --noEmit --project packages/auth/tsconfig.json` — PASSED (0 errors)
4. AuditLog model confirmed with all 9 fields + 4 indexes
5. All 3 procedure types chain `auditLog` middleware
6. auth.ts has 3 `db.auditLog.create` calls: `auth.login_success`, `auth.login_failure`, `auth.lockout`

## Commits

| Hash | Message |
|------|---------|
| c87647f | feat(32-01): add AuditLog model to Prisma schema |
| f91a11a | feat(32-01): add tRPC audit middleware for all mutations |
| 00cf99c | feat(32-01): add auth event audit logging in authorize callback |
