# SparkMotion System Walkthrough

Technical end-to-end walkthrough of every major flow in the system. Covers what calls what, where data lives, and how features work at the system level.

---

## System Architecture

```
                        NFC Tap
                          |
                *.sparkmotion.net/e?bandId=XXX
                          |
              +-----------+-----------+
              |                       |
     Cloudflare Worker          (KV miss)
     apps/redirect/              proxy
     src/worker.ts                |
              |                   v
         KV lookup          Hub /e route
         REDIRECT_MAP       apps/hub/src/app/e/route.ts
              |                   |
         HIT (<15ms)         Redis cache -> DB fallback
              |              GeoIP auto-assign
         302 redirect        Cache result -> KV + Redis
              |                   |
         waitUntil:          302 redirect
         7 Upstash              |
         Redis cmds          waitUntil:
         (analytics)         recordTap() -> Redis
                             LPUSH tap-log:pending
                                  |
                          flush-taps cron (1min)
                          Lua LRANGE+LTRIM
                          Batch INSERT -> PostgreSQL
```

**Three runtimes:**

| Runtime | App | Purpose |
|---------|-----|---------|
| Cloudflare Worker | `apps/redirect` | Edge KV lookup, <15ms redirects, async analytics |
| Vercel Serverless (Node.js) | `apps/hub` | DB/Redis access, auto-assignment, crons |
| Vercel Serverless (Node.js) | `apps/admin`, `apps/customer` | Dashboards, tRPC API |

**Shared packages:**

| Package | Used By | Purpose |
|---------|---------|---------|
| `packages/api` | admin, customer, hub | tRPC routers (8 routers, ~50 procedures) |
| `packages/auth` | admin, customer | NextAuth v5 JWT session, credentials provider |
| `packages/database` | admin, customer, hub, api | Prisma client + schema |
| `packages/redis` | admin, customer, hub, api | ioredis client + cache/analytics helpers |
| `packages/ui` | admin, customer | shadcn components + custom business components |

---

## Flow 1: NFC Tap Redirect (Critical Path)

The most important flow. A person taps their NFC wristband against a phone.

### Step 1: Cloudflare Worker (`apps/redirect/src/worker.ts`)

```
GET https://compassion.sparkmotion.net/e?bandId=ABC123
```

1. Route guard: only `/e` and `/health` are valid paths
2. Extract `bandId` from query string (400 if missing)
3. **KV lookup:** `env.REDIRECT_MAP.get(bandId, "json")`
   - KV entry shape: `{ url: string, eventId: string, mode: "pre"|"live"|"post" }`
   - KV is globally replicated across Cloudflare's 300+ edge locations

**KV HIT (99% of live-event taps):**
4. Append any incoming UTM params to `entry.url`
5. Return `302 redirect` immediately
6. `ctx.waitUntil(logTap(...))` — fire-and-forget analytics (see Flow 5)

**KV MISS (first tap, new band, stale KV):**
4. Extract `orgSlug` from subdomain (`compassion.sparkmotion.net` -> `compassion`)
5. Proxy to Hub: `fetch(HUB_URL + /e?bandId=...&orgSlug=...)` with `redirect: "manual"`
   - Forwards geo headers: `x-real-latitude`, `x-real-longitude` (from `request.cf`)
   - Forwards `x-forwarded-for` (from `cf-connecting-ip`) and `user-agent`
6. Hub returns a 3xx, Worker passes it through to client
7. On Hub failure: `302` to `FALLBACK_URL` (sparkmotion.net)

### Step 2: Hub Redirect Handler (`apps/hub/src/app/e/route.ts`)

Only reached on KV miss. This is a Vercel serverless function (Node.js runtime, not Edge — needed for ioredis + Prisma).

1. **Redis cache check:** `getCachedBand(bandId)` — reads `band:{bandId}` key (1-min TTL)
   - HIT: skip to step 5
   - MISS: continue

2. **DB lookup:** `db.band.findMany({ where: { bandId }, include: { event: { include: { windows: { where: { isActive: true } } } } } })`

3. **Band resolution:**
   - **Single-event band:** Use directly. Cache via `setCachedBand()` (fire-and-forget)
   - **Multi-event band:** Raw SQL `earth_distance` query against only that band's events to find nearest by geo. **Never cached** (routing must run fresh)
   - **Band not found:** Trigger auto-assignment (see Flow 2)

