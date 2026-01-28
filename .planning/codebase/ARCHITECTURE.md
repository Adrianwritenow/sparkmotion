# Architecture

**Analysis Date:** 2026-01-28

## Pattern Overview

**Overall:** Multi-layer, multi-tenant NFC event engagement platform with edge-optimized critical path and tRPC backend.

**Key Characteristics:**
- Three independent Next.js applications (Hub, Admin, Customer) served from monorepo
- Shared packages for API (tRPC routers), database (Prisma client), UI (shadcn components), and cache (Redis)
- Edge-optimized critical path: NFC redirect endpoint targets <50ms latency with Redis cache-aside pattern
- Multi-tenant with role-based authorization (ADMIN = global, CUSTOMER = org-scoped)
- Asynchronous analytics logging to avoid blocking high-volume tap requests

## Layers

**Presentation (Apps):**
- Purpose: User-facing Next.js applications with distinct domains
- Location: `apps/admin/`, `apps/customer/`, `apps/hub/`
- Contains: React components, Next.js pages/routes, Client Component logic
- Depends on: `@sparkmotion/api`, `@sparkmotion/ui`, `@sparkmotion/database`, `@sparkmotion/redis`
- Used by: End users (admin staff, customers), NFC wristbands (hub only)

**API Layer (tRPC):**
- Purpose: Type-safe RPC procedures for data mutations and queries
- Location: `packages/api/src/`
- Contains: tRPC routers (`events.ts`, `windows.ts`, `bands.ts`, `analytics.ts`), middleware, context setup
- Depends on: `@sparkmotion/database`, `@sparkmotion/redis`
- Used by: Admin and Customer apps via `@trpc/react-query` client

**Data Layer (Database):**
- Purpose: Single PostgreSQL database with Prisma ORM for all entities
- Location: `packages/database/`
- Contains: Prisma schema, client singleton, migrations
- Depends on: PostgreSQL (external)
- Used by: All apps, API layer, Hub app (tap logging)

**Cache Layer (Redis):**
- Purpose: Sub-10ms lookups for critical path + real-time analytics aggregation
- Location: `packages/redis/src/`
- Contains: Redis client singleton, cache operations, analytics pipeline
- Depends on: Redis (external)
- Used by: Hub app (band/event lookups, async logging), Admin/Customer analytics queries

**UI Component Library:**
- Purpose: Reusable shadcn/ui components and composed business components
- Location: `packages/ui/src/`
- Contains: shadcn primitives (from `components/ui/`), business components (EventCard, EventList, StatCard)
- Depends on: React, Tailwind CSS, shadcn/ui
- Used by: Admin and Customer apps

## Data Flow

**Critical Path (NFC Redirect):**

1. NFC band tap sends HTTP GET to Hub: `GET /e?bandId=abc123`
2. Hub endpoint (`apps/hub/src/app/e/route.ts`) processes:
   - Try Redis cache lookup: `band:abc123` (~1-5ms)
   - Cache miss → Query DB (band, event with windows) (~10-20ms)
   - Resolve current event mode (pre/live/post) from EventWindow windows
   - Build redirect URL from CachedBand.redirectUrl
   - Cache band and event status in Redis (5m/1m TTL)
3. Return 302 redirect immediately
4. Fire-and-forget async logging: `logTap()` writes to DB and Redis analytics in parallel
   - DB: Create TapLog record, update Band lastTapAt/tapCount
   - Redis: Increment counters, add to unique set via HyperLogLog

**Admin/Customer Workflows:**

1. User authentication (TODO: auth not yet wired)
2. tRPC procedure call from Client Component
3. tRPC context middleware checks user role → ADMIN or CUSTOMER (org-scoped)
4. Procedure executes query/mutation against Prisma
5. Cache invalidation on mutations: `invalidateEventCache()`, `invalidateBandCache()`
6. Response returned via React Query, component re-renders

**State Management:**

- Database: Source of truth for persistent data (organizations, events, bands, tap logs)
- Redis: Ephemeral cache and real-time analytics counters
- Component state: React hooks in Client Components (forms, dialogs, UI state)
- Query cache: React Query (`@tanstack/react-query`) manages server state client-side

## Key Abstractions

**CachedBand (cache.ts):**
- Purpose: Lightweight band record optimized for redirect endpoint
- Examples: `packages/redis/src/cache.ts`
- Pattern: Cache-aside with 5m TTL, includes: bandId, eventId, status, currentMode, redirectUrl

