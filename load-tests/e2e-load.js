/**
 * End-to-End Load Test — Full Production Simulation
 *
 * Runs 5 concurrent scenarios to simulate Compassion 30-city tour conditions:
 *   tappers:       Stepped-plateau redirect traffic (500→10K RPS)
 *   admins:        10 dashboards polling analytics every 5s
 *   exporters:     2 concurrent CSV exports every 30s
 *   cron_trigger:  Flush-taps cron every 15s
 *   queue_sampler: Redis queue depth monitoring every 30s
 *
 * Prerequisites:
 *   1. seed.ts seed-multi-event  (3 events × 200K bands in KV + PostgreSQL)
 *   2. seed.ts seed-user         (loadtest admin account)
 *
 * Usage:
 *   Local (10% load):  k6 run --no-cloud load-tests/e2e-load.js
 *   Cloud (full):      ./load-tests/run-k6.sh staging e2e-load.js --cloud-exec
 *
 * KV latency reflects warm-cache behavior (cacheTtl=300s).
 * Cold-cache latency (first request to each CF PoP) captured in p99 tail.
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate, Counter, Gauge } from "k6/metrics";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.1.0/index.js";

// Tell k6 that 302 is an expected success status (not an error)
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 302 }));

// ─── Config ───────────────────────────────────────────────────────────────────
const WORKER_URL = __ENV.WORKER_URL;
const HUB_URL = __ENV.HUB_URL;
const ADMIN_URL = __ENV.ADMIN_URL;
const TEST_EMAIL = __ENV.TEST_EMAIL ?? "loadtest@sparkmotion.net";
const TEST_PASSWORD = __ENV.TEST_PASSWORD;
const EVENT_ID = __ENV.LOADTEST_EVENT_ID;
const CRON_SECRET = __ENV.CRON_SECRET;
const UPSTASH_URL = __ENV.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = __ENV.UPSTASH_REDIS_REST_TOKEN;

if (!WORKER_URL) throw new Error("WORKER_URL env var is required");
if (!HUB_URL) throw new Error("HUB_URL env var is required");
if (!ADMIN_URL) throw new Error("ADMIN_URL env var is required");
if (!TEST_PASSWORD) throw new Error("TEST_PASSWORD env var is required");
if (!EVENT_ID) throw new Error("LOADTEST_EVENT_ID env var is required");
if (!CRON_SECRET) throw new Error("CRON_SECRET env var is required");

const BAND_COUNT = 200_000;
const EVENT_PREFIXES = ["LOADTEST-E1-", "LOADTEST-E2-", "LOADTEST-E3-"];

// ─── Custom Metrics ───────────────────────────────────────────────────────────
const redirectLatency = new Trend("redirect_latency", true);
const errorRate = new Rate("error_rate");
const kvHitRate = new Rate("kv_hit_rate");
const analyticsLatency = new Trend("analytics_latency", true);
const csvExportLatency = new Trend("csv_export_latency", true);
const queueDepth = new Gauge("queue_depth");
const cronFlushed = new Counter("cron_flushed");
const cronErrors = new Rate("cron_errors");

// ─── Options ──────────────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    // Stepped-plateau: 500→10K RPS with 2-minute holds at each tier
    tappers: {
      executor: "ramping-arrival-rate",
      exec: "runTapper",
      startRate: 500,
      timeUnit: "1s",
      preAllocatedVUs: 2500,
      maxVUs: 5000,
      stages: [
        { duration: "2m", target: 500 },    // hold 500 RPS
        { duration: "2m", target: 1000 },   // ramp + hold 1K RPS
        { duration: "2m", target: 2500 },   // ramp + hold 2.5K RPS
        { duration: "2m", target: 5000 },   // ramp + hold 5K RPS (production target)
        { duration: "2m", target: 7500 },   // ramp + hold 7.5K RPS
        { duration: "2m", target: 10000 },  // ramp + hold 10K RPS (ceiling probe)
        { duration: "30s", target: 0 },     // ramp down
      ],
    },

    // 10 concurrent admin dashboards refreshing every 5s
    admins: {
      executor: "constant-vus",
      exec: "runAdmin",
      vus: 10,
      duration: "13m",
    },

    // 2 concurrent CSV exporters downloading every 30s
    exporters: {
      executor: "constant-vus",
      exec: "runExporter",
      vus: 2,
      duration: "13m",
    },

    // Flush-taps cron triggered every 15s (matches production schedule)
    cron_trigger: {
      executor: "constant-arrival-rate",
      exec: "runCron",
      rate: 1,
      timeUnit: "15s",
      duration: "13m",
      preAllocatedVUs: 2,
      maxVUs: 5,
    },

    // Redis queue depth sampled every 30s for observability
    queue_sampler: {
      executor: "constant-arrival-rate",
      exec: "sampleQueue",
      rate: 1,
      timeUnit: "30s",
      duration: "13m",
      preAllocatedVUs: 1,
      maxVUs: 2,
    },
  },

  thresholds: {
    // Redirect: pass <50ms p95, fail >100ms p95
    redirect_latency: [
      { threshold: "p(95)<100", abortOnFail: false },  // hard fail threshold
      { threshold: "p(95)<50", abortOnFail: false },   // warn threshold
    ],
    // Analytics: pass <5s p95, fail >8s p95
    analytics_latency: [
      { threshold: "p(95)<8000", abortOnFail: false },
      { threshold: "p(95)<5000", abortOnFail: false },
    ],
    // CSV export: pass <10s p95, fail >15s p95
    csv_export_latency: [
      { threshold: "p(95)<15000", abortOnFail: false },
      { threshold: "p(95)<10000", abortOnFail: false },
    ],
    // Error rate: warn >1%, fail >3%
    error_rate: [
      { threshold: "rate<0.03", abortOnFail: false },  // hard fail
      { threshold: "rate<0.01", abortOnFail: false },  // warn
    ],
    kv_hit_rate: ["rate>0.99"],
    cron_errors: ["rate<0.1"],
    // Note: queue_depth is a Gauge for observability — no threshold applied
  },
};

// ─── Auth: NextAuth CSRF flow ─────────────────────────────────────────────────
export function setup() {
  // 1. Get CSRF token
  const csrfRes = http.get(`${ADMIN_URL}/api/auth/csrf`);
  check(csrfRes, { "csrf 200": (r) => r.status === 200 });

  const csrfBody = JSON.parse(csrfRes.body);
  const csrfToken = csrfBody.csrfToken;
  if (!csrfToken) throw new Error("Failed to get CSRF token");

  // Build cookie header from CSRF response cookies
  const csrfCookies = csrfRes.cookies;
  const cookieParts = [];
  for (const [name, values] of Object.entries(csrfCookies)) {
    if (values && values.length > 0) {
      cookieParts.push(`${name}=${values[0].value}`);
    }
  }
  const cookieHeader = cookieParts.join("; ");

  // 2. Sign in with credentials
  const loginRes = http.post(
    `${ADMIN_URL}/api/auth/callback/credentials`,
    {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      csrfToken: csrfToken,
      json: "true",
    },
    {
      redirects: 0, // NextAuth redirects on success — don't follow
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookieHeader,
      },
    }
  );

  // NextAuth returns 200 or 302 on success
  check(loginRes, {
    "login ok": (r) => r.status === 200 || r.status === 302,
  });

  // 3. Extract session cookie (try 4 possible NextAuth cookie names)
  const allCookies = loginRes.cookies;
  let sessionToken = null;

  for (const name of [
    "authjs.session-token",
    "next-auth.session-token",
    "__Secure-authjs.session-token",
    "__Secure-next-auth.session-token",
  ]) {
    if (allCookies[name] && allCookies[name].length > 0) {
      sessionToken = { name, value: allCookies[name][0].value };
      break;
    }
  }

  if (!sessionToken) {
    console.warn("Warning: No session cookie found in login response. Admin/exporter scenarios may fail with 401.");
    console.warn("Available cookies:", Object.keys(allCookies).join(", "));
    return { cookie: "" };
  }

  return { cookie: `${sessionToken.name}=${sessionToken.value}` };
}

// ─── tRPC helper ──────────────────────────────────────────────────────────────
function trpcQuery(cookie, procedure, input, tags) {
  const encodedInput = encodeURIComponent(JSON.stringify(input));
  return http.get(`${ADMIN_URL}/api/trpc/${procedure}?input=${encodedInput}`, {
    headers: { Cookie: cookie },
    tags: tags,
  });
}

// ─── Scenario: tappers ────────────────────────────────────────────────────────
// Stepped-plateau redirect traffic across 3 multi-event KV namespaces
export function runTapper() {
  // Distribute load across all 3 event prefixes
  const prefix = EVENT_PREFIXES[Math.floor(Math.random() * 3)];
  const bandNum = Math.floor(Math.random() * BAND_COUNT) + 1;
  const bandId = `${prefix}${String(bandNum).padStart(6, "0")}`;

  // ~50% of requests include UTM params (exercises Worker URL construction path)
  const utmSuffix =
    Math.random() < 0.5
      ? "&utm_source=nfc&utm_medium=wristband&utm_campaign=compassion-tour-2026"
      : "";

  const res = http.get(`${WORKER_URL}/e?bandId=${bandId}${utmSuffix}`, {
    redirects: 0, // Don't follow — measure Worker response only
    tags: { name: "redirect" },
  });

  const ok = res.status === 302;
  const location = res.headers["Location"] || "";

  // KV hit = redirects to compassion.com (the seeded URL)
  const isKvHit = location.includes("compassion.com");

  redirectLatency.add(res.timings.duration);
  errorRate.add(!ok);
  kvHitRate.add(isKvHit);

  check(res, {
    "status is 302": (r) => r.status === 302,
    "has Location header": () => location !== "",
    "KV hit (compassion.com)": () => isKvHit,
  });

  // No sleep — arrival rate controls frequency
}

// ─── Scenario: admins ─────────────────────────────────────────────────────────
// Simulates 10 dashboard tabs refreshing analytics every 5s
export function runAdmin(data) {
  const cookie = data.cookie;

  // 1. KPIs (last 24h)
  {
    const res = trpcQuery(
      cookie,
      "analytics.kpis",
      {
        from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        to: new Date().toISOString(),
      },
      { name: "kpis" }
    );
    analyticsLatency.add(res.timings.duration);
    check(res, { "kpis 200": (r) => r.status === 200 });
  }

  // 2. Velocity history
  {
    const res = trpcQuery(
      cookie,
      "analytics.velocityHistory",
      { eventId: EVENT_ID },
      { name: "velocity" }
    );
    analyticsLatency.add(res.timings.duration);
    check(res, { "velocity 200": (r) => r.status === 200 });
  }

  // 3. Event summary
  {
    const res = trpcQuery(cookie, "analytics.eventSummary", {}, { name: "eventSummary" });
    analyticsLatency.add(res.timings.duration);
    check(res, { "eventSummary 200": (r) => r.status === 200 });
  }

  // 4. Taps by hour
  {
    const res = trpcQuery(
      cookie,
      "analytics.tapsByHour",
      { eventId: EVENT_ID, hours: 24 },
      { name: "tapsByHour" }
    );
    analyticsLatency.add(res.timings.duration);
    check(res, { "tapsByHour 200": (r) => r.status === 200 });
  }

  // 5s poll interval (simulates dashboard auto-refresh)
  sleep(5);
}

// ─── Scenario: exporters ──────────────────────────────────────────────────────
// 2 concurrent VUs downloading CSV exports every 30s
export function runExporter(data) {
  const cookie = data.cookie;

  const input = { eventId: EVENT_ID };
  const encodedInput = encodeURIComponent(JSON.stringify(input));
  const url = `${ADMIN_URL}/api/trpc/analytics.exportTaps?input=${encodedInput}`;

  const res = http.get(url, {
    headers: { Cookie: cookie },
    tags: { name: "csv_export" },
    timeout: "30s",
  });

  csvExportLatency.add(res.timings.duration);

  check(res, {
    "export 200": (r) => r.status === 200,
    "export has data": (r) => r.body && r.body.length > 100,
  });

  // 30s between exports per VU
  sleep(30);
}

// ─── Scenario: cron_trigger ───────────────────────────────────────────────────
// Fires flush-taps cron every 15s — matches production schedule
export function runCron() {
  const res = http.get(`${HUB_URL}/api/cron/flush-taps`, {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
    timeout: "60s",
    tags: { name: "cron_trigger" },
  });

  const ok = res.status === 200;
  cronErrors.add(!ok);

  if (ok) {
    try {
      const body = JSON.parse(res.body);
      cronFlushed.add(body.flushed ?? 0);
      if (body.remaining !== undefined) {
        queueDepth.add(body.remaining);
      }
    } catch (_) {
      // Body parse failure — cron still succeeded (HTTP 200)
    }
  }

  check(res, { "cron 200": (r) => r.status === 200 });

  // No sleep — constant-arrival-rate controls frequency
}

// ─── Scenario: queue_sampler ──────────────────────────────────────────────────
// Polls Upstash LLEN every 30s and records queue_depth Gauge
export function sampleQueue() {
  // Guard: only runs if Upstash credentials are configured
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    return;
  }

  const res = http.post(
    `${UPSTASH_URL}/pipeline`,
    JSON.stringify([["LLEN", "tap-log:pending"]]),
    {
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        "Content-Type": "application/json",
      },
      tags: { name: "queue_sample" },
    }
  );

  if (res.status === 200) {
    try {
      const body = JSON.parse(res.body);
      const depth = body[0]?.result ?? 0;
      queueDepth.add(depth);
    } catch (_) {
      // Ignore parse failures
    }
  }

  check(res, { "queue sample 200": (r) => r.status === 200 });

  // No sleep — constant-arrival-rate controls frequency
}

// ─── Default export ───────────────────────────────────────────────────────────
// Default function unused — each scenario uses its own exec function
export default function (data) {} // eslint-disable-line no-unused-vars

// ─── Summary ──────────────────────────────────────────────────────────────────
export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: " ", enableColors: true }),
    "load-tests/results/e2e-load-summary.json": JSON.stringify(data, null, 2),
  };
}