4. **Determine redirect URL:** `activeWindow.url ?? event.fallbackUrl`
   - Window priority: the first active window found
   - Mode derived from `window.windowType` (PRE/LIVE/POST) or "FALLBACK" if no active window

5. **Build final URL** — append UTM params if present

6. **Fire-and-forget analytics** (via `waitUntil` from `@vercel/functions`):
   - `recordTap(eventId, bandId, mode)` — 6 Redis counter commands (see Flow 5)
   - `redis.lpush("tap-log:pending", JSON.stringify({...}))` — queue for batch DB flush

7. **Return** `302 redirect`

---

## Flow 2: Band Auto-Assignment

Triggered when a bandId is tapped that doesn't exist in the DB. The system creates a Band record and assigns it to the nearest event.

**Location:** `apps/hub/src/app/e/route.ts` (inside the redirect handler)

1. **Extract org slug** from subdomain (`compassion.sparkmotion.net` -> `compassion`) or `?orgSlug=` param (for dev/preview)
2. **Lookup org:** `db.organization.findUnique({ where: { slug } })`
   - No org found (bare localhost/Vercel preview): redirect to `https://sparkmotion.net`
3. **GeoIP routing** (if geo headers present from Cloudflare):
   - Raw SQL `earth_distance(ll_to_earth(lat, lng), ll_to_earth(event.lat, event.lng))` against all org events
   - Picks nearest event that has future windows
   - Requires PostgreSQL `cube` + `earthdistance` extensions
4. **Fallback** (no geo): pick event with the most windows, then oldest `createdAt`
5. **Create band:** `db.band.create({ data: { bandId, eventId, autoAssigned: true } })`
   - Catches Prisma P2002 (unique constraint race) and falls back to `findFirst`
6. **No events in org:** redirect to `org.websiteUrl` or return 404

---

## Flow 3: Window Scheduling

Each event has up to 3 windows (PRE/LIVE/POST), each with a URL, start time, and end time. Only one window can be active at a time. The active window determines where taps redirect.

### Manual Mode (`scheduleMode: false`)

- User toggles windows on/off via the dashboard
- `windows.toggle` tRPC mutation:
  1. If activating: deactivates all sibling windows first (single-active constraint)
  2. Toggles the target window
  3. Also sets `event.scheduleMode = false` (manual override disables auto-scheduling)
  4. All in one DB transaction
  5. Calls `invalidateEventCache(eventId)` fire-and-forget

### Schedule Mode (`scheduleMode: true`)

- User sets start/end times on each window
- System auto-activates/deactivates based on current time

**Evaluation function:** `evaluateEventSchedule(tx, eventId, timezone)` (`packages/api/src/services/evaluate-schedule.ts`)

1. Fetch all windows for the event ordered by `createdAt`
2. Get current time in the event's timezone (using `@date-fns/tz`)
3. Find the first window where `now >= startTime && now < endTime + 1 minute`
4. If the active window hasn't changed, return `{ changed: false }` (idempotent)
5. If changed: `updateMany` to deactivate all, then `update` to activate the matching one
6. Returns `{ changed: true, activeWindowId }`

**Called by:**
- `windows.list` query (on-demand check when fetching windows in schedule mode)
- `windows.create` / `windows.update` mutations (inside their DB transactions)
- `events.toggleScheduleMode` mutation (when enabling schedule mode)
- `updateEventWindows()` cron service (every minute)

### Window State -> KV Sync

When window state changes, two things happen:

1. **Redis invalidation:** `invalidateEventCache(eventId)` — deletes `event:{eventId}:status` key so the Hub re-evaluates on next tap
2. **Cloudflare KV regeneration:** `generateRedirectMap({ eventIds: [...] })` — bulk-writes fresh `bandId -> { url, eventId, mode }` entries to KV

**KV generation** (`packages/api/src/services/redirect-map-generator.ts`):
1. Fetch ACTIVE events (optionally scoped to specific IDs)
2. For each event: get active window URL (or fallbackUrl), get all bands
3. Build entries: `{ key: bandId, value: JSON.stringify({ url, eventId, mode }) }`
4. Batch write to Cloudflare KV via REST API (PUT, 10,000 entries per batch)
5. Uses `CF_ACCOUNT_ID`, `CF_API_TOKEN`, `CF_KV_NAMESPACE_ID` env vars

---

## Flow 4: Cron Jobs

