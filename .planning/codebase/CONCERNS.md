# Codebase Concerns

**Analysis Date:** 2026-01-28

## Critical: Missing Authentication Implementation

**Issue:** Authentication context is completely stubbed

**Files:**
- `apps/admin/src/app/api/trpc/[trpc]/route.ts` (line 11)
- `apps/customer/src/app/api/trpc/[trpc]/route.ts` (line 11)

**Impact:** All API endpoints receive `user: null` context. This means:
- Authorization checks in `adminProcedure` and `customerProcedure` will ALWAYS fail with FORBIDDEN
- No admin features work (create events, manage windows, upload bands)
- No customer features work (view scoped events, edit organization)
- All protectedProcedure calls fail UNAUTHORIZED
- No role-based access control enforcement

**Symptoms:** Any API call returns TRPCError with FORBIDDEN or UNAUTHORIZED

**Trigger:** Call any protectedProcedure or adminProcedure endpoint

**Workaround:** None - requires auth implementation

**Fix Approach:**
1. Implement authentication provider (NextAuth.js or similar per CLAUDE.md hints in env template)
2. Extract user from request context in both trpc routes
3. Pass real user object to createContext
4. Test with both ADMIN and CUSTOMER roles

**Priority:** CRITICAL - Blocks all feature testing

---

## High: Race Condition in Band First Tap Tracking

**Issue:** `firstTapAt` logic is incomplete

**Files:** `apps/hub/src/app/e/route.ts` (line 157)

**Code:**
```typescript
data: {
  lastTapAt: new Date(),
  tapCount: { increment: 1 },
  firstTapAt: undefined, // Prisma will only set if null via a raw query — we'll handle this simply
}
```

**Problem:** Comment indicates incomplete implementation. `firstTapAt` is set to `undefined`, which will not update the field. A band that has already been tapped will not record the first tap time correctly.

**Fix Approach:**
```typescript
// Option 1: Set only on first tap (requires query first)
const band = await db.band.findUnique({ where: { bandId } });
const data = {
  lastTapAt: new Date(),
  tapCount: { increment: 1 },
  ...(band.firstTapAt === null && { firstTapAt: new Date() }),
};

// Option 2: Use Prisma raw SQL for conditional update
// UPDATE band SET firstTapAt = COALESCE(firstTapAt, NOW()) WHERE bandId = ?
```

**Impact:** Analytics cannot accurately determine first engagement time per band

**Priority:** HIGH - Affects analytics accuracy

---

## High: Event Status Resolution Not Cached in Critical Path

**Issue:** `resolveEventStatus()` does cache but performs expensive queries on miss

**Files:** `apps/hub/src/app/e/route.ts` (lines 67-120)

**Problem:** On cache miss (TTL 60 seconds), the redirect endpoint:
1. Queries event with windows
2. If no active windows, queries ALL scheduled windows again with DB lookup
3. This creates multiple database queries during peak traffic

**Current Flow:**
- Check active windows (isActive=true)
- If none, query scheduled windows again with date range filter
- Then make cache

**Scaling Impact:** At 5,000 req/s with 60-second cache TTL, peak miss rate during events could cause 83 req/s hitting DB. With poor timezone handling or window scheduling, this could spike higher.

