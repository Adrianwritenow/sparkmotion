/**
 * Load Test Data Seeder
 *
 * Usage: pnpm --filter @sparkmotion/load-tests exec tsx seed.ts [kv|redis|postgres|seed-geo|seed-user|bench-queries|bench-csv|cleanup|all]
 *
 * Requires: .env with DATABASE_URL, REDIS_URL, CF_* vars
 */
import { PrismaClient } from "@sparkmotion/database";
import Redis from "ioredis";
import bcrypt from "bcryptjs";
import "dotenv/config";

// ─── Constants ────────────────────────────────────────────────────────────────
const BAND_COUNT = 200_000;
const TAP_LOG_COUNT = 600_000;
const BAND_PREFIX = "LOADTEST-";
const GEO_BAND_PREFIX = "LOADTEST-GEO-";
const ORG_NAME = "Load Test Org";
const EVENT_NAME = "Load Test Event";
const LIVE_URL = "https://compassion.com/live";

const KV_BATCH_SIZE = 10_000;
const DB_BATCH_SIZE = 5_000;
const REDIS_BATCH_SIZE = 5_000;

const GEO_BANDS_PER_CITY = 100;

const GEO_CITIES = [
  { name: "Nashville", state: "TN", lat: 36.1627, lng: -86.7816 },
  { name: "Dallas", state: "TX", lat: 32.7767, lng: -96.7970 },
  { name: "Denver", state: "CO", lat: 39.7392, lng: -104.9903 },
  { name: "Chicago", state: "IL", lat: 41.8781, lng: -87.6298 },
  { name: "Atlanta", state: "GA", lat: 33.7490, lng: -84.3880 },
];

// ─── Clients ──────────────────────────────────────────────────────────────────
const db = new PrismaClient();
let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL env var is required");
    redis = new Redis(url);
  }
  return redis;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function padBandId(n: number): string {
  return `${BAND_PREFIX}${String(n).padStart(6, "0")}`;
}

function elapsed(start: number): string {
  return `${((Date.now() - start) / 1000).toFixed(1)}s`;
}

// Gaussian random around center, clipped to [0, 1]
function gaussianRandom(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  num = num / 6 + 0.5; // center at 0.5, spread ~0.17
  return Math.max(0, Math.min(1, num));
}

