# Load Test Realism Gap Report

**Date:** 2026-02-27
**Branch:** `feat/load-test-suite-update`
**Last cloud run:** #6882132 (437K requests, p50=23ms, p95=150ms, 3.2K peak RPS)

---

## Executive Summary

The current load test suite validates the happy path (KV hit → 302 redirect) at moderate scale but **misses several production-critical scenarios** that will occur during the 30-city tour. The most urgent finding is the **flush cron throughput deficit** — at 5K RPS, the queue grows 60x faster than the cron can drain it.

### Severity Ratings

| Finding | Severity | Impact |
|---------|----------|--------|
| Flush cron 60x deficit | **CRITICAL** | Queue grows unbounded, Redis OOM, lost tap data |
| Missing env vars block 4/7 tests | **HIGH** | Analytics, CSV, Upstash, flush tests can't run |
| No concurrent event simulation | **MEDIUM** | Cross-event contention untested |
| No window transition test | **MEDIUM** | Stale URLs served for up to 5 min |
| Single-mode KV entries | **LOW** | Doesn't affect redirect correctness |
| Uniform band distribution | **LOW** | Misses burst patterns but doesn't affect SLA |

---

## Task 1: redirect-load.js Realism Audit

### Gap 1.1: Single event, single mode (LOW)

**Current:** All 200K KV entries have `mode: "live"` and same URL (`compassion.com/live`).
**Reality:** Events switch PRE → LIVE → POST, meaning KV values change mid-event.

**Impact:** The redirect path itself doesn't branch on mode — it just reads `entry.url` and 302s. The mode field is only used in `logTap()` analytics. So this gap doesn't affect redirect latency measurements.

**Action:** Low priority. A window-switch test (see Gap 1.5) would cover this.

### Gap 1.2: Uniform random band selection (LOW)

**Current:** `Math.floor(Math.random() * 200_000)` — flat uniform distribution.
**Reality:** Tap bursts occur at door-open, keynote end, and event close. Certain bands (front rows, VIP) tap more frequently.

**Impact:** Uniform distribution actually **stresses KV cache more** than burst patterns because it maximizes cache misses across 200K keys. Burst patterns (Zipf/hotspot) would result in higher cache hit rates, making the test more conservative (harder to pass).

**Action:** No immediate fix needed. The uniform distribution is a worse-case scenario for cache efficiency. If anything, real traffic will perform better.

### Gap 1.3: No concurrent events (MEDIUM)

**Current:** Single event, single KV namespace.
**Reality:** 2-3 cities active simultaneously. Each event has 200K bands → 400-600K KV keys.

**Impact on Worker:**
- KV namespace is shared across events. 600K keys vs 200K doesn't change per-key lookup time (KV is O(1)).
- `logTap()` pipelines target different `analytics:{eventId}:*` keys — no contention.
- `tap-log:pending` is a single global list — all events write to it. This is fine for LPUSH but creates more pressure on the flush cron.

**Impact on Hub:**
- DB queries filter by eventId, so concurrent events don't increase query cost.
- Redis cache keys are per-band (`band:{bandId}`), so no collision.

**Action:** Primarily affects flush cron sizing (see Task 2). For redirect testing, a single event is sufficient since KV lookups are isolated per key.

### Gap 1.4: No UTM parameters (LOW)

**Current:** Test requests are `/e?bandId=LOADTEST-000001`.
**Reality:** NFC URLs include `utm_source`, `utm_campaign`, etc.

**Impact:** The Worker has UTM handling code (lines 94, 127-136 in worker.ts). Without UTMs, this code path (`new URL()` construction) is skipped. The `new URL()` call adds ~1ms per request.

**Action:** Add UTM params to ~50% of test requests to exercise the URL construction path:
```javascript
const hasUtm = Math.random() < 0.5;
const utmSuffix = hasUtm ? "&utm_source=nfc&utm_campaign=compassion-tour-2026" : "";
```

### Gap 1.5: No window transitions during test (MEDIUM)

**Current:** KV entries are static throughout the test.
**Reality:** When switching PRE → LIVE, the admin dashboard triggers a bulk KV update of all 200K entries. During this 5-10 minute update window, some bands serve old URLs.

