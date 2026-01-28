import { NextRequest, NextResponse } from "next/server";
import { db } from "@sparkmotion/database";
import {
  getCachedBand,
  setCachedBand,
  getCachedEventStatus,
  setCachedEventStatus,
  recordTap,
} from "@sparkmotion/redis";
import type { CachedBand, CachedEventStatus } from "@sparkmotion/redis";

export const runtime = "nodejs"; // needs DB/Redis access

export async function GET(request: NextRequest) {
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
      const redirectUrl = getRedirectUrl(eventStatus);

      bandData = {
        bandId: band.bandId,
        eventId: band.eventId,
        status: band.status,
        currentMode: eventStatus.currentMode,
        redirectUrl,
      };

      // Cache for next lookup
      await setCachedBand(bandId, bandData);
    }

    if (bandData.status !== "ACTIVE") {
      return NextResponse.json({ error: "Band is disabled" }, { status: 403 });
    }

    // 3. Log tap asynchronously — don't block redirect
    logTap(bandData, request).catch(() => {});

    // 4. Redirect
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
    } else {
      currentMode = "pre"; // Default to pre-event
    }
  } else {
    currentMode = activeWindow.windowType.toLowerCase();
    activeWindowId = activeWindow.id;
  }

  const status: CachedEventStatus = {
    currentMode,
    activeWindowId,
    preUrl: event.preUrl,
    liveUrl: event.liveUrl,
    postUrl: event.postUrl,
  };

  await setCachedEventStatus(eventId, status);
  return status;
}

function getRedirectUrl(status: CachedEventStatus): string {
  switch (status.currentMode) {
    case "live":
      return status.liveUrl;
    case "post":
      return status.postUrl;
    default:
      return status.preUrl;
  }
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
        bandId: bandData.bandId,
        eventId: bandData.eventId,
        modeServed: bandData.currentMode,
        redirectUrl: bandData.redirectUrl,
        userAgent,
        ipAddress,
      },
    }),
    db.band.update({
      where: { bandId: bandData.bandId },
      data: {
        lastTapAt: new Date(),
        tapCount: { increment: 1 },
        firstTapAt: undefined, // Prisma will only set if null via a raw query — we'll handle this simply
      },
    }),
    recordTap(bandData.eventId, bandData.bandId, bandData.currentMode),
  ]);
}
