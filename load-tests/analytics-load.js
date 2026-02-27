import http from "k6/http";
import { check, group, sleep } from "k6";
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
const kpisLatency = new Trend("kpis_latency", true);
const velocityLatency = new Trend("velocity_latency", true);
const eventSummaryLatency = new Trend("event_summary_latency", true);
const tapsByHourLatency = new Trend("taps_by_hour_latency", true);
const dashboardErrors = new Rate("dashboard_errors");

// ─── Options ──────────────────────────────────────────────────────────────────
//  10 concurrent dashboards polling every 5s = 2 iterations/sec for 2 min
export const options = {
  scenarios: {
    dashboard_polling: {
      executor: "constant-vus",
      vus: 10,
      duration: "2m",
    },
  },
  thresholds: {
    kpis_latency: ["p(95)<2000"],              // p95 < 2s
    velocity_latency: ["p(95)<500"],           // p95 < 500ms
    event_summary_latency: ["p(95)<2000"],     // p95 < 2s
    taps_by_hour_latency: ["p(95)<500"],       // p95 < 500ms
    dashboard_errors: ["rate<0.01"],           // < 1%
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

  // Build cookie header from CSRF response cookies
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

  // Extract session cookie
  const allCookies = loginRes.cookies;
  let sessionToken = null;

  // Try common NextAuth cookie names
  for (const name of ["authjs.session-token", "next-auth.session-token", "__Secure-authjs.session-token", "__Secure-next-auth.session-token"]) {
    if (allCookies[name] && allCookies[name].length > 0) {
      sessionToken = { name, value: allCookies[name][0].value };
      break;
    }
  }

  if (!sessionToken) {
    console.warn("Warning: No session cookie found in login response. Tests may fail with 401.");
    console.warn("Available cookies:", Object.keys(allCookies).join(", "));
    return { cookie: "" };
  }

  return { cookie: `${sessionToken.name}=${sessionToken.value}` };
}

// ─── tRPC helper ──────────────────────────────────────────────────────────────
function trpcQuery(cookie, procedure, input, tags) {
  const encodedInput = encodeURIComponent(JSON.stringify(input));
  const url = `${ADMIN_URL}/api/trpc/${procedure}?input=${encodedInput}`;

  return http.get(url, {
    headers: { Cookie: cookie },
    tags: tags,
  });
}

// ─── Test Logic ───────────────────────────────────────────────────────────────
export default function (data) {
  const cookie = data.cookie;

  // Simulate dashboard refresh: 4 queries fired together
  group("dashboard_refresh", () => {
    // 1. KPIs
    {
      const res = trpcQuery(cookie, "analytics.kpis", {
        from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        to: new Date().toISOString(),
      }, { name: "kpis" });

      const ok = res.status === 200;
      kpisLatency.add(res.timings.duration);
      dashboardErrors.add(!ok);
      check(res, { "kpis 200": (r) => r.status === 200 });
    }

    // 2. Velocity history
    {
      const res = trpcQuery(cookie, "analytics.velocityHistory", {
        eventId: EVENT_ID,
      }, { name: "velocity" });

      const ok = res.status === 200;
      velocityLatency.add(res.timings.duration);
      dashboardErrors.add(!ok);
      check(res, { "velocity 200": (r) => r.status === 200 });
    }

    // 3. Event summary
    {
      const res = trpcQuery(cookie, "analytics.eventSummary", {}, { name: "eventSummary" });

      const ok = res.status === 200;
      eventSummaryLatency.add(res.timings.duration);
      dashboardErrors.add(!ok);
      check(res, { "eventSummary 200": (r) => r.status === 200 });
    }

    // 4. Taps by hour
    {
      const res = trpcQuery(cookie, "analytics.tapsByHour", {
        eventId: EVENT_ID,
        hours: 24,
      }, { name: "tapsByHour" });

      const ok = res.status === 200;
      tapsByHourLatency.add(res.timings.duration);
      dashboardErrors.add(!ok);
      check(res, { "tapsByHour 200": (r) => r.status === 200 });
    }
  });

  // 5s poll interval
  sleep(5);
}

// ─── Summary ──────────────────────────────────────────────────────────────────
//
//  Usage:
//    k6 run \
//      -e ADMIN_URL=https://admin-staging.sparkmotion.net \
//      -e TEST_EMAIL=loadtest@sparkmotion.net \
//      -e TEST_PASSWORD=xxx \
//      -e LOADTEST_EVENT_ID=xxx \
//      load-tests/analytics-load.js
//
export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: " ", enableColors: true }),
    "results/analytics-load-summary.json": JSON.stringify(data, null, 2),
  };
}
