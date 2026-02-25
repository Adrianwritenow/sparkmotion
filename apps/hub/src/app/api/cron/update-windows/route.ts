import { NextRequest, NextResponse } from "next/server";
import { updateEventWindows } from "@sparkmotion/api";

export const dynamic = "force-dynamic"; // Never cache this route
export const maxDuration = 60; // Allow up to 60s execution

/**
 * Cron endpoint for automated window scheduling.
 *
 * Runs every minute (Vercel minimum interval) to activate/deactivate event windows
 * based on their scheduled start/end times.
 *
 * Note: Vercel Cron minimum interval is 1 minute, not 30 seconds.
 * Windows transitioning within 60s is acceptable for v1.0.
 *
 * Secured with CRON_SECRET bearer token validation.
 */
export async function GET(request: NextRequest) {
  // 1. Verify CRON_SECRET
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Execute scheduling logic
  try {
    const result = await updateEventWindows();
    return NextResponse.json({
      success: true,
      eventsProcessed: result.eventsProcessed,
      eventsChanged: result.eventsChanged,
    });
  } catch (error) {
    console.error("Cron execution failed:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
