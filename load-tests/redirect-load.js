import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.1.0/index.js";

// ─── Config ───────────────────────────────────────────────────────────────────
const WORKER_URL = __ENV.WORKER_URL;
if (!WORKER_URL) throw new Error("WORKER_URL env var is required");

const BAND_COUNT = 200_000;
const BAND_PREFIX = "LOADTEST-";

// ─── Custom Metrics ───────────────────────────────────────────────────────────
const redirectLatency = new Trend("redirect_latency", true);
const errorRate = new Rate("error_rate");

// ─── Scenarios ────────────────────────────────────────────────────────────────
//   Phase 1: Warmup     — 30s  @ 100 RPS
//   Phase 2: Sustained  — 3min @ 667 RPS  (200K taps in 5 min pace)
//   Phase 3: Burst      — 1min @ 2000 RPS (3x target)
export const options = {
  scenarios: {
    warmup: {
      executor: "constant-arrival-rate",
      rate: 100,
      timeUnit: "1s",
      duration: "30s",
      preAllocatedVUs: 50,
      maxVUs: 200,
      startTime: "0s",
    },
    sustained: {
      executor: "constant-arrival-rate",
      rate: 667,
      timeUnit: "1s",
      duration: "3m",
      preAllocatedVUs: 200,
      maxVUs: 1000,
      startTime: "30s",
    },
    burst: {
      executor: "constant-arrival-rate",
      rate: 2000,
      timeUnit: "1s",
      duration: "1m",
      preAllocatedVUs: 500,
      maxVUs: 3000,
      startTime: "3m30s",
    },
  },
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

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: " ", enableColors: true }),
    "results/redirect-load-summary.json": JSON.stringify(data, null, 2),
  };
}