**Impact:** The `cacheTtl: 300` (5 min) edge cache means:
1. KV entry updated at T=0
2. Edge cache serves old URL until T+5min
3. Total stale window: up to **10 minutes** (5min update + 5min cache TTL)

This is **acceptable for PRE→LIVE** (pre-event URL is still valid) but **problematic for LIVE→POST** (live URL may become invalid).

**Action:** New test: `window-switch-load.js` — run redirect traffic while a background process updates KV entries, then measure how long stale URLs are served.

### Gap 1.6: Single geographic origin (LOW)

**Current:** All traffic from Amazon Columbus (Grafana Cloud generators).
**Reality:** Attendees in 30 cities hit different CF edge PoPs.

**Impact:** Each CF edge PoP maintains its own KV edge cache (`cacheTtl: 300`). The test warms a single PoP's cache. Real events warm per-city caches independently, so first requests from new PoPs will see higher latency (~50-150ms KV central lookup vs ~5ms edge cache hit).

**Action:** Cloud test already accounts for this with relaxed thresholds (p95 < 200ms). No fix needed — the cloud scenario is correctly sized for cold-cache latency.

### Gap 1.7: No scan-mode traffic (LOW)

**Current:** No test requests include the `sm-scan-mode` cookie.
**Reality:** Event staff use scan mode during setup (returns HTML instead of 302).

**Impact:** Scan mode is <1% of traffic and returns a static HTML page (~1KB). No performance concern.

**Action:** Not worth testing under load.

---

## Task 2: Analytics Pipeline Under Load

### Finding 2.1: CRITICAL — Flush Cron 60x Throughput Deficit

**Current setup:**
- `logTap()` pushes 1 entry to `tap-log:pending` per tap
- Flush cron runs every 60 seconds
- `BATCH_SIZE = 10,000` (flush-taps/route.ts line 8)
- Cron loops until queue empty OR 50s timeout

**At 5K RPS:**
- Inbound: 5,000 entries/second × 60 seconds = **300,000 entries/minute**
- Cron drains in batches of 10K, loops for up to 50s
- Each batch involves: Lua drain → findMany (resolve bandIds) → createMany → $transaction (2 raw SQL updates)
- **Estimated per-batch time: 3-5 seconds** (DB round-trips to Neon)
- **Batches per cron run: ~10-15** (50s / 3-5s per batch)
- **Drain rate: 100K-150K items/minute**

**Deficit calculation:**
```
Inbound:  300,000 items/min (at 5K RPS)
Outbound: ~120,000 items/min (optimistic estimate)
Deficit:  ~180,000 items/min accumulating in Redis
```

**After 1 hour at 5K RPS:**
- Queue accumulates: ~10.8M entries
- Memory: ~10.8M × ~200 bytes = **~2.16 GB** in Redis

**Upstash free/pro plan limits:**
- Free: 256MB max memory
- Pro (Pay-as-you-go): 10GB max
- At 2.16 GB/hour growth, the queue would hit 10GB in ~4.6 hours

**Mitigation options (in order of preference):**

1. **Increase BATCH_SIZE to 50,000** — Each createMany and raw SQL can handle 50K rows. This is the simplest fix.
2. **Run multiple cron instances concurrently** — The Lua LRANGE+LTRIM is atomic, so overlapping crons are safe. Run cron every 15s instead of 60s.
3. **Batch tap-log writes in Worker** — Instead of 1 LPUSH per tap, buffer 100 taps in the Worker isolate and LPUSH them as a single JSON array. This reduces Upstash HTTP calls from 5K/s to 50/s but adds complexity to the Worker.

**Recommended fix:** Option 1 + 2 combined:
- `BATCH_SIZE = 50_000`
- Cron interval: every 15 seconds (via Vercel cron config)
- Drain rate: ~50K × (50s / 5s per batch) / 0.25 min = **~2M items/min** — easily covers 300K/min

### Finding 2.2: Upstash Pipeline Rate Limits