**CachedEventStatus (cache.ts):**
- Purpose: Pre-computed event mode + redirect URLs for fast lookups
- Examples: `packages/redis/src/cache.ts`
- Pattern: Cache-aside with 1m TTL, includes: currentMode, activeWindowId, pre/live/postUrl

**EventWindow (Prisma model):**
- Purpose: Represents time-based or manual mode windows for an event
- Examples: `packages/database/prisma/schema.prisma`
- Pattern: Multiple windows per event, prioritized by isActive flag and windowType (PRE, LIVE, POST)

**tRPC Routers:**
- Purpose: Grouped procedures organized by domain (events, windows, bands, analytics)
- Examples: `packages/api/src/routers/events.ts`, `packages/api/src/routers/windows.ts`, `packages/api/src/routers/bands.ts`, `packages/api/src/routers/analytics.ts`
- Pattern: Modular routers composed in `appRouter` (`packages/api/src/root.ts`)

**Role-Based Middleware:**
- Purpose: Authorization checks at procedure level
- Examples: `packages/api/src/trpc.ts` (protectedProcedure, adminProcedure, customerProcedure)
- Pattern: tRPC middleware stack validates user.role before execution

## Entry Points

**Hub App (Critical Path):**
- Location: `apps/hub/src/app/e/route.ts`
- Triggers: GET request with `?bandId` query param from NFC readers
- Responsibilities: Cache lookup, DB fallback, mode resolution, 302 redirect, async tap logging

**Admin App:**
- Location: `apps/admin/src/app/page.tsx` (home), `apps/admin/src/app/api/trpc/[trpc]/route.ts` (API)
- Triggers: User visits `admin.sparkmotion.net`, clicks actions
- Responsibilities: Org/event management (ADMIN role), user interface

**Customer App:**
- Location: `apps/customer/src/app/page.tsx` (home), `apps/customer/src/app/api/trpc/[trpc]/route.ts` (API)
- Triggers: User visits `app.sparkmotion.net` (org-scoped), clicks actions
- Responsibilities: Event management (CUSTOMER role, org-scoped), analytics, band upload

**tRPC API Handler:**
- Location: `apps/*/src/app/api/trpc/[trpc]/route.ts`
- Triggers: POST/GET to `/api/trpc/[procedure]`
- Responsibilities: Route tRPC calls to appRouter procedures, handle serialization/deserialization

## Error Handling

**Strategy:** Throw TRPCError with standardized codes; clients handle display via shadcn Alert.

**Patterns:**

- **Authorization errors:** `throw new TRPCError({ code: 'UNAUTHORIZED' })` or `FORBIDDEN`
- **Not found:** `db.event.findUniqueOrThrow()` throws if missing
- **Validation errors:** Zod schema validation fails before procedure runs
- **Redirect endpoint failures:** Return NextResponse with JSON error + status code (400, 403, 404, 500)
- **Async logging failures:** Caught and swallowed (fire-and-forget via `.catch()`)

## Cross-Cutting Concerns

**Logging:**
- Synchronous: `console.error()` for critical failures
- Asynchronous: `recordTap()` writes to Redis and DB in parallel
- No structured logging library configured

**Validation:**
- tRPC: Zod schemas validate input before mutation/query execution
- Database: Prisma schema enforces unique constraints, foreign keys, enums
- API: Input validation on all public endpoints

**Authentication:**
- Currently: Disabled (TODO comment in `apps/admin/src/app/api/trpc/[trpc]/route.ts`)
- Future: Context middleware will populate ctx.user from session/token
- Authorization: Role-based middleware in `packages/api/src/trpc.ts` checks ctx.user.role

**Caching Invalidation:**
- On event updates: Call `invalidateEventCache(eventId)` to purge `event:{eventId}:status`
- On band updates: Call `invalidateBandCache(bandId)` to purge `band:{bandId}`
- Manual windows: Changes trigger event cache invalidation
- TTL-based: Automatic expiry (5m bands, 1m event status) for stale data

**Performance Optimization (Critical Path):**
- Redis cache-aside: Check cache before DB query
- Async logging: Fire-and-forget with Promise.all() to parallelize DB + Redis writes
- No blocking operations in redirect endpoint
- Edge runtime (commented in code, should be enabled): Run critical path at edge location

---

*Architecture analysis: 2026-01-28*
