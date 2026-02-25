import http from "k6/http";
import { check } from "k6";
import { Rate, Trend } from "k6/metrics";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.1.0/index.js";

// ─── Config ───────────────────────────────────────────────────────────────────
const UPSTASH_URL = __ENV.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = __ENV.UPSTASH_REDIS_REST_TOKEN;

const EVENT_ID = __ENV.LOADTEST_EVENT_ID;

if (!UPSTASH_URL) throw new Error("UPSTASH_REDIS_REST_URL env var is required");
if (!UPSTASH_TOKEN) throw new Error("UPSTASH_REDIS_REST_TOKEN env var is required");
if (!EVENT_ID) throw new Error("LOADTEST_EVENT_ID env var is required (real CUID from Event table)");
const BAND_COUNT = 200_000;
const BAND_PREFIX = "LOADTEST-";

// ─── Custom Metrics ───────────────────────────────────────────────────────────
const pipelineLatency = new Trend("pipeline_latency", true);
const pipelineErrors = new Rate("pipeline_errors");

// ─── Scenario ─────────────────────────────────────────────────────────────────
//   667 pipeline req/sec for 2 minutes = ~4.7K Redis commands/sec (7 cmds each)
export const options = {
  scenarios: {
    pipeline_load: {
      executor: "constant-arrival-rate",
      rate: 667,
      timeUnit: "1s",
      duration: "2m",
      preAllocatedVUs: 200,
      maxVUs: 1000,
    },
  },
  thresholds: {
    pipeline_latency: ["p(95)<100"],  // p95 < 100ms
    pipeline_errors: ["rate<0.01"],    // < 1%
  },
};

// ─── Test Logic ───────────────────────────────────────────────────────────────
// Reproduces the exact 7-command pipeline from worker.ts
export default function () {
  const bandNum = Math.floor(Math.random() * BAND_COUNT) + 1;
  const bandId = `${BAND_PREFIX}${String(bandNum).padStart(6, "0")}`;

  const hour = new Date().toISOString().slice(0, 13);
  const bucket = Math.floor(Date.now() / 10000);
  const mode = ["pre", "live", "post"][Math.floor(Math.random() * 3)];
  const now = new Date().toISOString();

  // Upstash REST pipeline: array of commands
  // Matches worker.ts logTap() exactly
  const commands = [
    ["INCR", `analytics:${EVENT_ID}:taps:total`],
    ["PFADD", `analytics:${EVENT_ID}:taps:unique`, bandId],
    ["INCR", `analytics:${EVENT_ID}:taps:hourly:${hour}`],
    ["INCR", `analytics:${EVENT_ID}:mode:${mode}`],
    ["INCR", `analytics:${EVENT_ID}:velocity:${bucket}`],
    ["EXPIRE", `analytics:${EVENT_ID}:velocity:${bucket}`, "1800"],
    ["LPUSH", "tap-log:pending", JSON.stringify({
      bandId,
      eventId: EVENT_ID,
      mode,
      redirectUrl: "https://compassion.com/live",
      tappedAt: now,
    })],
  ];

  const res = http.post(`${UPSTASH_URL}/pipeline`, JSON.stringify(commands), {
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      "Content-Type": "application/json",
    },
    tags: { name: "pipeline" },
  });

  const ok = res.status === 200;
  pipelineLatency.add(res.timings.duration);
  pipelineErrors.add(!ok);

  check(res, {
    "pipeline status 200": (r) => r.status === 200,
  });
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: " ", enableColors: true }),
    "results/upstash-pipeline-summary.json": JSON.stringify(data, null, 2),
  };
}