**Fix Approach:**
1. Consolidate window queries - fetch all windows in one query
2. Filter in application (or with calculated field)
3. Consider longer TTL for pre-event windows (they don't change often)
4. Add metrics/monitoring for cache hit rate

**Priority:** HIGH - Latency risk at scale

---

## High: Missing Error Handling in Async Log Operation

**Issue:** Logging failures are silently swallowed

**Files:** `apps/hub/src/app/e/route.ts` (line 57)

**Code:**
```typescript
logTap(bandData, request).catch(() => {});
```

**Problem:**
- Database write failures are not logged
- Analytics data is lost silently
- No way to detect if tap logging is degrading

**Impact:**
- Silent data loss during DB issues or connection failures
- Analytics become incomplete without operator knowing
- Difficult to debug in production

**Fix Approach:**
```typescript
logTap(bandData, request).catch((error) => {
  // Log to error tracking (e.g., Sentry)
  console.error('Tap logging failed:', { bandId: bandData.bandId, error });
  // Track as metric
  metrics.increment('redirect.tap_log_failed');
});
```

**Priority:** HIGH - Data integrity concern

---

## High: Blocking Database Update in Redirect Path

**Issue:** Band update runs synchronously in critical path

**Files:** `apps/hub/src/app/e/route.ts` (lines 141-161)

**Code:**
```typescript
await Promise.all([
  db.tapLog.create({ ... }),        // INSERT tap_log
  db.band.update({ ... }),          // UPDATE band SET tapCount
  recordTap(bandData.eventId, ...),  // UPDATE Redis
]);
```

**Problem:** All three operations run in parallel but ARE awaited before redirect. If band update is slow (lock contention, index update), the redirect latency exceeds SLA:
- Critical path requirement: <50ms
- Database updates during load can spike to 100-500ms

**Violation of instruction:** CLAUDE.md explicitly states: "NEVER block redirects with: Synchronous DB writes"

**Fix Approach:**
```typescript
// Redirect immediately
const redirectPromise = NextResponse.redirect(bandData.redirectUrl, 302);

// Log tap asynchronously (truly fire-and-forget)
logTap(bandData, request).catch(console.error);

return redirectPromise;
```

**Priority:** CRITICAL - Violates performance SLA

---

## High: No Validation of Event URLs

**Issue:** URLs stored in database without validation

**Files:**
- `packages/api/src/routers/events.ts` (lines 37-39)
- `packages/database/prisma/schema.prisma` (lines 86-88)

**Problem:**
- URLs are validated as `.url()` in Zod schema
- But no format validation on update (could become invalid after event creation)
- Malformed URLs will cause redirect failures but won't be caught until tap time

**Code:**
```typescript
return db.event.create({
  data: input  // Direct insert of user input
});
```

**Impact:** Silent redirect failures if URL becomes malformed

**Fix Approach:**
1. Add database constraint or trigger to validate URL format
2. Add pre-tap validation: check URL is valid HTTP/HTTPS before redirect
3. Log invalid URLs for operator investigation

**Priority:** MEDIUM - Customer impact but workaround available

---

## Medium: Admin Procedures Lack Organization Scoping

**Issue:** Admin procedures don't validate org membership

**Files:** `packages/api/src/routers/events.ts` (lines 30-44)

**Code:**
```typescript
create: adminProcedure
  .input(z.object({
    orgId: z.string(),
    name: z.string().min(1),
    // ...
  }))
  .mutation(async ({ input }) => {
    return db.event.create({ data: input });
  }),
```

**Problem:** ADMIN role can create events in ANY organization (orgId passed as input). If auth is implemented without additional org checks, admins can interfere with other organizations' data.

**Fix Approach:**
Add organization validation:
```typescript
const isOrgMember = await db.orgUser.findFirst({
  where: { userId: ctx.user.id, orgId: input.orgId }
});
if (!isOrgMember) throw new TRPCError({ code: 'FORBIDDEN' });
```

**Priority:** MEDIUM - Security concern post-auth implementation

---

## Medium: No TTL/Expiration on Tap Logs

**Issue:** Tap logs accumulate indefinitely

**Files:**
- `packages/database/prisma/schema.prisma` (lines 140-157)
- `packages/api/src/routers/analytics.ts` (lines 24-34)

**Problem:** TapLog table has no automatic cleanup. After 100k users × 5,000 req/s for months:
- Table could have billions of rows
- Disk usage grows unbounded
- Analytics queries slow down (scanning millions of records)
- Backup/restore times become problematic

**Scale Example:**
- 100k users, 5,000 req/s avg = 432M taps/day
- 90 days = 38.88B tap logs
- At ~200 bytes per log = ~7.77TB

**Fix Approach:**
1. Add archival strategy: move logs older than N days to cold storage
2. Add database PARTITION BY tappedAt for faster pruning
3. Consider aggregate summaries: hourly/daily tap counts instead of individual logs
4. Implement TTL policy in deployment

**Priority:** MEDIUM - Becomes CRITICAL after 30 days of production traffic

---

## Medium: Redis Connection Not Validated at Startup

**Issue:** Redis client lazy-connects but failures not detected

**Files:** `packages/redis/src/client.ts` (lines 9-12)

**Code:**
```typescript
new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
})
```

**Problem:**
- `lazyConnect: true` delays connection until first command
- If Redis is down at startup, app starts successfully
- First redirect attempt fails with connection error
- No pre-flight health check

**Fix Approach:**
```typescript
const redis = new Redis(process.env.REDIS_URL, { /* ... */ });

// In app startup/health check:
redis.ping().catch(() => {
  throw new Error('Redis connection failed at startup');
});
```

**Priority:** MEDIUM - Improves observability

---

## Medium: Cache Invalidation Not Cascaded

**Issue:** Related caches invalidate independently

**Files:**
- `packages/api/src/routers/events.ts` (lines 62, 70)
- `packages/api/src/routers/windows.ts` (lines 28, 39, 47)

**Problem:** When an event window is updated:
- Event cache is invalidated
- Band cache is NOT invalidated
- Bands may still have old redirect URLs in cache for up to 5 minutes

**Scenario:**
1. Event scheduled for 3:00pm LIVE
2. Window created, event cache cleared
3. Band taps at 2:59pm, caches redirect URL
4. Admin changes window time to 4:00pm, event cache cleared
5. Band taps at 3:00pm, gets PRE mode from old cache (should be LIVE)

**Fix Approach:**
Implement cascading invalidation:
```typescript
async function invalidateEventAndBands(eventId: string) {
  const bands = await db.band.findMany({ where: { eventId }, select: { bandId: true } });
  await Promise.all([
    invalidateEventCache(eventId),
    ...bands.map(b => invalidateBandCache(b.bandId)),
  ]);
}
```

**Priority:** MEDIUM - Affects mode accuracy during window changes

---

## Medium: Missing Input Validation on Batch Band Upload

**Issue:** Large batch operations not fully validated

**Files:** `packages/api/src/routers/bands.ts` (lines 23-37)

**Code:**
```typescript
uploadBatch: adminProcedure
  .input(z.object({
    eventId: z.string(),
    bandIds: z.array(z.string()).min(1).max(10000),
  }))
  .mutation(async ({ input }) => {
    const data = input.bandIds.map((bandId) => ({
      bandId,
      eventId: input.eventId,
    }));
    return db.band.createMany({ data, skipDuplicates: true });
  }),
```

**Problem:**
- Band IDs not validated for format (could be empty strings, whitespace)
- No checking if eventId exists
- `skipDuplicates` silently ignores existing bands (unclear to user how many actually created)
- No transaction: could partially fail mid-batch with no rollback

**Fix Approach:**
```typescript
.input(z.object({
  eventId: z.string().cuid(),
  bandIds: z.array(z.string().min(1).trim()).min(1).max(10000),
}))
.mutation(async ({ input }) => {
  // Verify event exists
  const event = await db.event.findUnique({ where: { id: input.eventId } });
  if (!event) throw new TRPCError({ code: 'NOT_FOUND' });

  // Deduped band IDs
  const unique = new Set(input.bandIds);

  // Use transaction for atomicity
  const result = await db.$transaction(async (tx) => {
    return tx.band.createMany({ data: [...unique].map(bandId => ...) });
  });

  return result;
})
```

**Priority:** MEDIUM - Data quality issue

---

## Medium: No Graceful Degradation for Slow Database

**Issue:** No fallback strategy if database queries timeout

**Files:** `apps/hub/src/app/e/route.ts` (lines 20-65)

**Problem:** If Prisma query takes >10 seconds (lock, timeout), entire request fails:
```typescript
let band = await getCachedBand(bandId);
if (!band) {
  let band = await db.band.findUnique({ ... }); // Could timeout
}
```

**Impact:**
- No redirect served if database is slow
- User sees no redirect (not even a default fallback)
- At scale, cascading timeouts could fail 5,000 req/s

**Fix Approach:**
```typescript
try {
  bandData = await getCachedBand(bandId);
} catch (error) {
  // Timeout - use fallback
  return NextResponse.redirect(process.env.FALLBACK_URL || 'https://error.example.com', 302);
}
```

**Priority:** MEDIUM - Resilience improvement

---

## Low: Incomplete Authorization in Event Queries

**Issue:** Customer list query doesn't enforce organization scope

**Files:** `packages/api/src/routers/events.ts` (lines 7-19)

**Code:**
```typescript
list: protectedProcedure
  .input(z.object({ orgId: z.string().optional() }).optional())
  .query(async ({ ctx, input }) => {
    const where =
      ctx.user.role === "ADMIN"
        ? input?.orgId ? { orgId: input.orgId } : {}
        : undefined; // customer scoping handled at app level
```

**Problem:** Customer authorization is deferred to "app level" but no mention of where this happens. Comment is vague. Customer could theoretically construct query with orgId parameter and bypass org scoping.

**Fix Approach:**
Enforce scoping in procedure:
```typescript
const where =
  ctx.user.role === "ADMIN"
    ? input?.orgId ? { orgId: input.orgId } : {}
    : { orgId: ctx.user.orgId }; // Enforce customer org
```

**Priority:** LOW - Caught at presentation layer but should be at API boundary

---

## Low: No Database Connection Pooling Configuration

**Issue:** Prisma uses default pool settings

**Files:** `packages/database/src/index.ts`

**Problem:** No explicit pool configuration means default Prisma pool (10 connections). Under 5,000 req/s:
- Could exhaust connection pool
- Requests queue and timeout
- No indication of pool exhaustion

**Fix Approach:**
Add to DATABASE_URL:
```
postgresql://user:pass@host/db?schema=public&pool_size=20&connection_limit=25
```

Or configure in Prisma client constructor via middleware.

**Priority:** LOW - Becomes issue at production scale (>1k concurrent requests)

---

## Low: TapLog Queries Lack Pagination Limits

**Issue:** Analytics queries scan unbounded

**Files:** `packages/api/src/routers/analytics.ts` (lines 13-22)

**Code:**
```typescript
tapsByHour: protectedProcedure
  .input(z.object({ eventId: z.string(), hours: z.number().min(1).max(168).default(24) }))
  .query(async ({ input }) => {
    const since = new Date(Date.now() - input.hours * 60 * 60 * 1000);
    return db.tapLog.groupBy({
      by: ["modeServed"],
      where: { eventId: input.eventId, tappedAt: { gte: since } },
      _count: true,
    });
  }),
```

**Problem:** groupBy on potentially millions of tap logs. At 100k events + 400M taps, a 168-hour query scans massive dataset. DB could spike to high load.

**Fix Approach:**
1. Pre-aggregate hourly stats in Redis/separate table
2. Store summary statistics, not individual logs
3. Implement materialized views for analytics

**Priority:** LOW - Acceptable for now, becomes issue post-launch

---

## Low: Missing Environment Variable Validation

**Issue:** No schema validation for required env vars at startup

**Files:**
- `.env.template`
- `.env.example`

**Problem:** Missing env vars like `DATABASE_URL` or `REDIS_URL` cause silent failures at runtime rather than startup.

**Fix Approach:**
Create `packages/config/env.ts`:
```typescript
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(32),
  NODE_ENV: z.enum(['development', 'production']),
});

export const env = envSchema.parse(process.env);
```

Import in entry points to validate at startup.

**Priority:** LOW - Improves DX but not critical

---

## Low: No Metrics/Observability for Redirect Performance

**Issue:** No latency tracking or error rate monitoring

**Files:** `apps/hub/src/app/e/route.ts`

**Problem:** Cannot measure if <50ms SLA is maintained. Cannot detect:
- Cache hit rate
- Database query latency
- Failed redirects
- Mode distribution

**Fix Approach:**
Add metrics collection:
```typescript
const startTime = performance.now();

try {
  // ... logic
  const duration = performance.now() - startTime;
  metrics.histogram('redirect.latency_ms', duration);
  metrics.increment('redirect.success');
} catch (error) {
  metrics.increment('redirect.error', { code: error.code });
}
```

**Priority:** LOW - Quality of life, but important post-launch for monitoring

---

## Summary: Priority by Deadline Impact

**CRITICAL (Before Feb 27):**
- Missing authentication implementation (blocks all features)
- Blocking DB updates in redirect path (violates SLA)

**HIGH (Target before first production test):**
- Race condition in firstTapAt tracking
- Event status cache miss performance
- Async log error swallowing
- URL validation

**MEDIUM (Before load testing):**
- Admin organization scoping
- Tap log accumulation strategy
- Redis connection validation
- Cache invalidation cascading
- Batch upload validation
- Database graceful degradation

**LOW (Post-launch iteration):**
- Customer org scoping in query
- Connection pooling
- Analytics pagination
- Environment validation
- Metrics collection