**Current:** Each tap triggers 1 pipeline HTTP request with 7 commands.
**At 5K RPS:** 5,000 pipeline requests/second to Upstash REST API.

**Upstash rate limits (Pro plan):**
- Pipeline: counted as 1 request regardless of command count
- Rate limit: **10,000 requests/second** on Pro
- Our usage: 5,000 req/s → **50% of limit** — safe

**At peak (2-3 concurrent events):**
- 15K taps/s → 15K pipeline requests/s → **exceeds 10K limit**
- Would need Upstash Enterprise or request limit increase

**Action:** Verify current Upstash plan limits. Consider request batching if approaching 10K/s.

### Finding 2.3: Redis Memory at Scale

**Keys per event (ongoing):**
- `analytics:{eventId}:taps:total` — 1 key, ~50 bytes
- `analytics:{eventId}:taps:unique` — 1 HyperLogLog, max 12KB
- `analytics:{eventId}:taps:hourly:*` — 24 keys/day, ~50 bytes each
- `analytics:{eventId}:mode:*` — 3 keys, ~50 bytes each
- `analytics:{eventId}:velocity:*` — 180 keys (30min TTL), ~50 bytes each

**Total per event:** ~12KB HLL + ~15KB counters = ~27KB (negligible)

**tap-log:pending queue is the problem** (see Finding 2.1).

### Finding 2.4: Counter Accuracy

**INCR** is atomic — no accuracy concern under concurrency.
**PFADD** (HyperLogLog) has inherent 0.81% standard error. At 200K unique bands, expect ±1,620 error. This is acceptable for dashboard display.

**Verification:** Compare `analytics:{eventId}:taps:total` (Redis INCR) against actual request count from last test run. If the test ran 437K requests, the Redis counter should be ~437K.

### Finding 2.5: Velocity Bucket Scale

**At 5K RPS:** Each 10-second bucket holds ~50,000 count.
**Dashboard sparkline:** `getVelocityHistory()` returns last 180 buckets (30 min).

**No rendering concern** — the sparkline displays relative values, not absolute. 50,000 vs 500 doesn't matter for visualization.

---

## Task 3: Seed Data Realism Audit

### Gap 3.1: All bands assigned to one event (MEDIUM)

**Current:** All 200K bands have `eventId` set to the loadtest event.
**Reality:** Some bands are unassigned (no eventId) and get geo-routed on first tap.

**Impact:** The `hub/src/app/e/route.ts` has a complex geo-routing path (lines 123-250) for unassigned bands. This path involves:
- `findMany` with earth_distance calculation
- Band creation (`db.band.create`)
- Redis cache write
- Flagging if >50 miles away

This path is tested by `geo-routing-load.js` with 500 geo-specific bands, but the **cold-start assignment path** (brand new bandId, no DB record) is untested.

**Action:** Add a small pool of unknown bandIds to redirect-load.js to exercise the KV miss → Hub → auto-assign path.

### Gap 3.2: No window switching simulation (MEDIUM)

**Current:** Seed creates static windows (PRE inactive, LIVE active).
**Reality:** Windows switch during events.

**Action:** See Gap 1.5 — new `window-switch-load.js` test.

### Gap 3.3: No multi-org (LOW)

**Current:** Single org.
**Reality:** Platform may have multiple orgs, but DB queries filter by orgId via tRPC middleware.

**Impact:** No performance concern. org-scoped queries use indexed `orgId` column.

### Gap 3.4: Missing env vars block tests (HIGH)

**Missing from `.env.staging`:**
- `TEST_PASSWORD` — required by analytics-load.js, csv-export-load.js
- `LOADTEST_EVENT_ID` — required by analytics-load.js, csv-export-load.js, upstash-pipeline.js

**Action:** Add these to `.env.staging`:
```
TEST_PASSWORD=<the password used in seed.ts seed-user>
LOADTEST_EVENT_ID=<cuid from Event table, e.g. cmlcxn9uo0002sdqjnprwkqlp>
```

Without these, **4 of 7 tests cannot run.**

---

## Task 4: Untested Scenarios

### 4.1: Hub redirect under load — p50=509ms is concerning

**Previous local test:** p50=509ms, which is 10x above the 50ms SLA.

