import http from "k6/http";
import { check } from "k6";
import { Rate, Trend } from "k6/metrics";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.1.0/index.js";

// Tell k6 that 302 is the expected success status (not an error)
http.setResponseCallback(http.expectedStatuses(302));

// ─── Config ───────────────────────────────────────────────────────────────────
const WORKER_URL = __ENV.WORKER_URL;
if (!WORKER_URL) throw new Error("WORKER_URL env var is required");

// local = max throughput (5K RPS), cloud = latency check (100 RPS)
const SCENARIO = __ENV.SCENARIO ?? "local";

const BAND_COUNT = 200_000;
const BAND_PREFIX = "LOADTEST-";

// ─── Custom Metrics ───────────────────────────────────────────────────────────
const redirectLatency = new Trend("redirect_latency", true);
const errorRate = new Rate("error_rate");

// ─── Scenario Definitions ─────────────────────────────────────────────────────
//
//  local: ramping-arrival-rate — guarantees 5K RPS throughput target
//    VU pool math: at p95<50ms each VU handles ~20 iter/s → 5000/20 = 250 VUs needed
//    preAllocatedVUs: 300, maxVUs: 400 to absorb burst without dropped_iterations
//    Stages: ramp 100→1K RPS (30s), ramp 1K→5K RPS (30s), sustain 5K (60s), ramp down (15s)
//
//  cloud: constant-arrival-rate — measures latency from cloud infrastructure (not max RPS)
//    Phase 1 Warmup:   50 RPS for 30s
//    Phase 2 Sustained: 100 RPS for 2min
//
const scenarios = {
  local: {
    load: {
      executor: "ramping-arrival-rate",
      startRate: 100,
      timeUnit: "1s",
      preAllocatedVUs: 300,
      maxVUs: 400,
      stages: [
        { duration: "30s", target: 1000 },  // ramp to 1K RPS
        { duration: "30s", target: 5000 },  // ramp to 5K RPS
        { duration: "60s", target: 5000 },  // sustain 5K RPS
        { duration: "15s", target: 0 },     // ramp down
      ],
    },
  },
  cloud: {
    warmup: {
      executor: "constant-arrival-rate",
      rate: 50,
      timeUnit: "1s",
      duration: "30s",
      preAllocatedVUs: 20,
      maxVUs: 50,
      startTime: "0s",
    },
    sustained: {
      executor: "constant-arrival-rate",
      rate: 100,
      timeUnit: "1s",
      duration: "2m",
      preAllocatedVUs: 30,
      maxVUs: 50,
      startTime: "30s",
    },
  },
};

// ─── Options ──────────────────────────────────────────────────────────────────
export const options = {
  scenarios: scenarios[SCENARIO],
  thresholds: {
    redirect_latency: [
      "p(50)<20",   // p50 < 20ms
      "p(95)<50",   // p95 < 50ms  ← critical SLA
      "p(99)<100",  // p99 < 100ms
    ],
    error_rate: ["rate<0.001"], // < 0.1%
  },
};

// ─── Test Logic ───────────────────────────────────────────────────────────────
export default function () {
  // Random band ID from seeded range
  const bandNum = Math.floor(Math.random() * BAND_COUNT) + 1;
  const bandId = `${BAND_PREFIX}${String(bandNum).padStart(6, "0")}`;

  const res = http.get(`${WORKER_URL}/e?bandId=${bandId}`, {
    redirects: 0, // Don't follow — measure Worker response only
    tags: { name: "redirect" },
  });

  // Worker returns 302 for known bands, or 302 to fallback for unknown
  const ok = res.status === 302;

  redirectLatency.add(res.timings.duration);
  errorRate.add(!ok);

  check(res, {
    "status is 302": (r) => r.status === 302,
    "has Location header": (r) => !!r.headers["Location"],
  });
}

// ─── Summary ──────────────────────────────────────────────────────────────────
//
//  Usage:
//    Local:  k6 run -e WORKER_URL=http://localhost:8787 load-tests/redirect-load.js
//    Cloud:  k6 run -e WORKER_URL=https://redirect.sparkmotion.workers.dev -e SCENARIO=cloud load-tests/redirect-load.js
//
export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: " ", enableColors: true }),
    "results/redirect-load-summary.json": JSON.stringify(data, null, 2),
  };
}
