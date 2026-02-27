import http from "k6/http";
import { check } from "k6";
import { Rate, Trend } from "k6/metrics";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.1.0/index.js";

// Tell k6 that 302 is the expected success status
http.setResponseCallback(http.expectedStatuses(302));

// ─── Config ───────────────────────────────────────────────────────────────────
const HUB_URL = __ENV.HUB_URL;
if (!HUB_URL) throw new Error("HUB_URL env var is required");

const SCENARIO = __ENV.SCENARIO ?? "local";
const BAND_COUNT = 200_000;
const BAND_PREFIX = "LOADTEST-";

// ─── Custom Metrics ───────────────────────────────────────────────────────────
const redirectLatency = new Trend("hub_redirect_latency", true);
const errorRate = new Rate("hub_error_rate");

// ─── Scenario Definitions ─────────────────────────────────────────────────────
//
//  Tests Hub /e endpoint on Vercel staging (DB/Redis path, not CF Worker KV).
//  Expect higher latency than Worker KV — target is p95 < 500ms.
//
//  local: ramp 10 → 100 → 500 RPS, sustain 60s
//  cloud: ramp 50 → 200 → 1000 RPS, sustain 60s
//
const scenarios = {
  local: {
    load: {
      executor: "ramping-arrival-rate",
      startRate: 10,
      timeUnit: "1s",
      preAllocatedVUs: 50,
      maxVUs: 200,
      stages: [
        { duration: "15s", target: 100 },   // ramp to 100 RPS
        { duration: "15s", target: 500 },   // ramp to 500 RPS
        { duration: "60s", target: 500 },   // sustain 500 RPS
        { duration: "10s", target: 0 },     // ramp down
      ],
    },
  },
  cloud: {
    load: {
      executor: "ramping-arrival-rate",
      startRate: 50,
      timeUnit: "1s",
      preAllocatedVUs: 100,
      maxVUs: 300,
      stages: [
        { duration: "15s", target: 200 },   // ramp to 200 RPS
        { duration: "15s", target: 1000 },  // ramp to 1K RPS
        { duration: "60s", target: 1000 },  // sustain 1K RPS
        { duration: "10s", target: 0 },     // ramp down
      ],
    },
  },
};

// ─── Options ──────────────────────────────────────────────────────────────────
export const options = {
  scenarios: scenarios[SCENARIO],
  thresholds: {
    hub_redirect_latency: [
      "p(50)<100",   // p50 < 100ms
      "p(95)<500",   // p95 < 500ms  ← target SLA
      "p(99)<1000",  // p99 < 1s
    ],
    hub_error_rate: ["rate<0.01"], // < 1%
  },
};

// ─── Test Logic ───────────────────────────────────────────────────────────────
export default function () {
  const bandNum = Math.floor(Math.random() * BAND_COUNT) + 1;
  const bandId = `${BAND_PREFIX}${String(bandNum).padStart(6, "0")}`;

  const res = http.get(`${HUB_URL}/e?bandId=${bandId}`, {
    redirects: 0, // Don't follow — measure Hub response only
    tags: { name: "hub_redirect" },
  });

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
//    Local:  k6 run -e HUB_URL=https://geo.sparkmotion.net load-tests/hub-redirect-load.js
//    Cloud:  k6 run --out cloud -e HUB_URL=https://geo.sparkmotion.net -e SCENARIO=cloud load-tests/hub-redirect-load.js
//
export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: " ", enableColors: true }),
    "results/hub-redirect-load-summary.json": JSON.stringify(data, null, 2),
  };
}