Both run every minute via Vercel Cron (`apps/hub/vercel.json`). Both require `CRON_SECRET` Bearer token auth. Both have `maxDuration = 60` seconds.

### flush-taps (`/api/cron/flush-taps`)

Drains the `tap-log:pending` Redis list into PostgreSQL. This is the bridge between the real-time Redis analytics layer and the durable PostgreSQL storage.

**File:** `apps/hub/src/app/api/cron/flush-taps/route.ts`

1. **Atomic drain via Lua script:**
   ```lua
   local items = redis.call('LRANGE', KEYS[1], 0, ARGV[1] - 1)
   if #items > 0 then redis.call('LTRIM', KEYS[1], #items, -1) end
   return items
   ```
   - `LRANGE` + `LTRIM` in a single `EVAL` prevents race conditions if two cron invocations overlap
   - Batch size: 10,000 items per iteration

2. **Backlog check:** Reads `LLEN` before draining. Logs `CRITICAL` if backlog exceeds 500K items (~2 minutes of peak traffic).

3. **Loop** until list is empty or 50 seconds elapsed (10s safety margin before `maxDuration`)

4. **Per batch:**
   - Parse JSON tap records from the Lua result
   - Resolve NFC `bandId` strings to internal Prisma CUIDs via `db.band.findMany`
   - Drop unknown bands with a warning

5. **DB transaction:**
   - `db.tapLog.createMany({ data: tapLogData })` — bulk insert
   - `db.$executeRaw` with `unnest()` arrays — batch update `tapCount` + `GREATEST(lastTapAt, ...)` on all affected bands
   - `db.$executeRaw` with `unnest()` — set `firstTapAt` only where currently NULL

6. **Error recovery:** Each batch's DB operations are wrapped in try/catch. On failure, the drained items are re-queued back to Redis via `RPUSH` pipeline so they're retried next cycle instead of lost.

7. **Returns:** `{ success, flushed, batches, failedBatches, remaining, durationMs }`

### update-windows (`/api/cron/update-windows`)

Auto-activates/deactivates windows for all scheduled events.

**File:** `apps/hub/src/app/api/cron/update-windows/route.ts`

1. Delegates to `updateEventWindows()` (`packages/api/src/services/window-scheduler.ts`)
2. Fetches all events with `scheduleMode: true`
3. Calls `evaluateEventSchedule()` for each event
4. For events where state changed:
   - `invalidateEventCache(eventId)` via `Promise.allSettled` (Redis)
   - `generateRedirectMap({ eventIds: [...] })` — **fire-and-forget** (not awaited, prevents cron timeout when multiple events change simultaneously)
5. **Returns:** `{ success, eventsProcessed, eventsChanged }`

---

## Flow 5: Analytics Pipeline

Analytics data flows through two paths: real-time Redis counters (for live dashboards) and durable PostgreSQL records (for historical queries).

### Write Path (on every tap)

**From Cloudflare Worker** (`apps/redirect/src/worker.ts` → `logTap()`):

7 Upstash Redis commands sent as a single pipelined HTTP request via `ctx.waitUntil`:

| # | Command | Key | Purpose |
|---|---------|-----|---------|
| 1 | `INCR` | `analytics:{eventId}:taps:total` | Running total |
| 2 | `PFADD` | `analytics:{eventId}:taps:unique` | HyperLogLog unique bands |
| 3 | `INCR` | `analytics:{eventId}:taps:hourly:{YYYY-MM-DDTHH}` | Hourly bucket |
| 4 | `INCR` | `analytics:{eventId}:mode:{mode}` | Per-mode counter |
| 5 | `INCR` | `analytics:{eventId}:velocity:{bucket}` | 10-sec velocity bucket |
| 6 | `EXPIRE` | `analytics:{eventId}:velocity:{bucket}` | 30-min TTL on velocity |
| 7 | `LPUSH` | `tap-log:pending` | Queue for batch flush |

**From Hub** (`apps/hub/src/app/e/route.ts` → `recordTap()` from `@sparkmotion/redis`):

6 ioredis pipelined commands (same as above minus the LPUSH — Hub does its own LPUSH separately). Also fires via `waitUntil`.

**Batch flush to PostgreSQL** — handled by the `flush-taps` cron (see Flow 4).

### Read Path (dashboards)