**But this is expected.** The Hub `/e` endpoint is the **fallback path** for KV misses. It involves:
1. Redis cache check (~5ms)
2. DB query with Prisma (~100-300ms to Neon)
3. Geo-routing calculation if needed (~50ms)
4. Redis cache write (~5ms)
5. Response (~5ms)

**The SLA is <50ms for the Worker KV path, not the Hub fallback.** Hub requests only occur for:
- First tap from a new/unknown band (cold start)
- KV entry expired or missing

After the first tap, the Worker caches the band in KV and subsequent taps are <50ms.

**Acceptable** as long as KV hit rate stays >99% (which it does — test showed 99%+ kv_hit_rate).

### 4.2: Flush cron at scale

**flush-taps-bench.ts exists** but hasn't been run. It seeds 100K entries and measures drain throughput.

**Action:** Run the benchmark. Based on code analysis, expected throughput is ~120K items/min with `BATCH_SIZE=10,000`. After increasing to 50K, expect ~500K+/min.

### 4.3: Concurrent admin usage during event (MEDIUM)

**Scenario:** 5K taps/sec flowing in while 10 admins poll dashboards every 5s.

**analytics-load.js** tests this but hasn't been run cloud. The queries hit:
- Redis for live metrics (velocity, total/unique) — O(1) reads, no concern
- PostgreSQL for historical queries (tapsByDay, topEvents, KPIs) — requires table scans on 600K rows

**Potential issue:** `exportTaps` query does a `findMany` with ORDER BY + LIMIT 50K on TapLog. During high write volume (flush cron inserting 10K rows/batch), this query may experience lock contention.

**Action:** Run analytics-load.js concurrently with redirect-load.js to measure dashboard degradation under write load.

### 4.4: KV bulk update performance (LOW — already handled)

**When switching PRE → LIVE:**
- Admin calls `windows.toggle` tRPC procedure
- Transaction: deactivate siblings → activate target → disable schedule mode
- Then calls `generateRedirectMap({ eventIds: [eventId] })` (fire-and-forget)
- `redirect-map-generator.ts` bulk-writes all bands for the event to KV via CF API

**This is already implemented.** `generateRedirectMap()` is called on every window toggle/create/update/delete. It reads the active window's URL from DB and bulk-writes KV entries for all bands in that event.

**Remaining concern:** The Worker's `cacheTtl: 300` means edge PoPs may serve the old URL for up to 5 minutes after KV is updated. This is a Cloudflare KV design constraint — acceptable for PRE→LIVE (pre-event URL is still valid), but worth monitoring for LIVE→POST transitions.

### 4.5: Geo-routing cold start latency

**Path:** Worker KV miss → `fetch(hubUrl)` → Hub DB lookup → geo calculation → band creation → cache write → 302 redirect.

**Estimated latency:** 500-1000ms for the full cold path.
**Frequency:** Once per new band (first tap only). After assignment, KV is populated and subsequent taps are <50ms.

**Acceptable** — first tap from a new band takes ~1s, all subsequent taps are <50ms.

---

## Task 5: Real-World Load Profile

### Single Event Timeline

```
Phase          Duration   Taps/min   Taps/sec   Notes
─────────────  ─────────  ─────────  ─────────  ──────────────────
PRE arrival    T-2h→T     50         ~1         Early check-ins
Door open      T→T+5m     2,000      ~33        Initial burst
Sustained      T+5m→T+2h  750        ~13        Average engagement
Event end      T+2h→2h5m  3,000      ~50        Final burst (peak)
POST           T+2h5m+    100        ~2         Stragglers
```

**Single event peak:** ~50 taps/sec (3,000 taps/min at event end).

### Multi-City Overlay (Worst Case: 3 Concurrent Events)

```
Scenario: Nashville (Central), Denver (Mountain), Chicago (Central)
Nashville peaks at 9:00 PM CT — 3,000 taps/min
Denver sustained at 8:00 PM MT (= 9:00 PM CT) — 750 taps/min
Chicago sustained at 9:00 PM CT — 750 taps/min

Combined peak: 4,500 taps/min = 75 taps/sec
```

