import { NextRequest, NextResponse } from "next/server";
import { db } from "@sparkmotion/database";
import {
  getCachedBand,
  setCachedBand,
  getCachedEventStatus,
  setCachedEventStatus,
  recordTap,
  getAnalytics,
  publishTapUpdate,
  redis,
} from "@sparkmotion/redis";
import type { CachedBand, CachedEventStatus } from "@sparkmotion/redis";

export const runtime = "nodejs"; // needs DB/Redis access
export const maxDuration = 10; // Keep serverless function alive for async logging

export async function GET(request: NextRequest) {
  const startTime = performance.now();
  const bandId = request.nextUrl.searchParams.get("bandId");
  if (!bandId) {
    return NextResponse.json({ error: "bandId is required" }, { status: 400 });
  }

  try {
    // 1. Check Redis cache for band
    let bandData = await getCachedBand(bandId);

    if (!bandData) {
      // 2. Cache miss — look up band in DB, auto-create if needed
      let band = await db.band.findUnique({
        where: { bandId },
        include: { event: true },
      });

      if (!band) {
        // Band not found — no event to redirect to
        return NextResponse.json({ error: "Unknown band" }, { status: 404 });
      }

      // Determine current mode from event windows
      const eventStatus = await resolveEventStatus(band.eventId);

      if (!eventStatus.redirectUrl) {
        return NextResponse.json({ error: "No active window" }, { status: 404 });
      }

      bandData = {
        id: band.id,
        bandId: band.bandId,
        eventId: band.eventId,
        status: band.status,
        currentMode: eventStatus.currentMode,
        redirectUrl: eventStatus.redirectUrl,
      };

      // Cache for next lookup (fire-and-forget, don't block response)
      setCachedBand(bandId, bandData).catch((err) =>
        console.error('Band cache write failed:', { bandId, error: err instanceof Error ? err.message : String(err) })
      );
    }

    if (bandData.status !== "ACTIVE") {
      return NextResponse.json({ error: "Band is disabled" }, { status: 403 });
    }

    // 3. Log tap asynchronously — don't block redirect
    logTap(bandData, request).catch((error) => {
      console.error('Tap logging failed:', {
        bandId: bandData.bandId,
        eventId: bandData.eventId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    });

    // 4. Redirect
    const duration = (performance.now() - startTime).toFixed(1);
    console.log(`[perf] redirect resolved in ${duration}ms`, { bandId, cached: !!bandData });
    return NextResponse.redirect(bandData.redirectUrl, 302);
  } catch (error) {
    console.error("Redirect error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

async function resolveEventStatus(eventId: string): Promise<CachedEventStatus> {
  // Check cache first
  const cached = await getCachedEventStatus(eventId);
  if (cached) return cached;

  // Fetch from DB
  const event = await db.event.findUniqueOrThrow({
    where: { id: eventId },
    include: {
      windows: { where: { isActive: true }, orderBy: { windowType: "asc" } },
    },
  });

  const activeWindow = event.windows[0]; // Highest priority active window
  const now = new Date();

  let currentMode: string;
  let activeWindowId: string | null = null;
  let redirectUrl: string | null = null;

  if (!activeWindow) {
    // No active windows — check scheduled windows
    const scheduledWindows = await db.eventWindow.findMany({
      where: {
        eventId,
        isManual: false,
        startTime: { lte: now },
        endTime: { gte: now },
      },
      orderBy: { windowType: "asc" },
    });

    const scheduled = scheduledWindows[0];
    if (scheduled) {
      currentMode = scheduled.windowType.toLowerCase();
      activeWindowId = scheduled.id;
      redirectUrl = scheduled.url;
    } else {
      currentMode = "pre"; // Default to pre-event
    }
  } else {
    currentMode = activeWindow.windowType.toLowerCase();
    activeWindowId = activeWindow.id;
    redirectUrl = activeWindow.url;
  }

  const status: CachedEventStatus = {
    currentMode,
    activeWindowId,
    redirectUrl,
  };

  // Cache for next lookup (fire-and-forget, don't block response)
  setCachedEventStatus(eventId, status).catch((err) =>
    console.error('Event status cache write failed:', { eventId, error: err instanceof Error ? err.message : String(err) })
  );
  return status;
}

async function logTap(bandData: CachedBand, request: NextRequest): Promise<void> {
  const userAgent = request.headers.get("user-agent") ?? undefined;
  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    undefined;

  // Fire-and-forget: update DB and Redis analytics in parallel
  await Promise.all([
    db.tapLog.create({
      data: {
        bandId: bandData.id,
        eventId: bandData.eventId,
        modeServed: bandData.currentMode,
        redirectUrl: bandData.redirectUrl,
        userAgent,
        ipAddress,
      },
    }),
    // Atomic firstTapAt update — only sets on first tap
    db.band.updateMany({
      where: { bandId: bandData.bandId, firstTapAt: null },
      data: { firstTapAt: new Date() },
    }),
    // Always update lastTapAt and increment tapCount
    db.band.update({
      where: { bandId: bandData.bandId },
      data: {
        lastTapAt: new Date(),
        tapCount: { increment: 1 },
      },
    }),
    recordTap(bandData.eventId, bandData.bandId, bandData.currentMode),
  ]);

  // Publish tap update to pub/sub (fire-and-forget, non-blocking)
  getAnalytics(bandData.eventId)
    .then((analytics) => {
      publishTapUpdate(redis, bandData.eventId, {
        totalTaps: analytics.totalTaps,
        uniqueTaps: analytics.uniqueTaps,
        mode: bandData.currentMode,
      }).catch((err) =>
        console.error('Tap update publish failed:', {
          eventId: bandData.eventId,
          error: err instanceof Error ? err.message : String(err),
        })
      );
    })
    .catch((err) =>
      console.error('Analytics fetch for publish failed:', {
        eventId: bandData.eventId,
        error: err instanceof Error ? err.message : String(err),
      })
    );
}
