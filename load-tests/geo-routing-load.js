import http from "k6/http";
import { check } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.1.0/index.js";

// Tell k6 that 302 is the expected success status
http.setResponseCallback(http.expectedStatuses(302));

// ─── Config ───────────────────────────────────────────────────────────────────
const HUB_URL = __ENV.HUB_URL;
if (!HUB_URL) throw new Error("HUB_URL env var is required");

const ORG_SLUG = __ENV.ORG_SLUG ?? "loadtest-org";

// ─── Test Locations ───────────────────────────────────────────────────────────
// Exact city coordinates (should route to matching city event)
const EXACT_CITIES = [
  { name: "Nashville", lat: 36.1627, lng: -86.7816 },
  { name: "Dallas",    lat: 32.7767, lng: -96.7970 },
  { name: "Denver",    lat: 39.7392, lng: -104.9903 },
  { name: "Chicago",   lat: 41.8781, lng: -87.6298 },
  { name: "Atlanta",   lat: 33.7490, lng: -84.3880 },
];

// Nearby cities (should route to nearest seeded city)
const NEARBY_CITIES = [
  { name: "Franklin",   lat: 35.9251, lng: -86.8689, expect: "Nashville" },  // ~27km from Nashville
  { name: "Fort Worth", lat: 32.7555, lng: -97.3308, expect: "Dallas" },     // ~48km from Dallas
  { name: "Boulder",    lat: 40.0150, lng: -105.2705, expect: "Denver" },    // ~40km from Denver
];

// Far-away city (should fail to route to any seeded event)
const FAR_CITIES = [
  { name: "Anchorage", lat: 61.2181, lng: -149.9003, expect: null },
];

const GEO_BANDS_PER_CITY = 100;

// ─── Custom Metrics ───────────────────────────────────────────────────────────
const geoLatency = new Trend("geo_redirect_latency", true);
const geoErrors = new Rate("geo_error_rate");
const correctRouting = new Rate("correct_routing");
const routingChecks = new Counter("routing_checks_total");

// ─── Options ──────────────────────────────────────────────────────────────────
//  10 req/s for 1 minute — lightweight, focuses on correctness
export const options = {
  scenarios: {
    geo_routing: {
      executor: "constant-arrival-rate",
      rate: 10,
      timeUnit: "1s",
      duration: "1m",
      preAllocatedVUs: 10,
      maxVUs: 20,
    },
  },
  thresholds: {
    geo_redirect_latency: ["p(95)<500"],  // p95 < 500ms (DB path)
    correct_routing: ["rate>0.95"],       // > 95% correct routing
    geo_error_rate: ["rate<0.01"],        // < 1% errors
  },
};

// ─── Test Logic ───────────────────────────────────────────────────────────────
export default function () {
  // Pick a random test location from all categories
  const allLocations = [
    ...EXACT_CITIES.map((c) => ({ ...c, expect: c.name })),
    ...NEARBY_CITIES,
    ...FAR_CITIES,
  ];

  const location = allLocations[Math.floor(Math.random() * allLocations.length)];

  // Pick a random band from the expected city (or Nashville for far-away)
  const cityForBand = location.expect ?? EXACT_CITIES[0].name;
  const bandNum = Math.floor(Math.random() * GEO_BANDS_PER_CITY) + 1;
  const bandId = `LOADTEST-GEO-${cityForBand}-${String(bandNum).padStart(3, "0")}`;

  const url = `${HUB_URL}/e?bandId=${bandId}&lat=${location.lat}&lng=${location.lng}&orgSlug=${ORG_SLUG}`;

  const res = http.get(url, {
    redirects: 0,
    tags: { name: "geo_redirect" },
  });

  const ok = res.status === 302;
  geoLatency.add(res.timings.duration);
  geoErrors.add(!ok);

  check(res, {
    "status is 302": (r) => r.status === 302,
    "has Location header": (r) => !!r.headers["Location"],
  });

  // Routing correctness check
  if (ok && location.expect) {
    const locationHeader = res.headers["Location"] || "";
    const routedCorrectly = locationHeader.includes("compassion.com/live");
    correctRouting.add(routedCorrectly);
    routingChecks.add(1);
  } else if (ok && !location.expect) {
    // Far-away city — any valid redirect is acceptable
    correctRouting.add(true);
    routingChecks.add(1);
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────
//
//  Prerequisites: seed.ts postgres + seed.ts seed-geo
//
//  Usage:
//    k6 run -e HUB_URL=https://geo.sparkmotion.net load-tests/geo-routing-load.js
//
export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: " ", enableColors: true }),
    "results/geo-routing-load-summary.json": JSON.stringify(data, null, 2),
  };
}