// ─── KV Seeder ────────────────────────────────────────────────────────────────
async function seedKV() {
  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CF_API_TOKEN;
  const namespaceId = process.env.CF_KV_NAMESPACE_ID;

  if (!accountId || !apiToken || !namespaceId) {
    throw new Error("CF_ACCOUNT_ID, CF_API_TOKEN, CF_KV_NAMESPACE_ID are required");
  }

  console.log(`Seeding ${BAND_COUNT.toLocaleString()} bands into Cloudflare KV...`);
  const start = Date.now();

  // Get the event ID from DB (must run postgres seed first)
  const event = await db.event.findFirst({ where: { name: EVENT_NAME } });
  const eventId = event?.id ?? "loadtest-event-1";

  const kvValue = JSON.stringify({ url: LIVE_URL, eventId, mode: "live" });

  for (let i = 0; i < BAND_COUNT; i += KV_BATCH_SIZE) {
    const batch = [];
    const end = Math.min(i + KV_BATCH_SIZE, BAND_COUNT);
    for (let j = i + 1; j <= end; j++) {
      batch.push({ key: padBandId(j), value: kvValue });
    }

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/bulk`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batch),
      }
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`KV bulk write failed (batch ${Math.floor(i / KV_BATCH_SIZE) + 1}): ${res.status} ${body}`);
    }

    console.log(`  KV batch ${Math.floor(i / KV_BATCH_SIZE) + 1}/${Math.ceil(BAND_COUNT / KV_BATCH_SIZE)} written (${elapsed(start)})`);
  }

  console.log(`KV seeding complete: ${BAND_COUNT.toLocaleString()} bands in ${elapsed(start)}`);
}

// ─── PostgreSQL Seeder ────────────────────────────────────────────────────────
async function seedPostgres() {
  console.log("Seeding PostgreSQL with load test data...");
  const start = Date.now();

  // 1. Create org
  let org = await db.organization.findFirst({ where: { name: ORG_NAME } });
  if (!org) {
    org = await db.organization.create({
      data: { name: ORG_NAME, slug: "loadtest-org" },
    });
  }
  console.log(`  Org: ${org.id} (${elapsed(start)})`);

  // 2. Create event
  let event = await db.event.findFirst({ where: { name: EVENT_NAME, orgId: org.id } });
  if (!event) {
    event = await db.event.create({
      data: {
        orgId: org.id,
        name: EVENT_NAME,
        status: "ACTIVE",
        estimatedAttendees: 200_000,
      },
    });
  }
  console.log(`  Event: ${event.id} (${elapsed(start)})`);

  // 3. Create PRE window
  await db.eventWindow.upsert({
    where: { id: `${event.id}-pre` },
    update: {},
    create: {
      id: `${event.id}-pre`,
      eventId: event.id,
      windowType: "PRE",
      url: "https://compassion.com/pre",
      isActive: false,
    },
  });

  // 4. Create LIVE window (active)
  await db.eventWindow.upsert({
    where: { id: `${event.id}-live` },
    update: {},
    create: {
      id: `${event.id}-live`,
      eventId: event.id,
      windowType: "LIVE",
      url: LIVE_URL,
      isActive: true,
    },
  });
  console.log(`  Windows created (${elapsed(start)})`);

  // 5. Create 200K bands in batches
  console.log(`  Creating ${BAND_COUNT.toLocaleString()} bands...`);
  const existingCount = await db.band.count({ where: { eventId: event.id, bandId: { startsWith: BAND_PREFIX } } });

  if (existingCount >= BAND_COUNT) {
    console.log(`  Bands already exist (${existingCount.toLocaleString()}), skipping`);
  } else {
    // Delete partial seeds
    if (existingCount > 0) {
      await db.band.deleteMany({ where: { eventId: event.id, bandId: { startsWith: BAND_PREFIX } } });
    }

    for (let i = 0; i < BAND_COUNT; i += DB_BATCH_SIZE) {
      const batch = [];
      const end = Math.min(i + DB_BATCH_SIZE, BAND_COUNT);
      for (let j = i + 1; j <= end; j++) {
        batch.push({
          bandId: padBandId(j),
          eventId: event.id,
        });
      }
      await db.band.createMany({ data: batch });

      if ((i / DB_BATCH_SIZE + 1) % 10 === 0) {
        console.log(`  Bands: ${end.toLocaleString()}/${BAND_COUNT.toLocaleString()} (${elapsed(start)})`);
      }
    }
    console.log(`  All ${BAND_COUNT.toLocaleString()} bands created (${elapsed(start)})`);
  }

  // 6. Create 600K TapLog rows with realistic distribution
  console.log(`  Creating ${TAP_LOG_COUNT.toLocaleString()} tap logs...`);
  const existingTapCount = await db.tapLog.count({ where: { eventId: event.id } });

  if (existingTapCount >= TAP_LOG_COUNT) {
    console.log(`  TapLogs already exist (${existingTapCount.toLocaleString()}), skipping`);
  } else {
    if (existingTapCount > 0) {
      await db.tapLog.deleteMany({ where: { eventId: event.id } });
    }

    // Get band internal IDs for FK references
    const bands = await db.band.findMany({
      where: { eventId: event.id, bandId: { startsWith: BAND_PREFIX } },
      select: { id: true },
    });
    const bandIds = bands.map((b) => b.id);

    // 6-hour event window, Gaussian peak at center
    const eventStart = new Date();
    eventStart.setHours(eventStart.getHours() - 6);
    const durationMs = 6 * 60 * 60 * 1000;

    const modes = ["PRE", "LIVE", "LIVE", "LIVE", "LIVE", "LIVE", "LIVE", "POST", "POST"]; // 10% PRE, ~70% LIVE, ~20% POST
    const modeUrls: Record<string, string> = {
      PRE: "https://compassion.com/pre",
      LIVE: LIVE_URL,
      POST: "https://compassion.com/post",
    };

    for (let i = 0; i < TAP_LOG_COUNT; i += DB_BATCH_SIZE) {
      const batch = [];
      const end = Math.min(i + DB_BATCH_SIZE, TAP_LOG_COUNT);
      for (let j = i; j < end; j++) {
        const bandId = bandIds[Math.floor(Math.random() * bandIds.length)];
        const mode = modes[Math.floor(Math.random() * modes.length)];
        const timeOffset = gaussianRandom() * durationMs;
        const tappedAt = new Date(eventStart.getTime() + timeOffset);

        batch.push({
          bandId,
          eventId: event.id,
          modeServed: mode,
          redirectUrl: modeUrls[mode],
          tappedAt,
          userAgent: "k6-loadtest/1.0",
          ipAddress: `10.0.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`,
        });
      }
      await db.tapLog.createMany({ data: batch });

      if ((i / DB_BATCH_SIZE + 1) % 20 === 0) {
        console.log(`  TapLogs: ${end.toLocaleString()}/${TAP_LOG_COUNT.toLocaleString()} (${elapsed(start)})`);
      }
    }
    console.log(`  All ${TAP_LOG_COUNT.toLocaleString()} tap logs created (${elapsed(start)})`);
  }

  console.log(`PostgreSQL seeding complete in ${elapsed(start)}`);
}

// ─── Geo Seeder ──────────────────────────────────────────────────────────────
async function seedGeo() {
  console.log("Seeding geo routing test data (5 cities)...");
  const start = Date.now();

  // Ensure org exists (reuse the loadtest org)
  let org = await db.organization.findFirst({ where: { name: ORG_NAME } });
  if (!org) {
    org = await db.organization.create({
      data: { name: ORG_NAME, slug: "loadtest-org" },
    });
  }

  for (const city of GEO_CITIES) {
    const eventName = `LT Geo ${city.name}`;
    let event = await db.event.findFirst({ where: { name: eventName, orgId: org.id } });

    if (!event) {
      event = await db.event.create({
        data: {
          orgId: org.id,
          name: eventName,
          city: city.name,
          state: city.state,
          location: `${city.name}, ${city.state}`,
          latitude: city.lat,
          longitude: city.lng,
          status: "ACTIVE",
          estimatedAttendees: 5_000,
        },
      });
    } else {
      // Ensure lat/lng are set even if event already exists
      await db.event.update({
        where: { id: event.id },
        data: { latitude: city.lat, longitude: city.lng, status: "ACTIVE" },
      });
    }

    // Create LIVE window
    await db.eventWindow.upsert({
      where: { id: `${event.id}-live` },
      update: { isActive: true },
      create: {
        id: `${event.id}-live`,
        eventId: event.id,
        windowType: "LIVE",
        url: LIVE_URL,
        isActive: true,
      },
    });

    // Create bands: LOADTEST-GEO-Nashville-001 through LOADTEST-GEO-Nashville-100
    const prefix = `${GEO_BAND_PREFIX}${city.name}-`;
    const existingBands = await db.band.count({ where: { eventId: event.id, bandId: { startsWith: prefix } } });

    if (existingBands >= GEO_BANDS_PER_CITY) {
      console.log(`  ${city.name}: ${existingBands} bands already exist, skipping`);
    } else {
      if (existingBands > 0) {
        await db.band.deleteMany({ where: { eventId: event.id, bandId: { startsWith: prefix } } });
      }

      const batch = [];
      for (let i = 1; i <= GEO_BANDS_PER_CITY; i++) {
        batch.push({
          bandId: `${prefix}${String(i).padStart(3, "0")}`,
          eventId: event.id,
        });
      }
      await db.band.createMany({ data: batch });
      console.log(`  ${city.name}: event ${event.id}, ${GEO_BANDS_PER_CITY} bands created`);
    }
  }

  console.log(`Geo seeding complete in ${elapsed(start)}`);
}

// ─── User Seeder ─────────────────────────────────────────────────────────────
async function seedUser() {
  console.log("Seeding loadtest admin user...");
  const start = Date.now();

  const email = process.env.TEST_EMAIL ?? "loadtest@sparkmotion.net";
  const password = process.env.TEST_PASSWORD;
  if (!password) throw new Error("TEST_PASSWORD env var is required for seed-user");

  // Ensure org exists
  let org = await db.organization.findFirst({ where: { name: ORG_NAME } });
  if (!org) {
    org = await db.organization.create({
      data: { name: ORG_NAME, slug: "loadtest-org" },
    });
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`  User already exists: ${existing.id} (${email})`);
  } else {
    const hashed = await bcrypt.hash(password, 12);
    const user = await db.user.create({
      data: {
        email,
        name: "Load Test Admin",
        password: hashed,
        role: "ADMIN",
        orgId: org.id,
      },
    });
    console.log(`  User created: ${user.id} (${email})`);
  }

  console.log(`User seeding complete in ${elapsed(start)}`);
}

// ─── Redis Seeder ─────────────────────────────────────────────────────────────
async function seedRedis() {
  const r = getRedis();
  const QUEUE_SIZE = 100_000;

  console.log(`Seeding ${QUEUE_SIZE.toLocaleString()} entries into tap-log:pending...`);
  const start = Date.now();

  // Get event ID from DB
  const event = await db.event.findFirst({ where: { name: EVENT_NAME } });
  if (!event) throw new Error("Run 'seed.ts postgres' first to create the event");
  const eventId = event.id;

  const modes = ["pre", "live", "live", "live", "live", "live", "live", "post", "post"];

  for (let i = 0; i < QUEUE_SIZE; i += REDIS_BATCH_SIZE) {
    const pipeline = r.pipeline();
    const end = Math.min(i + REDIS_BATCH_SIZE, QUEUE_SIZE);

    for (let j = i + 1; j <= end; j++) {
      const bandNum = Math.floor(Math.random() * BAND_COUNT) + 1;
      const mode = modes[Math.floor(Math.random() * modes.length)];

      pipeline.lpush(
        "tap-log:pending",
        JSON.stringify({
          bandId: padBandId(bandNum),
          eventId,
          mode,
          redirectUrl: LIVE_URL,
          tappedAt: new Date().toISOString(),
        })
      );
    }

    await pipeline.exec();
    console.log(`  Redis: ${end.toLocaleString()}/${QUEUE_SIZE.toLocaleString()} (${elapsed(start)})`);
  }

  const queueLen = await r.llen("tap-log:pending");
  console.log(`Redis seeding complete: queue length = ${queueLen.toLocaleString()} (${elapsed(start)})`);
}

// ─── Query Benchmarks ─────────────────────────────────────────────────────────
async function benchQueries() {
  console.log("Running analytics query benchmarks against seeded data...\n");

  const event = await db.event.findFirst({ where: { name: EVENT_NAME } });
  if (!event) throw new Error("Run 'seed.ts postgres' first");

  const fromDate = new Date();
  fromDate.setHours(fromDate.getHours() - 24);
  const toDate = new Date();

  // 1. KPIs — COUNT + COUNT DISTINCT on 600K rows
  {
    const start = Date.now();
    const result = await db.$queryRaw<[{ total: bigint; unique_bands: bigint; active_events: bigint }]>`
      SELECT
        COUNT(*)::int AS total,
        COUNT(DISTINCT "bandId")::int AS unique_bands,
        COUNT(DISTINCT "eventId")::int AS active_events
      FROM "TapLog"
      WHERE "tappedAt" >= ${fromDate} AND "tappedAt" <= ${toDate}
        AND "eventId" = ${event.id}
    `;
    const ms = Date.now() - start;
    const pass = ms < 2000;
    console.log(`KPIs query:      ${ms}ms ${pass ? "PASS" : "FAIL (>2s)"}`);
    console.log(`  rows: ${Number(result[0]?.total ?? 0).toLocaleString()}, unique bands: ${Number(result[0]?.unique_bands ?? 0).toLocaleString()}\n`);
  }

  // 2. Peak TPM — GROUP BY minute
  {
    const start = Date.now();
    const result = await db.$queryRaw<Array<{ minute: Date; count: bigint }>>`
      SELECT DATE_TRUNC('minute', "tappedAt") as minute, COUNT(*)::int as count
      FROM "TapLog"
      WHERE "tappedAt" >= ${fromDate} AND "tappedAt" <= ${toDate}
        AND "eventId" = ${event.id}
      GROUP BY DATE_TRUNC('minute', "tappedAt")
      ORDER BY count DESC
      LIMIT 1
    `;
    const ms = Date.now() - start;
    const pass = ms < 2000;
    console.log(`Peak TPM query:  ${ms}ms ${pass ? "PASS" : "FAIL (>2s)"}`);
    console.log(`  peak: ${Number(result[0]?.count ?? 0).toLocaleString()} taps/min\n`);
  }

  // 3. Taps by day — GROUP BY DATE_TRUNC('day')
  {
    const start = Date.now();
    const result = await db.$queryRaw<Array<{ date: Date; count: bigint }>>`
      SELECT
        DATE_TRUNC('day', "tappedAt")::date as date,
        COUNT(*)::int as count
      FROM "TapLog"
      WHERE "tappedAt" >= ${fromDate} AND "tappedAt" <= ${toDate}
        AND "eventId" = ${event.id}
      GROUP BY DATE_TRUNC('day', "tappedAt")
      ORDER BY date ASC
    `;
    const ms = Date.now() - start;
    const pass = ms < 2000;
    console.log(`Taps by day:     ${ms}ms ${pass ? "PASS" : "FAIL (>2s)"}`);
    console.log(`  days: ${result.length}\n`);
  }

  // 4. Top events — JOIN + GROUP BY
  {
    const start = Date.now();
    const result = await db.$queryRaw<Array<{ eventId: string; eventName: string; tapCount: bigint }>>`
      SELECT
        t."eventId",
        e."name" as "eventName",
        COUNT(*)::int as "tapCount"
      FROM "TapLog" t
      INNER JOIN "Event" e ON t."eventId" = e."id"
      WHERE t."tappedAt" >= ${fromDate} AND t."tappedAt" <= ${toDate}
      GROUP BY t."eventId", e."name"
      ORDER BY "tapCount" DESC
      LIMIT 10
    `;
    const ms = Date.now() - start;
    const pass = ms < 2000;
    console.log(`Top events:      ${ms}ms ${pass ? "PASS" : "FAIL (>2s)"}`);
    console.log(`  events: ${result.length}, top: ${result[0]?.eventName ?? "none"} (${Number(result[0]?.tapCount ?? 0).toLocaleString()} taps)\n`);
  }

  console.log("Benchmark complete.");
}

// ─── CSV Export Benchmark ────────────────────────────────────────────────────
async function benchCsvExport() {
  console.log("Running CSV export benchmark...\n");

  const event = await db.event.findFirst({ where: { name: EVENT_NAME } });
  if (!event) throw new Error("Run 'seed.ts postgres' first");

  for (const rowCount of [50_000, 100_000, 600_000]) {
    const start = Date.now();

    // Query: matches what a real CSV export endpoint would do
    const rows = await db.$queryRaw<Array<{
      bandId: string;
      tappedAt: Date;
      modeServed: string;
      redirectUrl: string;
      userAgent: string | null;
      ipAddress: string | null;
    }>>`
      SELECT b."bandId", t."tappedAt", t."modeServed", t."redirectUrl", t."userAgent", t."ipAddress"
      FROM "TapLog" t
      INNER JOIN "Band" b ON t."bandId" = b."id"
      WHERE t."eventId" = ${event.id}
      ORDER BY t."tappedAt" DESC
      LIMIT ${rowCount}
    `;
    const queryMs = Date.now() - start;

    // Serialize to CSV string
    const csvStart = Date.now();
    const header = "bandId,tappedAt,modeServed,redirectUrl,userAgent,ipAddress\n";
    const csvRows = rows.map((r) =>
      `${r.bandId},${r.tappedAt.toISOString()},${r.modeServed},${r.redirectUrl},${r.userAgent ?? ""},${r.ipAddress ?? ""}`
    );
    const csv = header + csvRows.join("\n");
    const serializeMs = Date.now() - csvStart;

    const totalMs = Date.now() - start;
    const sizeMB = (Buffer.byteLength(csv) / 1024 / 1024).toFixed(1);
    const pass = totalMs < 10_000;

    console.log(`${rowCount.toLocaleString()} rows:  query ${queryMs}ms + serialize ${serializeMs}ms = ${totalMs}ms total (${sizeMB}MB)  ${pass ? "PASS" : "FAIL (>10s)"}`);
  }

  console.log("\nCSV export benchmark complete.");
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────
async function cleanup() {
  console.log("=== LOADTEST Cleanup ===\n");
  const start = Date.now();

  const r = getRedis();

  // ── Pre-cleanup audit ──────────────────────────────────────────────────────
  console.log("Pre-cleanup audit:");

  const org = await db.organization.findFirst({ where: { name: ORG_NAME } });
  if (!org) {
    console.log("  No loadtest org found — nothing to clean up.");
    return;
  }

  // Fetch all events under the org
  const events = await db.event.findMany({
    where: { orgId: org.id },
    select: { id: true, name: true },
  });
  const eventIds = events.map((e) => e.id);

  // Count records
  const bandCount = await db.band.count({ where: { eventId: { in: eventIds } } });
  const tapLogCount = await db.tapLog.count({ where: { eventId: { in: eventIds } } });
  const windowCount = await db.eventWindow.count({ where: { eventId: { in: eventIds } } });
  const userCount = await db.user.count({ where: { orgId: org.id } });

  console.log(`  Org: ${org.id} (${org.name})`);
  console.log(`  Events: ${events.length}`);
  events.forEach((e) => console.log(`    - ${e.name} (${e.id})`));
  console.log(`  Bands: ${bandCount.toLocaleString()}`);
  console.log(`  TapLogs: ${tapLogCount.toLocaleString()}`);
  console.log(`  Windows: ${windowCount}`);
  console.log(`  Users: ${userCount}`);

  // ── Safety gate ────────────────────────────────────────────────────────────
  const unsafeEvents = events.filter((e) =>
    !e.name.startsWith("LT ") && e.name !== EVENT_NAME
  );

  if (unsafeEvents.length > 0) {
    console.error("\n  SAFETY GATE FAILED: Found non-loadtest events under this org:");
    unsafeEvents.forEach((e) => console.error(`    - ${e.name} (${e.id})`));
    console.error("  Refusing to delete. Remove these events manually or verify the org is correct.");
    process.exit(1);
  }
  console.log("  Safety gate: PASSED (all events are loadtest events)\n");

  // ── 1. Redis cleanup ──────────────────────────────────────────────────────
  let totalRedisDeleted = 0;

  // Clean analytics keys for ALL loadtest events
  for (const eventId of eventIds) {
    let cursor = "0";
    do {
      const [nextCursor, keys] = await r.scan(cursor, "MATCH", `analytics:${eventId}:*`, "COUNT", 1000);
      cursor = nextCursor;
      if (keys.length > 0) {
        await r.del(...keys);
        totalRedisDeleted += keys.length;
      }
    } while (cursor !== "0");
  }
  console.log(`  Redis: ${totalRedisDeleted} analytics keys deleted (${elapsed(start)})`);

  // Clean band cache keys (band:LOADTEST-*)
  {
    let cursor = "0";
    let bandKeysDeleted = 0;
    do {
      const [nextCursor, keys] = await r.scan(cursor, "MATCH", `band:${BAND_PREFIX}*`, "COUNT", 1000);
      cursor = nextCursor;
      if (keys.length > 0) {
        await r.del(...keys);
        bandKeysDeleted += keys.length;
      }
    } while (cursor !== "0");
    if (bandKeysDeleted > 0) {
      console.log(`  Redis: ${bandKeysDeleted} band cache keys deleted (${elapsed(start)})`);
    }
  }

  // Clean pending queue
  const queueLen = await r.llen("tap-log:pending");
  if (queueLen > 0) {
    await r.del("tap-log:pending");
    console.log(`  Redis: tap-log:pending cleared (${queueLen.toLocaleString()} items) (${elapsed(start)})`);
  }

  // ── 2. PostgreSQL cleanup ─────────────────────────────────────────────────
  // Delete loadtest user(s) before org cascade
  const deletedUsers = await db.user.deleteMany({ where: { orgId: org.id } });
  if (deletedUsers.count > 0) {
    console.log(`  PostgreSQL: ${deletedUsers.count} user(s) deleted (${elapsed(start)})`);
  }

  await db.organization.delete({ where: { id: org.id } });
  console.log(`  PostgreSQL: org + cascaded data deleted (${elapsed(start)})`);

  // ── 3. Cloudflare KV cleanup ──────────────────────────────────────────────
  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CF_API_TOKEN;
  const namespaceId = process.env.CF_KV_NAMESPACE_ID;

  if (accountId && apiToken && namespaceId) {
    // Delete main loadtest bands
    const totalKvKeys = BAND_COUNT + (GEO_CITIES.length * GEO_BANDS_PER_CITY);
    console.log(`  KV: deleting ~${totalKvKeys.toLocaleString()} keys...`);

    for (let i = 0; i < BAND_COUNT; i += KV_BATCH_SIZE) {
      const keys = [];
      const end = Math.min(i + KV_BATCH_SIZE, BAND_COUNT);
      for (let j = i + 1; j <= end; j++) {
        keys.push(padBandId(j));
      }

      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/bulk`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(keys),
        }
      );

      if (!res.ok) {
        console.error(`  KV delete batch failed: ${res.status}`);
      }
    }

    // Delete geo band KV keys
    const geoKeys: string[] = [];
    for (const city of GEO_CITIES) {
      for (let i = 1; i <= GEO_BANDS_PER_CITY; i++) {
        geoKeys.push(`${GEO_BAND_PREFIX}${city.name}-${String(i).padStart(3, "0")}`);
      }
    }
    if (geoKeys.length > 0) {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/bulk`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(geoKeys),
        }
      );
      if (!res.ok) {
        console.error(`  KV geo delete failed: ${res.status}`);
      }
    }

    console.log(`  KV: all LOADTEST keys deleted (${elapsed(start)})`);
  } else {
    console.log("  KV: skipped (no CF env vars)");
  }

  // ── Post-cleanup verification ─────────────────────────────────────────────
  console.log("\nPost-cleanup verification:");

  const orgCheck = await db.organization.findFirst({ where: { name: ORG_NAME } });
  console.log(`  PostgreSQL org: ${orgCheck ? "STILL EXISTS (unexpected)" : "gone"}`);

  // Check Redis for leftover analytics keys
  let leftoverRedis = 0;
  for (const eventId of eventIds) {
    let cursor = "0";
    do {
      const [nextCursor, keys] = await r.scan(cursor, "MATCH", `analytics:${eventId}:*`, "COUNT", 1000);
      cursor = nextCursor;
      leftoverRedis += keys.length;
    } while (cursor !== "0");
  }
  console.log(`  Redis analytics keys: ${leftoverRedis === 0 ? "0 (clean)" : `${leftoverRedis} remaining (unexpected)`}`);

  // Check Redis for leftover band keys
  {
    let cursor = "0";
    let leftoverBandKeys = 0;
    do {
      const [nextCursor, keys] = await r.scan(cursor, "MATCH", `band:${BAND_PREFIX}*`, "COUNT", 1000);
      cursor = nextCursor;
      leftoverBandKeys += keys.length;
    } while (cursor !== "0");
    console.log(`  Redis band keys: ${leftoverBandKeys === 0 ? "0 (clean)" : `${leftoverBandKeys} remaining (unexpected)`}`);
  }

  const pendingLen = await r.llen("tap-log:pending");
  console.log(`  Redis pending queue: ${pendingLen === 0 ? "0 (clean)" : `${pendingLen} remaining (unexpected)`}`);

  console.log(`\nCleanup complete in ${elapsed(start)}`);
}

// ─── CLI Entrypoint ───────────────────────────────────────────────────────────
const COMMANDS: Record<string, () => Promise<void>> = {
  kv: seedKV,
  postgres: seedPostgres,
  redis: seedRedis,
  "seed-geo": seedGeo,
  "seed-user": seedUser,
  "bench-queries": benchQueries,
  "bench-csv": benchCsvExport,
  cleanup,
  all: async () => {
    await seedPostgres();
    await seedGeo();
    await seedUser();
    await seedKV();
    await seedRedis();
    await benchQueries();
  },
};

async function main() {
  const command = process.argv[2];

  if (!command || !COMMANDS[command]) {
    console.error(`Usage: pnpm --filter @sparkmotion/load-tests exec tsx seed.ts [${Object.keys(COMMANDS).join("|")}]`);
    process.exit(1);
  }

  try {
    await COMMANDS[command]();
  } catch (err) {
    console.error("Seed failed:", err);
    process.exit(1);
  } finally {
    await db.$disconnect();
    if (redis) redis.disconnect();
  }
}

main();
