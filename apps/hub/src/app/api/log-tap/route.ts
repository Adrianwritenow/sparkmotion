import { NextRequest, NextResponse } from "next/server";
import { db } from "@sparkmotion/database";

export const runtime = "nodejs";

interface LogTapPayload {
  bandId: string;    // The NFC band ID (e.g. "BAND-0001")
  eventId: string;   // The event CUID
  mode: string;      // "pre" | "live" | "post"
  redirectUrl: string;
  userAgent?: string;
  ipAddress?: string;
}

/**
 * POST /api/log-tap
 *
 * Called by the Cloudflare Worker (fire-and-forget via waitUntil) to persist
 * tap data to the database. Secured with LOG_TAP_SECRET bearer token.
 *
 * Best-effort: if this endpoint is slow or drops requests during peak,
 * redirects and real-time dashboards still work (Redis has the analytics).
 */
export async function POST(request: NextRequest) {
  // Verify shared secret
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token || token !== process.env.LOG_TAP_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: LogTapPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { bandId, eventId, mode, redirectUrl, userAgent, ipAddress } = payload;

  if (!bandId || !eventId || !mode || !redirectUrl) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    // Look up the internal band record by bandId string
    const band = await db.band.findUnique({
      where: { bandId },
      select: { id: true },
    });

    if (!band) {
      // Band not in DB — skip logging (KV map may be stale)
      return NextResponse.json({ error: "Band not found" }, { status: 404 });
    }

    // Replicate the same DB writes as apps/hub/src/app/e/route.ts logTap()
    await Promise.all([
      db.tapLog.create({
        data: {
          bandId: band.id,
          eventId,
          modeServed: mode,
          redirectUrl,
          userAgent,
          ipAddress,
        },
      }),
      // Atomic firstTapAt — only sets on first tap
      db.band.updateMany({
        where: { bandId, firstTapAt: null },
        data: { firstTapAt: new Date() },
      }),
      // Always update lastTapAt and increment tapCount
      db.band.update({
        where: { bandId },
        data: {
          lastTapAt: new Date(),
          tapCount: { increment: 1 },
        },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Log-tap DB write failed:", {
      bandId,
      eventId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
