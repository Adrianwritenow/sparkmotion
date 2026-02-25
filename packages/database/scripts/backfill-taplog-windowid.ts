/**
 * Backfill TapLog.windowId for existing records.
 *
 * Strategy:
 * 1. Time-range matching: match taps to windows whose startTime/endTime bracket the tap.
 * 2. Fallback: for windows without times, match by modeServed where exactly one window
 *    of that type exists for the event.
 *
 * Run: npx tsx packages/database/scripts/backfill-taplog-windowid.ts
 */
import { PrismaClient } from "../generated/client";

const db = new PrismaClient();

async function main() {
  console.log("Backfilling TapLog.windowId...");

  // Step 1: Time-range matching
  const timeResult = await db.$executeRaw`
    UPDATE "TapLog" t
    SET "windowId" = ew."id"
    FROM "EventWindow" ew
    WHERE ew."eventId" = t."eventId"
      AND ew."startTime" IS NOT NULL
      AND ew."endTime" IS NOT NULL
      AND t."tappedAt" >= ew."startTime"
      AND t."tappedAt" <= ew."endTime"
      AND t."windowId" IS NULL
  `;
  console.log(`Step 1 (time-range): ${timeResult} rows updated`);

  // Step 2: modeServed fallback (only where exactly one window of that type exists)
  const modeResult = await db.$executeRaw`
    UPDATE "TapLog" t
    SET "windowId" = ew."id"
    FROM "EventWindow" ew
    WHERE ew."eventId" = t."eventId"
      AND LOWER(ew."windowType"::text) = t."modeServed"
      AND t."windowId" IS NULL
      AND (SELECT COUNT(*) FROM "EventWindow" ew2
           WHERE ew2."eventId" = t."eventId"
           AND ew2."windowType" = ew."windowType") = 1
  `;
  console.log(`Step 2 (mode fallback): ${modeResult} rows updated`);

  // Report remaining nulls
  const remaining = await db.tapLog.count({ where: { windowId: null } });
  console.log(`Remaining TapLog rows with windowId=null: ${remaining}`);
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