**Real-time (Redis):**
- `analytics.live` query → `getAnalytics(eventId)` — reads `taps:total` (GET), `taps:unique` (PFCOUNT), plus per-mode counters
- `analytics.velocityHistory` query → `getVelocityHistory(eventId)` — reads last 180 velocity buckets (30 min of 10-sec granularity)
- `analytics.tapsByHour` query → `getHourlyAnalytics(eventId, hours)` — reads hourly bucket counters

**Historical (PostgreSQL via raw SQL):**
- `analytics.kpis` — total taps, distinct bands, peak TPM, band activity %, mode distribution
- `analytics.tapsByDay` — `DATE_TRUNC('day', "tappedAt")` for trend charts
- `analytics.topEvents` — top 10 by tap count with JOIN to Event table
- `analytics.cohortRetention` — CTE-based Day 1/3/7/14/30 retention analysis
- `analytics.compareEvents` — side-by-side event comparison with correlated subqueries for peak TPM
- `analytics.exportTaps` — raw export up to 50K rows

### Live Dashboard SSE

The analytics page uses a `useEventStream` hook (client-side) that opens a Server-Sent Events connection. When a mode change is detected, a toast notification fires. Velocity sparkline polls every 10 seconds via tRPC.

---

## Flow 6: Authentication & Cross-Login

### Auth Architecture

- **Strategy:** JWT (no DB sessions) via NextAuth v5 (`next-auth@5.0.0-beta.25`)
- **Provider:** Credentials only (email + bcrypt password)
- **Session shape:** `{ user: { id, email, name, role: ADMIN|CUSTOMER, orgId } }` encoded in a signed cookie
- **Cookie prefix:** `admin-auth` (admin app) / `customer-auth` (customer app) — allows both sessions to coexist in the browser

**Auth package** (`packages/auth`):
- `auth.config.ts` — edge-safe config (no DB imports), used by middleware for fast JWT decode
- `auth.ts` — full config with Credentials provider, calls `db.user.findUnique` + `bcrypt.compare`
- Exports: `auth`, `signIn`, `signOut`, `handlers`

### Middleware (per-app)

Each app has `src/middleware.ts` that runs on the Vercel Edge:
1. Decode the JWT from the session cookie (using the edge-safe `authConfig`)
2. **Admin app:** if role !== ADMIN, redirect to `/auth/signin`
3. **Customer app:** if role !== CUSTOMER, redirect to admin app + delete session cookies

### Cross-Login Flow

When an ADMIN user logs into the customer app (port 3001):

```
1. User enters email/password on customer /auth/signin
2. NextAuth credentials provider authenticates -> JWT has role=ADMIN
3. Sign-in page detects role=ADMIN
4. Redirects to /api/auth/transfer-token (customer app)
5. transfer-token route:
   a. Verifies caller is ADMIN
   b. Creates a 30-second JWT (signed with AUTH_SECRET + salt "cross-login-transfer")
   c. Deletes customer session cookies
   d. Redirects to ADMIN_URL/api/auth/cross-login?token=<jwt>
6. cross-login route (admin app):
   a. Verifies JWT signature and expiry
   b. Confirms role=ADMIN in token payload
   c. Mints a full admin session cookie
   d. Redirects to /
```

---

## Flow 7: Cache Invalidation

Three cache layers, each with different invalidation triggers:

### Redis Band Cache (`band:{bandId}`, 1-min TTL)

- **Set by:** Hub redirect handler on DB lookup (single-event bands only)
- **Read by:** Hub redirect handler (step 1 before DB)
- **Invalidated by:** TTL expiry only (no explicit invalidation on window changes — 1-min TTL keeps staleness bounded)

### Redis Event Status Cache (`event:{eventId}:status`, 1-min TTL)

- **Set by:** Hub redirect handler (caches current mode + URL)
- **Read by:** Hub redirect handler
- **Invalidated by:** `invalidateEventCache(eventId)` — called by:
  - `events.update`, `events.delete`, `events.toggleScheduleMode`
  - `windows.toggle`, `windows.create`, `windows.update`, `windows.delete`, `windows.upsertFallback`
  - `updateEventWindows()` cron (for events whose window state changed)

### Cloudflare KV (`REDIRECT_MAP`, no TTL)

- **Written by:** `generateRedirectMap()` — bulk PUT via Cloudflare API
- **Read by:** Cloudflare Worker on every tap
- **Regenerated by:**
  - `windows.list` query (when schedule mode evaluation detects a change)
  - `windows.create`, `windows.update` mutations
  - `updateEventWindows()` cron
  - `infrastructure.refreshMap` admin mutation (manual "Force Refresh" button)
