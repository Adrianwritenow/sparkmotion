# Hub

NFC redirect backend and cron host. No UI dashboard — serves the `/e` redirect endpoint and runs scheduled jobs. This is the Cloudflare Worker's fallback origin for KV misses.

- **Port:** 3002
- **Production:** geo.sparkmotion.net
- **Runtime:** Node.js (Vercel serverless, not Edge — required for ioredis + Prisma)

## Environment Variables

Shared (set in root `.env`):

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `AUTH_SECRET` | NextAuth secret |

Hub-specific:

| Variable | Description |
|----------|-------------|
| `CRON_SECRET` | Bearer token for cron endpoint auth |
| `ENABLE_DEV_TEST_PANEL` | Set `true` to allow dev test panel in production |
| `CF_ACCOUNT_ID` | Cloudflare account ID (for KV writes) |
| `CF_API_TOKEN` | Cloudflare API token (for KV writes) |
| `CF_KV_NAMESPACE_ID` | Cloudflare KV namespace ID (redirect map) |

## Redirect Flow

`GET /e?bandId=...`

```
1. Validate bandId param (400 if missing)
2. Parse UTM params for passthrough
3. Redis cache lookup (getCachedBand)
   |
   +-- HIT -> skip to step 6
   +-- MISS -> continue
   |
4. DB lookup (band with event + active windows)
   +-- Single-event band -> cache result, continue
   +-- Multi-event band -> GeoIP nearest event (never cached)
   +-- Band not found -> auto-assignment flow:
       - Extract org slug from subdomain
       - GeoIP nearest org event (or oldest with most windows)
       - Create Band record (autoAssigned: true)
       - Handle P2002 race condition
       |
5. No org/event found -> redirect to org.websiteUrl or 404
6. Build redirect URL (activeWindow.url ?? event.fallbackUrl + UTMs)
7. Fire-and-forget analytics via waitUntil:
   - Redis counter increment
   - LPUSH tap log to pending queue
8. Return 302 redirect
```

## Crons

Both crons run every minute via `vercel.json` and require `CRON_SECRET` Bearer auth.

### flush-taps (`/api/cron/flush-taps`)

Drains the Redis `tap-log:pending` list into PostgreSQL.

- **Atomic drain:** Lua script does `LRANGE` + `LTRIM` atomically to prevent race conditions on overlapping invocations
- **Batch size:** 5,000 items per loop iteration
- **Safety timeout:** Stops 10s before the 60s `maxDuration` limit
- **DB writes per batch:**
  - `tapLog.createMany()` — bulk insert tap log rows
  - `unnest()` SQL — batch update band `tapCount` + `lastTapAt`
  - `unnest()` SQL — set `firstTapAt` where NULL
  - All wrapped in a `$transaction`

### update-windows (`/api/cron/update-windows`)

Auto-activates/deactivates event windows based on schedule.

- Fetches all events with `scheduleMode: true`
- Evaluates each event's window schedule against current time (in event timezone)
- Invalidates Redis cache for changed events
- Pushes updated band-to-URL mappings to Cloudflare KV

## Important Files

| File | Purpose |
|------|---------|
| `src/app/e/route.ts` | Main NFC redirect handler |
| `src/app/api/cron/flush-taps/route.ts` | Tap log batch flush cron |
| `src/app/api/cron/update-windows/route.ts` | Window scheduler cron |
| `src/app/api/dev/test-data/route.ts` | Dev test panel data endpoint |
| `src/components/dev-test-panel.tsx` | Floating test panel for simulating taps |
| `vercel.json` | Cron schedule configuration |

## Dev Test Panel

The home page (`/`) renders a floating dev test panel that lets you simulate NFC taps. It fetches orgs/events/bands from `/api/dev/test-data` and opens `/e?bandId=...&orgSlug=...` in a new tab. Gated by `NODE_ENV=development` or `ENABLE_DEV_TEST_PANEL=true`.
