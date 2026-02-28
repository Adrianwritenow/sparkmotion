# Load Test Realism Analysis Plan

## Objective
Analyze whether the current load test suite accurately simulates the Compassion International 30-city tour (March 2026) and identify gaps between test scenarios and real production traffic patterns.

## Context

### Production Reality: Compassion 30-City Tour
- **30 cities**, March 2026
- **200K attendees per event** (events can stack — multiple cities active simultaneously)
- **NFC wristbands** → tap → CF Worker → KV lookup → 302 redirect
- **3 event windows per event**: PRE → LIVE → POST (URLs change per window)
- **Geo-routing**: unassigned bands get routed to nearest active event
- **Analytics pipeline**: Worker → Upstash Redis (real-time) → flush cron → PostgreSQL (historical)
- **Admin dashboard**: real-time stats per event, CSV exports, cross-event analytics
- **Peak load estimate**: 5,000 req/s per event, potentially 2-3 concurrent events = 10-15K req/s system-wide
- **Tap pattern**: bursty (doors open, keynote ends, event ends = tap spikes)
- **Total across tour**: ~18M taps (600K taps/event × 30 events)

### Current Load Test Suite
| Test | What It Tests | Status |
|------|--------------|--------|
| redirect-load.js | CF Worker KV → 302 redirect | Ran (cloud) — 3.2K RPS, p50=23ms |
| hub-redirect-load.js | Hub fallback (KV miss → DB) | Ran (local) — 500 RPS, p50=509ms |
| analytics-load.js | Admin analytics API queries | NOT YET RUN (cloud) |
| csv-export-load.js | CSV export endpoint | NOT YET RUN (cloud) |
| geo-routing-load.js | Geo-based event routing | NOT YET RUN (cloud) |
| upstash-pipeline.js | Upstash Redis pipeline perf | NOT YET RUN (cloud) |
| flush-taps-bench.ts | Flush cron (Redis → PostgreSQL) | NOT YET RUN |

### Current Seed Data (staging)
- 1 org ("Load Test Org")
- 1 event ("Load Test Event") with 200K bands, 600K tap logs
- 2 windows (PRE inactive, LIVE active)
- 5 geo events (Nashville, Dallas, Denver, Chicago, Atlanta) with 100 bands each
- KV: 200K entries, all pointing to same URL, all mode="live"
- 1 loadtest admin user

## Analysis Tasks

### Task 1: Audit redirect-load.js realism

**Check these gaps:**

1. **Single event, single mode** — All 200K KV entries have `mode: "live"` and same URL. Real events switch PRE→LIVE→POST, meaning KV values change mid-event. The test never exercises KV write/invalidation during live traffic.

2. **Uniform random band selection** — `Math.random() * 200_000` gives flat distribution. Real events have hotspots: certain moments (doors open, keynote, giveaway) cause tap bursts where many people tap within seconds. Consider Zipf or Gaussian distribution.

3. **No concurrent events** — Test hits one event's bands. Real tour could have 2-3 cities active simultaneously, each with their own bands, KV entries, and analytics counters. Cross-event infrastructure contention is untested.

4. **No UTM parameters** — Test URLs have no UTM params. Real scans include `utm_source`, `utm_campaign`, etc. The Worker has URL construction logic for UTMs that's never exercised under load.

5. **No window transitions during test** — What happens when KV entries get bulk-updated mid-test (PRE→LIVE switch)? Does the edge cache (`cacheTtl: 300`) serve stale URLs for 5 minutes?

6. **Single geographic origin** — All traffic from Amazon Columbus. Real attendees hit different CF edge PoPs, meaning KV edge caches warm independently per city.

7. **No scan-mode traffic** — The Worker has a scan-mode path (cookie check → HTML response). This is used by event staff during setup. Small traffic but different code path.

### Task 2: Audit analytics pipeline under load

**Questions to answer:**

1. **Does logTap() keep up at 5K RPS?** — Each tap fires 7 Upstash commands in a pipeline via `ctx.waitUntil()`. At 5K RPS = 5,000 HTTP requests/sec to Upstash. What's Upstash's rate limit on our plan?

2. **Does tap-log:pending queue grow unbounded?** — If flush cron runs every 60s with BATCH_SIZE=5000, and taps arrive at 5K/s, the queue grows by 300K entries/minute. The cron drains 5K/run. **This is a 60x deficit.** Is BATCH_SIZE set correctly?

3. **Redis memory** — At 5K RPS, each tap pushes ~200 bytes to `tap-log:pending`. After 1 hour: 18M entries × 200B = 3.6GB. What's the Upstash memory limit?

4. **Counter accuracy** — INCR and PFADD under high concurrency. Are analytics counters accurate after 437K requests from the last test? Compare Redis counter vs actual request count.

5. **Velocity buckets** — 10-second buckets with 30-min TTL. At 5K RPS, each bucket holds count=50,000. Does the admin sparkline render correctly at this scale?