- **Metadata tracked in Redis:** `redirect-map:meta` key stores `{ lastRefreshed, bandCount, sizeBytes }`

---

## Flow 8: tRPC API Layer

All API logic lives in `packages/api/src/routers/`. Every procedure requires authentication — no public endpoints.

### Router Map

| Router | Procedures | Auth | Key Operations |
|--------|-----------|------|----------------|
| `events` | 6 (list, byId, create, update, toggleScheduleMode, delete) | protected | CRUD + schedule toggle, raw SQL for tap stats |
| `windows` | 6 (list, create, toggle, update, upsertFallback, delete) | protected | Single-active constraint, overlap validation, KV sync |
| `bands` | 5 (list, uploadBatch, update, delete, reassign) | protected | Paginated list, CSV bulk import (10K max), cross-event reassign |
| `analytics` | 15 queries | protected | Redis live + PostgreSQL historical, cohort retention, export |
| `organizations` | 7 (list, byId, listMembers, create, update, updateName, updateWebsiteUrl) | mixed | ADMIN-only for create/list, CUSTOMER can update own org |
| `users` | 4 (list, me, updateProfile, updateTimezone) | protected | ADMIN-only list, self-service profile/timezone |
| `infrastructure` | 3 (getMapStatus, refreshMap, costProjection) | admin | KV status monitoring, force refresh, cost estimates |
| `campaigns` | 7 (list, byId, create, update, availableEvents, addEvents, delete) | protected | Aggregate stats via raw SQL, event association |

### Authorization Pattern

```
ADMIN user:
  - Sees all orgs, all events, all users
  - Can create orgs, manage users
  - Access to infrastructure/usage pages

CUSTOMER user:
  - Auto-scoped to ctx.user.orgId on every query
  - Cannot see other orgs' data
  - Cannot access infrastructure endpoints (adminProcedure guard)
```

### Context Creation

Every tRPC request:
1. `createTRPCContext({ headers })` runs `auth()` (NextAuth) to decode the JWT
2. Returns `{ db, session, user, headers }`
3. `protectedProcedure` middleware checks `ctx.user` exists
4. `adminProcedure` middleware checks `ctx.user.role === "ADMIN"`

---

## Data Model

```
Organization (multi-tenant root)
  |
  +-- User[] (role: ADMIN|CUSTOMER, orgRole: OWNER|EDITOR|VIEWER)
  |
  +-- Campaign[] (optional grouping, status: DRAFT|ACTIVE|COMPLETED)
  |     |
  |     +-- Event[] (campaignId FK, optional)
  |
  +-- Event[] (orgId FK)
        |  - city, state, venueName, latitude/longitude (GeoIP)
        |  - timezone (IANA), scheduleMode (bool)
        |  - fallbackUrl (redirect when no window active)
        |  - status: DRAFT|ACTIVE|COMPLETED|CANCELLED
        |
        +-- EventWindow[] (PRE|LIVE|POST)
        |     - url (redirect destination)
        |     - startTime/endTime (nullable for manual mode)
        |     - isActive (bool, single-active constraint)
        |     - isManual (bool, prevents cron override)
        |
        +-- Band[] (physical NFC wristband)
        |     - bandId (hardware chip ID)
        |     - autoAssigned (bool, true = GeoIP assigned)
        |     - tapCount, firstTapAt, lastTapAt (updated by flush cron)
        |     - @@unique([bandId, eventId])
        |
        +-- TapLog[] (immutable audit log)
              - modeServed (PRE|LIVE|POST|FALLBACK)
              - redirectUrl, userAgent, ipAddress, tappedAt
              - ~600K rows per event at scale
```

---

## Infrastructure Monitoring

The Usage page (`/usage` in admin) provides operational visibility:

- **Current Activity:** which events are ACTIVE right now + band counts
- **KV Status:** `redirect-map:meta` from Redis — last refresh time, band count, size. Stale threshold: 5 minutes. "Force Refresh" button calls `infrastructure.refreshMap`
- **Upcoming Events:** events with windows starting in next 30 days
- **Cost Projection:** estimated costs for 7/14/30-day windows based on `estimatedAttendees`:
  - Cloudflare Workers: $0.50 per million requests
  - Cloudflare KV reads: $0.50 per million
  - Upstash Redis: $0.20 per 100K commands (9 commands per tap)