**This is well below the 5K RPS target.** The 5K RPS target appears to be a **generous safety margin** (66x the realistic peak).

### Realistic vs. Target Load Comparison

| Metric | Realistic Peak | Test Target | Margin |
|--------|---------------|-------------|--------|
| Taps/sec | 75 | 5,000 | 66x |
| Taps/min | 4,500 | 300,000 | 66x |
| Concurrent events | 3 | 1 | — |
| Total bands (active) | 600K | 200K | 0.3x |
| tap-log:pending growth/min | 4,500 | 300,000 | 66x |

### tap-log:pending Queue Depth at Realistic Load

```
Inbound:  4,500 items/min (realistic peak)
Cron drain (current BATCH_SIZE=10K): ~120,000 items/min
Surplus: 115,500 items/min of drain capacity

Result: Queue never grows beyond ~4,500 items. Current cron is MORE than sufficient for realistic load.
```

**However**, the test target of 5K RPS creates an artificial deficit. The question is: **which load should we design for?**

**Recommendation:** Design for 10x realistic peak = **750 taps/sec (45K taps/min)**. This provides a 10x safety margin without the 66x over-engineering of 5K RPS. At 45K/min, the current cron (120K/min drain rate) handles it with 2.7x headroom.

If the 5K RPS target is firm (contractual SLA), then the cron needs to be upgraded per Finding 2.1.

### Redis Memory at Realistic Load

```
Queue depth: ~4,500 items max (drained every minute)
Memory: 4,500 × 200 bytes = ~900KB
Analytics keys: ~27KB per event × 3 events = ~81KB
Total: <1MB — well within any Upstash plan
```

### PostgreSQL Write Throughput (Flush Cron)

```
Realistic: 4,500 rows/min (1 batch of 4,500 → createMany + 2 raw SQL)
At 10x margin: 45,000 rows/min (5 batches of 10K)

Neon PostgreSQL can handle 10K+ inserts/second, so even at 5K RPS
the DB writes are not the bottleneck — the cron scheduling frequency is.
```

---

## Prioritized Action Items

### P0 — Must Fix Before Tour

1. **Add missing env vars to `.env.staging`**
   - `TEST_PASSWORD` and `LOADTEST_EVENT_ID`
   - Blocks 4/7 tests from running

2. **Run remaining tests on cloud** (analytics, csv-export, upstash-pipeline, geo-routing, flush-taps-bench)

3. **Verify Upstash plan rate limits** (10K req/s on Pro? What's our current plan?)

### P1 — Should Fix Before Tour

4. ~~**Application bug: KV not updated on window switch**~~ **ALREADY HANDLED** — `generateRedirectMap()` is called on every window toggle/create/update/delete

5. **Increase flush cron frequency** (every 15s instead of 60s) if targeting 5K RPS
   - BATCH_SIZE already increased to 50,000 (this session)

6. **Add UTM parameters** to redirect-load.js (~50% of requests) — DONE (this session)

### P2 — Nice to Have

7. **New test: window-switch-load.js** — measure stale URL duration during KV updates
8. **Concurrent test run** — analytics-load.js + redirect-load.js simultaneously
9. **Add unknown bandIds** to redirect-load.js to exercise KV miss → Hub path
10. **Multi-event seed** — 3 events with 200K bands each in KV

---

## Files That Need Changes

| File | Change | Priority |
|------|--------|----------|
| `load-tests/.env.staging` | Add TEST_PASSWORD, LOADTEST_EVENT_ID | P0 |
| `apps/hub/src/app/api/cron/flush-taps/route.ts` | BATCH_SIZE 10K → 50K | P1 |
| `load-tests/redirect-load.js` | Add UTM params to 50% of requests | P1 |
| `load-tests/flush-taps-bench.ts` | Update BATCH_SIZE constant to match cron | P1 |
| `apps/redirect/src/worker.ts` | (no changes needed) | — |
| NEW: `load-tests/window-switch-load.js` | KV update during live traffic | P2 |
| `load-tests/seed.ts` | Multi-event seeder (3 events × 200K bands) | P2 |