### Task 3: Audit seed data realism

**Gaps to check:**

1. **All bands assigned to one event** — Real scenario: bands are pre-assigned to events OR unassigned (geo-routed on first tap). Test has no unassigned bands.

2. **No window switching simulation** — Seed creates static windows. Real events have timed transitions. Should test include a background process that updates KV entries mid-test.

3. **No multi-org** — Single org. Real platform may have multiple orgs with different events running simultaneously.

4. **Tap log distribution** — Seeded 600K tap logs with Gaussian distribution over 6 hours. Is this used by analytics tests? Does it match real tap patterns?

5. **Missing test env vars** — `TEST_PASSWORD` and `LOADTEST_EVENT_ID` not set in `.env.staging` (needed for analytics-load.js and csv-export-load.js).

### Task 4: Audit remaining untested scenarios

1. **Hub redirect under load** — When KV misses occur (new bands, geo-routing), the Worker proxies to Hub. Hub does DB lookup + Redis cache + redirect. Previous test showed p50=509ms. Is this acceptable for geo-routing first taps?

2. **Flush cron at scale** — With 600K taps/event, the cron must drain Redis → PostgreSQL reliably. Benchmark with realistic queue sizes.

3. **Concurrent admin usage during event** — While 5K taps/sec flow in, admin users are viewing dashboards, exporting CSVs, managing windows. Do analytics queries degrade under write load?

4. **KV bulk update performance** — When switching PRE→LIVE, how long does it take to update 200K KV entries? Do requests during the update get stale URLs?

5. **Geo-routing cold start** — First tap from an unassigned band: Worker KV miss → Hub → geo lookup → assign event → write KV → redirect. What's the latency for this full path?

### Task 5: Calculate real-world load profile

**Build a realistic load model:**

```
Timeline for a single event:
  T-2h to T-0:    PRE mode, ~50 taps/min (early arrivals checking in)
  T+0 to T+0:05:  LIVE switch, spike to 2,000 taps/min (doors open)
  T+0:05 to T+2h:  Sustained 500-1,000 taps/min
  T+2h to T+2:05:  Spike to 3,000 taps/min (event ends, everyone taps)
  T+2:05+:         POST mode, ~100 taps/min (stragglers)
```

**Multi-city overlay:**
- 2-3 events active simultaneously (different time zones)
- Each event has its own 200K bands
- System must handle combined load

**Calculate:**
- Peak combined RPS across concurrent events
- Total tap-log:pending queue depth at peak
- Redis memory requirements
- PostgreSQL write throughput needed from flush cron
- KV read volume (is 200K × 3 events = 600K unique keys realistic?)

## Deliverables

After analysis, produce:

1. **Gap report** — What the current tests miss vs production reality
2. **Updated seed.ts** — Multi-event, multi-window, realistic distributions
3. **Updated redirect-load.js** — Realistic traffic patterns (bursts, UTMs, concurrent events)
4. **New test: window-switch-load.js** — KV invalidation during live traffic
5. **Fix flush cron batch size** — If the 60x deficit calculation is correct
6. **Upstash plan verification** — Confirm rate limits and memory fit the load profile
7. **Updated thresholds** — Based on realistic latency expectations

## Files to Read

When executing this analysis, read these files:

- `apps/redirect/src/worker.ts` — Worker redirect + logTap logic
- `apps/hub/src/app/api/cron/flush-taps/route.ts` — Flush cron
- `apps/hub/src/app/e/route.ts` — Hub redirect fallback (if it exists, or find /e handler)
- `packages/redis/src/analytics.ts` — Analytics read functions
- `packages/redis/src/keys.ts` — Redis key patterns
- `packages/api/src/routers/analytics.ts` — Admin analytics queries
- `load-tests/seed.ts` — Current seed data
- `load-tests/*.js` — All test scripts
- `load-tests/.env.staging` — Env vars (check for missing vars)
- `packages/database/prisma/schema.prisma` — Data model

## Current State (as of Feb 27, 2026)

- **Worker deployed to staging** with two optimizations:
  - `cacheTtl: 300` on KV reads (5-min edge cache)
  - Hoisted Redis client (cached per isolate, not per request)
- **KV seeded**: 200K bands with real event ID `cmlcxn9uo0002sdqjnprwkqlp`
- **PostgreSQL seeded**: 200K bands, 600K tap logs, 1 org, 1 event, 2 windows
- **Last test run**: 6882132 (cloud, 437K requests, p50=23ms, p95=150ms, 3.2K peak RPS)
- **redirect-load.js updated**: breakpoint-finder cloud scenario, 5000 maxVUs, kv_hit_rate metric, realistic cloud thresholds
- **Branch**: `feat/load-test-suite-update`
- **Grafana dashboard**: https://sparkmotion.grafana.net/a/k6-app/runs/6882132
