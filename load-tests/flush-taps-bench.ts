/**
 * Flush-Taps Cron Drain Benchmark
 *
 * 1. Seeds 100K entries into tap-log:pending
 * 2. Triggers flush-taps cron via HTTP
 * 3. Polls queue length to track drain progress
 * 4. Reports: items/sec, estimated time to drain 600K
 *
 * Prerequisites: seed.ts postgres (bands must exist for cron to resolve them)
 *
 * Usage: npx tsx load-tests/flush-taps-bench.ts
 */
import { PrismaClient } from "@sparkmotion/database";
import Redis from "ioredis";
import "dotenv/config";

// ─── Config ───────────────────────────────────────────────────────────────────
const SEED_COUNT = 100_000;
const BATCH_SIZE = 5_000;
const BAND_COUNT = 200_000;
const BAND_PREFIX = "LOADTEST-";
const POLL_INTERVAL_MS = 2_000;

const HUB_URL = process.env.HUB_URL;
const CRON_SECRET = process.env.CRON_SECRET;
const REDIS_URL = process.env.REDIS_URL;

if (!HUB_URL) throw new Error("HUB_URL env var is required");
if (!CRON_SECRET) throw new Error("CRON_SECRET env var is required");
if (!REDIS_URL) throw new Error("REDIS_URL env var is required");

const redis = new Redis(REDIS_URL);

function padBandId(n: number): string {
  return `${BAND_PREFIX}${String(n).padStart(6, "0")}`;
}

// ─── Step 1: Seed Redis Queue ─────────────────────────────────────────────────
async function seedQueue(eventId: string): Promise<void> {
  console.log(`Seeding ${SEED_COUNT.toLocaleString()} entries into tap-log:pending...`);
  const start = Date.now();

  const modes = ["pre", "live", "live", "live", "live", "live", "live", "post", "post"];

  for (let i = 0; i < SEED_COUNT; i += BATCH_SIZE) {
    const pipeline = redis.pipeline();
    const end = Math.min(i + BATCH_SIZE, SEED_COUNT);

    for (let j = i + 1; j <= end; j++) {
      const bandNum = Math.floor(Math.random() * BAND_COUNT) + 1;
      const mode = modes[Math.floor(Math.random() * modes.length)];

      pipeline.lpush(
        "tap-log:pending",
        JSON.stringify({
          bandId: padBandId(bandNum),
          eventId,
          mode,
          redirectUrl: "https://compassion.com/live",
          tappedAt: new Date().toISOString(),
        })
      );
    }

    await pipeline.exec();
  }

  const len = await redis.llen("tap-log:pending");
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Queue seeded: ${len.toLocaleString()} items (${elapsed}s)\n`);
}

// ─── Step 2: Trigger Cron ─────────────────────────────────────────────────────
async function triggerCron(): Promise<{ flushed: number; durationMs: number }> {
  const res = await fetch(`${HUB_URL}/api/cron/flush-taps`, {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Cron trigger failed: ${res.status} ${body}`);
  }

  return res.json();
}

// ─── Step 3: Poll and Report ──────────────────────────────────────────────────
async function run() {
  const db = new PrismaClient();

  console.log("=== Flush-Taps Drain Benchmark ===\n");

  // Look up real event ID from DB (must run seed.ts postgres first)
  const event = await db.event.findFirst({ where: { name: "Load Test Event" }, select: { id: true } });
  await db.$disconnect();
  if (!event) throw new Error("No loadtest event found. Run 'seed.ts postgres' first.");
  console.log(`Event ID: ${event.id}\n`);

  // Check if there's already data in the queue
  const existingLen = await redis.llen("tap-log:pending");
  if (existingLen > 0) {
    console.log(`Warning: queue already has ${existingLen.toLocaleString()} items. They will be drained too.\n`);
  }

  await seedQueue(event.id);

  const initialLen = await redis.llen("tap-log:pending");
  console.log(`Starting drain benchmark. Queue: ${initialLen.toLocaleString()} items\n`);

  const drainStart = Date.now();
  let totalDrained = 0;
  let cronCalls = 0;

  // Loop: trigger cron, check queue, repeat until empty
  while (true) {
    const queueLen = await redis.llen("tap-log:pending");
    if (queueLen === 0) break;

    console.log(`  Triggering cron (call #${cronCalls + 1}, queue: ${queueLen.toLocaleString()})...`);

    try {
      const result = await triggerCron();
      cronCalls++;
      totalDrained += result.flushed;
      console.log(`    Flushed: ${result.flushed.toLocaleString()} in ${result.durationMs}ms`);
    } catch (err) {
      console.error(`    Cron error:`, err);
      // Wait before retry
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      continue;
    }

    const remaining = await redis.llen("tap-log:pending");
    if (remaining === 0) break;

    // Brief pause between cron calls
    await new Promise((r) => setTimeout(r, 1000));
  }

  const totalDurationMs = Date.now() - drainStart;
  const totalDurationSec = totalDurationMs / 1000;
  const itemsPerSec = Math.round(totalDrained / totalDurationSec);
  const itemsPerMin = itemsPerSec * 60;
  const estimated600kMin = (600_000 / itemsPerMin).toFixed(1);

  console.log("\n=== Results ===");
  console.log(`Total drained:    ${totalDrained.toLocaleString()} items`);
  console.log(`Total time:       ${totalDurationSec.toFixed(1)}s`);
  console.log(`Cron calls:       ${cronCalls}`);
  console.log(`Throughput:       ${itemsPerSec.toLocaleString()} items/sec (${itemsPerMin.toLocaleString()} items/min)`);
  console.log(`Est. 600K drain:  ${estimated600kMin} minutes`);
  console.log();

  // Pass/fail
  const pass = itemsPerMin >= 100_000;
  console.log(`Verdict: ${pass ? "PASS (>100K/min)" : "FAIL (<100K/min — target is >100K/min)"}`);

  redis.disconnect();
}

run().catch((err) => {
  console.error("Benchmark failed:", err);
  redis.disconnect();
  process.exit(1);
});
