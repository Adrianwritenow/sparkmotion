import http from "k6/http";
import { check } from "k6";
import { Rate, Trend } from "k6/metrics";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.1.0/index.js";

// ─── Config ───────────────────────────────────────────────────────────────────
const ADMIN_URL = __ENV.ADMIN_URL;
const TEST_EMAIL = __ENV.TEST_EMAIL ?? "loadtest@sparkmotion.net";
const TEST_PASSWORD = __ENV.TEST_PASSWORD;
const EVENT_ID = __ENV.LOADTEST_EVENT_ID;

if (!ADMIN_URL) throw new Error("ADMIN_URL env var is required");
if (!TEST_PASSWORD) throw new Error("TEST_PASSWORD env var is required");
if (!EVENT_ID) throw new Error("LOADTEST_EVENT_ID env var is required");

// ─── Custom Metrics ───────────────────────────────────────────────────────────
const exportLatency = new Trend("csv_export_latency", true);
const exportErrors = new Rate("csv_export_errors");

// ─── Options ──────────────────────────────────────────────────────────────────
//  3 concurrent VUs, 5 iterations each (simulates 3 admins exporting at once)
export const options = {
  scenarios: {
    csv_export: {
      executor: "per-vu-iterations",
      vus: 3,
      iterations: 5,
    },
  },
  thresholds: {
    csv_export_latency: ["p(95)<10000"],  // p95 < 10s
    csv_export_errors: ["rate<0.05"],     // < 5%
  },
};

// ─── Auth: get session cookie in setup() ─────────────────────────────────────
export function setup() {
  // 1. Get CSRF token
  const csrfRes = http.get(`${ADMIN_URL}/api/auth/csrf`);
  check(csrfRes, { "csrf 200": (r) => r.status === 200 });

  const csrfBody = JSON.parse(csrfRes.body);
  const csrfToken = csrfBody.csrfToken;
  if (!csrfToken) throw new Error("Failed to get CSRF token");

  // Extract cookies from CSRF response
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
      redirects: 0,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookieHeader,
      },
    }
  );

  check(loginRes, {
    "login ok": (r) => r.status === 200 || r.status === 302,
  });

  // Extract session cookie
  const allCookies = loginRes.cookies;
  let sessionToken = null;

  for (const name of ["authjs.session-token", "next-auth.session-token", "__Secure-authjs.session-token", "__Secure-next-auth.session-token"]) {
    if (allCookies[name] && allCookies[name].length > 0) {
      sessionToken = { name, value: allCookies[name][0].value };
      break;
    }
  }

  if (!sessionToken) {
    console.warn("Warning: No session cookie found in login response. Tests may fail with 401.");
    return { cookie: "" };
  }

  return { cookie: `${sessionToken.name}=${sessionToken.value}` };
}

// ─── Test Logic ───────────────────────────────────────────────────────────────
export default function (data) {
  const cookie = data.cookie;

  // Call tRPC analytics.exportTaps endpoint
  const input = { eventId: EVENT_ID };
  const encodedInput = encodeURIComponent(JSON.stringify(input));
  const url = `${ADMIN_URL}/api/trpc/analytics.exportTaps?input=${encodedInput}`;

  const res = http.get(url, {
    headers: { Cookie: cookie },
    tags: { name: "csv_export" },
    timeout: "30s",
  });

  const ok = res.status === 200;
  exportLatency.add(res.timings.duration);
  exportErrors.add(!ok);

  check(res, {
    "status is 200": (r) => r.status === 200,
    "response has data": (r) => r.body && r.body.length > 100,
  });
}

// ─── Summary ──────────────────────────────────────────────────────────────────
//
//  Usage:
//    k6 run \
//      -e ADMIN_URL=https://admin-staging.sparkmotion.net \
//      -e TEST_EMAIL=loadtest@sparkmotion.net \
//      -e TEST_PASSWORD=xxx \
//      -e LOADTEST_EVENT_ID=xxx \
//      load-tests/csv-export-load.js
//
export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: " ", enableColors: true }),
    "results/csv-export-load-summary.json": JSON.stringify(data, null, 2),
  };
}
