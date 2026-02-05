import { db } from "@sparkmotion/database";

interface KVEntry {
  url: string;
  eventId: string;
  mode: string;
}

const CF_KV_BULK_LIMIT = 10_000; // Cloudflare bulk write limit per request

/**
 * Generates the redirect map and bulk-writes it to Cloudflare KV.
 *
 * For each active event, finds the current active window and maps every
 * assigned band to { url, eventId, mode }. Writes in batches of 10K.
 *
 * Gracefully skips if Cloudflare env vars are not set (local dev).
 */
export async function generateRedirectMap(): Promise<{
  bandsWritten: number;
  eventsProcessed: number;
  skipped: boolean;
}> {
  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CF_API_TOKEN;
  const namespaceId = process.env.CF_KV_NAMESPACE_ID;

  if (!accountId || !apiToken || !namespaceId) {
    console.log("Cloudflare KV env vars not set — skipping redirect map generation");
    return { bandsWritten: 0, eventsProcessed: 0, skipped: true };
  }

  // Fetch all active events with their active windows and bands
  const events = await db.event.findMany({
    where: { status: "ACTIVE" },
    include: {
      windows: {
        where: { isActive: true },
        orderBy: { windowType: "asc" },
      },
      bands: {
        where: { status: "ACTIVE" },
        select: { bandId: true },
      },
    },
  });

  // Build KV entries: one per band
  const entries: Array<{ key: string; value: string }> = [];

  for (const event of events) {
    const activeWindow = event.windows[0];
    if (!activeWindow) continue; // No active window — bands won't redirect

    const kvValue: KVEntry = {
      url: activeWindow.url,
      eventId: event.id,
      mode: activeWindow.windowType.toLowerCase(),
    };
    const valueJson = JSON.stringify(kvValue);

    for (const band of event.bands) {
      entries.push({ key: band.bandId, value: valueJson });
    }
  }

  // Bulk write in batches of 10K
  let written = 0;
  for (let i = 0; i < entries.length; i += CF_KV_BULK_LIMIT) {
    const batch = entries.slice(i, i + CF_KV_BULK_LIMIT);
    const response = await fetch(
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

    if (!response.ok) {
      const body = await response.text();
      console.error(`Cloudflare KV bulk write failed (batch ${i / CF_KV_BULK_LIMIT + 1}):`, body);
      throw new Error(`KV bulk write failed: ${response.status}`);
    }

    written += batch.length;
  }

  console.log(`Redirect map updated: ${written} bands across ${events.length} events`);
  return { bandsWritten: written, eventsProcessed: events.length, skipped: false };
}
