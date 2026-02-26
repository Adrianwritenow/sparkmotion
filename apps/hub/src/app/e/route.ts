import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import {
  redis,
  getCachedBand,
  setCachedBand,
  recordTap,
  KEYS,
} from "@sparkmotion/redis";
import { db, Prisma } from "@sparkmotion/database";

const FALLBACK_URL = "https://sparkmotion.net";
const FLAGGED_DISTANCE_MILES = 50;

/**
 * Extract org slug from subdomain.
 * Returns null for localhost or single-level domains.
 */
function extractOrgSlug(hostname: string): string | null {
  // Skip non-production domains where subdomain isn't an org slug
  const isLocalhost = hostname.includes("localhost") || hostname.includes("127.0.0.1");
  const isVercelPreview = hostname.endsWith(".vercel.app");
  if (isLocalhost || isVercelPreview) return null;

  const parts = hostname.split(".");
  // Expect format: compassion.sparkmotion.net (3+ parts)
  if (parts.length >= 3) {
    return parts[0] ?? null;
  }

  return null;
}

/**
 * Auto-assign band to nearest org event using Vercel geo headers.
 * Falls back to event with active window, then first event by creation date.
 * Returns the created/fetched band with event and windows, or null if assignment failed.
 */
async function autoAssignBand(
  bandId: string,
  orgSlug: string,
  geo: { latitude: number; longitude: number } | null,
  eventId?: string | null
): Promise<{
  band: any;
  event: any;
  activeWindow: any;
  orgWebsiteUrl: string | null;
} | null> {
  try {
    // 1. Look up org by slug
    const org = await db.organization.findUnique({
      where: { slug: orgSlug },
      select: { id: true, websiteUrl: true },
    });

    if (!org) {
      console.log(`[AutoAssign] Org not found for slug: ${orgSlug}`);
      return null;
    }

    // 2. If explicit eventId provided (dev test panel), look up that specific event
    let nearestEvent: { id: string; name: string; distanceMiles?: number } | null = null;

    if (eventId) {
      const explicitEvent = await db.event.findFirst({
        where: {
          id: eventId,
          orgId: org.id,
          status: { in: ["ACTIVE", "DRAFT"] },
        },
        select: { id: true, name: true, latitude: true, longitude: true },
      });

      if (explicitEvent) {
        let distanceMiles: number | undefined;
        if (geo && explicitEvent.latitude && explicitEvent.longitude) {
          const result = await db.$queryRaw<Array<{ distanceMiles: number }>>(Prisma.sql`
            SELECT earth_distance(
              ll_to_earth(${geo.latitude}, ${geo.longitude}),
              ll_to_earth(CAST(${explicitEvent.latitude} AS float8), CAST(${explicitEvent.longitude} AS float8))
            ) / 1609.34 AS "distanceMiles"
          `);
          distanceMiles = result[0]?.distanceMiles;
        }
        nearestEvent = { id: explicitEvent.id, name: explicitEvent.name, distanceMiles };
        console.log(
          `[AutoAssign] Explicit eventId ${eventId}: ${explicitEvent.name}` +
            (distanceMiles != null ? ` (${distanceMiles.toFixed(1)} miles away)` : "")
        );
      } else {
        console.log(`[AutoAssign] Explicit eventId ${eventId} not found in org ${orgSlug}, falling through`);
      }
    }

    // 3. If Vercel geo headers available, find nearest event by coordinates
    if (!nearestEvent && geo) {
      console.log(
        `[AutoAssign] Vercel geo: ${geo.latitude}, ${geo.longitude}`
      );

      // Find nearest event with coordinates
      const events = await db.$queryRaw<
        Array<{
          id: string;
          name: string;
          distanceMiles: number;
          nextWindowStart: Date | null;
        }>
      >(Prisma.sql`
        SELECT
          e.id,
          e.name,
          earth_distance(
            ll_to_earth(${geo.latitude}, ${geo.longitude}),
            ll_to_earth(CAST(e.latitude AS float8), CAST(e.longitude AS float8))
          ) / 1609.34 AS "distanceMiles",
          (
            SELECT MIN(w."startTime")
            FROM "EventWindow" w
            WHERE w."eventId" = e.id
              AND w."startTime" > NOW()
          ) AS "nextWindowStart"
        FROM "Event" e
        WHERE e."orgId" = ${org.id}
          AND e.status IN ('ACTIVE', 'DRAFT')
          AND e.latitude IS NOT NULL
          AND e.longitude IS NOT NULL
        ORDER BY "distanceMiles" ASC, "nextWindowStart" ASC NULLS LAST
        LIMIT 1
      `);

      if (events.length > 0 && events[0]) {
        nearestEvent = events[0];
        console.log(
          `[AutoAssign] Nearest event: ${nearestEvent.name} (${nearestEvent.distanceMiles?.toFixed(1)} miles away)`
        );
      }
    }

    // 4. Fallback: find event with active window (time-based), then any event
    if (!nearestEvent) {
      const fallbackEvent = await db.event.findFirst({
        where: {
          orgId: org.id,
          status: { in: ["ACTIVE", "DRAFT"] },
        },
        orderBy: [
          { windows: { _count: "desc" } },
          { createdAt: "asc" },
        ],
        select: { id: true, name: true },
      });

      if (fallbackEvent) {
        nearestEvent = { id: fallbackEvent.id, name: fallbackEvent.name };
        console.log(`[AutoAssign] Using fallback event: ${fallbackEvent.name}`);
      }
    }

    // 5. If org has no events, redirect to org website
    if (!nearestEvent) {
      console.log(`[AutoAssign] No events found for org ${orgSlug}`);
      return null;
    }

    // 6. Create the band (with race condition handling)
    let band;
    try {
      band = await db.band.create({
        data: {
          bandId,
          eventId: nearestEvent.id,
          autoAssigned: true,
          autoAssignDistance: nearestEvent.distanceMiles ?? null,
          flagged: (nearestEvent.distanceMiles ?? 0) > FLAGGED_DISTANCE_MILES,
          firstTapAt: new Date(),
        },
        include: {
          event: {
            include: {
              windows: {
                where: { isActive: true },
                take: 1,
              },
            },
          },
        },
      });

      console.log(
        `[AutoAssign] Created band ${bandId} → event ${nearestEvent.name}`
      );
    } catch (error: any) {
      // Race condition: another request created the band
      if (error?.code === "P2002") {
        console.log(`[AutoAssign] Band ${bandId} already exists (race condition)`);
        // Use findFirst since bandId is no longer globally unique (compound unique with eventId)
        band = await db.band.findFirst({
          where: { bandId },
          include: {
            event: {
              include: {
                windows: {
                  where: { isActive: true },
                  take: 1,
                },
              },
            },
          },
        });

        if (!band) {
          console.error(`[AutoAssign] Band ${bandId} exists but couldn't fetch it`);
          return null;
        }
      } else {
        console.error(`[AutoAssign] Failed to create band ${bandId}:`, error);
        throw error;
      }
    }

    const activeWindow = band.event.windows[0];
    return { band, event: band.event, activeWindow, orgWebsiteUrl: org.websiteUrl ?? null };
  } catch (error) {
    console.error(`[AutoAssign] Error during auto-assignment:`, error);
    return null;
  }
}

/**
 * Extract geo coordinates from request headers.
 * Prefers x-real-* headers forwarded by the Cloudflare Worker proxy,
 * falls back to Vercel's auto-populated x-vercel-ip-* headers.
 */
function extractGeo(request: NextRequest): { latitude: number; longitude: number } | null {
  // Query param overrides (for testing flagged scans with custom locations)
  const qLat = parseFloat(request.nextUrl.searchParams.get("lat") || "");
  const qLng = parseFloat(request.nextUrl.searchParams.get("lng") || "");
  if (!isNaN(qLat) && !isNaN(qLng)) return { latitude: qLat, longitude: qLng };

  const lat = parseFloat(
    request.headers.get("x-real-latitude") || request.headers.get("x-vercel-ip-latitude") || ""
  );
  const lng = parseFloat(
    request.headers.get("x-real-longitude") || request.headers.get("x-vercel-ip-longitude") || ""
  );
  if (!isNaN(lat) && !isNaN(lng)) return { latitude: lat, longitude: lng };
  return null;
}

/** Fire-and-forget tap recording + Redis log push. */
function logTapAsync(
  request: NextRequest,
  params: {
    bandId: string;
    eventId: string;
    mode: string;
    windowId?: string | null;
    redirectUrl: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmTerm?: string;
    utmContent?: string;
  }
) {
  const promise = Promise.all([
    recordTap(params.eventId, params.bandId, params.mode),
    redis.lpush(
      KEYS.tapLogPending(),
      JSON.stringify({
        bandId: params.bandId,
        eventId: params.eventId,
        mode: params.mode,
        windowId: params.windowId ?? undefined,
        redirectUrl: params.redirectUrl,
        userAgent: request.headers.get("user-agent") ?? undefined,
        ipAddress:
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
        tappedAt: new Date().toISOString(),
        utmSource: params.utmSource,
        utmMedium: params.utmMedium,
        utmCampaign: params.utmCampaign,
        utmTerm: params.utmTerm,
        utmContent: params.utmContent,
      })
    ),
  ]).catch(console.error);
  waitUntil(promise);
}

/** Redirect a flagged band to a safe URL (org website or fallback). */
function redirectFlaggedBand(
  request: NextRequest,
  params: {
    bandId: string;
    eventId: string;
    safeUrl: string;
    distance: number | null;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmTerm?: string;
    utmContent?: string;
  }
) {
  console.log(
    `[Hub] Flagged band ${params.bandId} (${params.distance?.toFixed(1) ?? "?"}mi), redirecting to: ${params.safeUrl}`
  );
  logTapAsync(request, {
    bandId: params.bandId,
    eventId: params.eventId,
    mode: "pre",
    windowId: null,
    redirectUrl: params.safeUrl,
    utmSource: params.utmSource,
    utmMedium: params.utmMedium,
    utmCampaign: params.utmCampaign,
    utmTerm: params.utmTerm,
    utmContent: params.utmContent,
  });
  return NextResponse.redirect(params.safeUrl, 302);
}

export async function GET(request: NextRequest) {
  const bandId = request.nextUrl.searchParams.get("bandId");
  if (!bandId) {
    return NextResponse.json({ error: "bandId is required" }, { status: 400 });
  }

  // Optional: explicit eventId from dev test panel (not used in production NFC flow)
  const eventId = request.nextUrl.searchParams.get("eventId");

  // Parse UTM parameters
  const utmSource = request.nextUrl.searchParams.get("utm_source") || undefined;
  const utmMedium = request.nextUrl.searchParams.get("utm_medium") || undefined;
  const utmCampaign = request.nextUrl.searchParams.get("utm_campaign") || undefined;
  const utmTerm = request.nextUrl.searchParams.get("utm_term") || undefined;
  const utmContent = request.nextUrl.searchParams.get("utm_content") || undefined;

  // 1. Redis cache lookup
  let cached = await getCachedBand(bandId);

  // 2. Cache miss → DB fallback
  if (!cached) {
   try {
    // Find all bands with this bandId (supports multi-event bands)
    const bands = await db.band.findMany({
      where: { bandId },
      include: {
        event: {
          include: {
            windows: {
              where: { isActive: true },
              take: 1,
            },
            org: {
              select: { websiteUrl: true },
            },
          },
        },
      },
    });

    let band: typeof bands[0] | undefined;
    let activeWindow: typeof bands[0]["event"]["windows"][0] | undefined;

    // 3a. Single-event path: use the band directly
    if (bands.length === 1) {
      band = bands[0];
      activeWindow = band?.event?.windows[0];
    }
    // 3b. Multi-event path: select nearest event via GeoIP
    else if (bands.length > 1) {
      console.log(`[Hub] Band ${bandId} exists in ${bands.length} events, routing via GeoIP`);

      const multiGeo = extractGeo(request);

      if (multiGeo) {
        // Find nearest event using earthdistance
        const eventIds = bands.map((b) => b.eventId);
        const nearestEvents = await db.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`
            SELECT id
            FROM "Event"
            WHERE id = ANY(${eventIds})
              AND latitude IS NOT NULL
              AND longitude IS NOT NULL
            ORDER BY earth_distance(
              ll_to_earth(${multiGeo.latitude}, ${multiGeo.longitude}),
              ll_to_earth(CAST(latitude AS float8), CAST(longitude AS float8))
            ) ASC
            LIMIT 1
          `
        );

        if (nearestEvents.length > 0 && nearestEvents[0]) {
          // Match nearest event back to bands array
          band = bands.find((b) => b.eventId === nearestEvents[0]!.id);
          activeWindow = band?.event?.windows[0];
          console.log(`[Hub] Selected nearest event: ${band?.event.name}`);
        }
      }

      // Fallback: GeoIP unavailable or no events with coordinates
      if (!band) {
        console.log(`[Hub] GeoIP unavailable for multi-event band ${bandId}, using first event`);
        // Sort by event creation date (oldest first)
        const sortedBands = [...bands].sort(
          (a, b) => a.event.createdAt.getTime() - b.event.createdAt.getTime()
        );
        band = sortedBands[0];
        activeWindow = band?.event?.windows[0];
      }
    }

    // 3c. Band not found → auto-assignment flow
    let orgWebsiteUrl: string | undefined;
    if (!band) {
      console.log(`[Hub] Band ${bandId} not found, attempting auto-assignment`);

      // Extract org slug from subdomain
      const hostname = request.headers.get("host") || "";
      const orgSlug = extractOrgSlug(hostname)
        ?? request.nextUrl.searchParams.get("orgSlug");

      if (orgSlug) {
        // Attempt auto-assignment
        const assigned = await autoAssignBand(bandId, orgSlug, extractGeo(request), eventId);

        if (assigned) {
          band = assigned.band;
          activeWindow = assigned.activeWindow;
          console.log(`[Hub] Auto-assigned band ${bandId} to event ${assigned.event.name}`);
          orgWebsiteUrl = assigned.orgWebsiteUrl ?? undefined;

          // Flagged auto-assignment: never redirect to event URL.
          // Record the tap for Activity page review, then send to org website or fallback.
          if (assigned.band.flagged) {
            return redirectFlaggedBand(request, {
              bandId,
              eventId: assigned.event.id,
              safeUrl: assigned.orgWebsiteUrl || FALLBACK_URL,
              distance: assigned.band.autoAssignDistance,
              utmSource,
              utmMedium,
              utmCampaign,
              utmTerm,
              utmContent,
            });
          }
        } else {
          // Auto-assignment failed, check if org has websiteUrl
          const org = await db.organization.findUnique({
            where: { slug: orgSlug },
            select: { websiteUrl: true },
          });

          if (org?.websiteUrl) {
            console.log(`[Hub] Redirecting to org website: ${org.websiteUrl}`);
            return NextResponse.redirect(org.websiteUrl, 302);
          } else {
            console.log(`[Hub] No events and no websiteUrl for org ${orgSlug}`);
            return NextResponse.json(
              { error: "Organization has no active events" },
              { status: 404 }
            );
          }
        }
      } else {
        // No org slug (localhost or invalid subdomain), redirect to fallback
        console.log(`[Hub] No org slug found for hostname ${hostname}, redirecting to fallback`);
        return NextResponse.redirect(FALLBACK_URL, 302);
      }
    }

    // 4. Band found (either existing or just auto-assigned)
    if (!band || !band.event) {
      const dest = orgWebsiteUrl || FALLBACK_URL;
      // Only log if band exists — TapLog.bandId is NOT NULL and requires a valid bandId+eventId
      if (band) {
        logTapAsync(request, {
          bandId: band.bandId,
          eventId: band.eventId,
          mode: "pre",
          windowId: null,
          redirectUrl: dest,
          utmSource,
          utmMedium,
          utmCampaign,
          utmTerm,
          utmContent,
        });
      }
      return NextResponse.redirect(dest, 302);
    }

    // Flagged existing band: never redirect to event URL.
    // Record the tap for Activity page review, then send to org website or fallback.
    if (band.flagged) {
      return redirectFlaggedBand(request, {
        bandId,
        eventId: band.eventId,
        safeUrl: band.event.org?.websiteUrl || FALLBACK_URL,
        distance: band.autoAssignDistance ?? null,
        utmSource,
        utmMedium,
        utmCampaign,
        utmTerm,
        utmContent,
      });
    }

    const redirectUrl = activeWindow?.url ?? band.event.fallbackUrl;
    if (!redirectUrl) {
      const dest = band.event.org?.websiteUrl || FALLBACK_URL;
      logTapAsync(request, {
        bandId: band.bandId,
        eventId: band.eventId,
        mode: activeWindow?.windowType?.toLowerCase() ?? "pre",
        windowId: null,
        redirectUrl: dest,
        utmSource,
        utmMedium,
        utmCampaign,
        utmTerm,
        utmContent,
      });
      return NextResponse.redirect(dest, 302);
    }

    cached = {
      id: band.id,
      bandId: band.bandId,
      eventId: band.eventId,
      currentMode: activeWindow?.windowType.toLowerCase() ?? "pre",
      redirectUrl,
      windowId: activeWindow?.id ?? null,
    };

    // Cache for next lookup (fire-and-forget)
    // Only cache single-event bands. Multi-event bands must always run routing logic
    // to select the correct event based on user location.
    if (bands.length === 1) {
      setCachedBand(bandId, cached).catch(console.error);
    }
   } catch (dbError) {
    console.error(`[Hub] DB error for band ${bandId}:`, dbError);
    // Graceful fallback: redirect to org website or generic fallback
    const hostname = request.headers.get("host") || "";
    const orgSlug = extractOrgSlug(hostname);
    if (orgSlug) {
      try {
        const org = await db.organization.findUnique({
          where: { slug: orgSlug },
          select: { websiteUrl: true },
        });
        if (org?.websiteUrl) return NextResponse.redirect(org.websiteUrl, 302);
      } catch { /* DB still down, use hardcoded fallback */ }
    }
    return NextResponse.redirect(FALLBACK_URL, 302);
   }
  }

  // 3. Append UTM params to redirect URL
  let redirectUrl = cached.redirectUrl;
  if (utmSource || utmMedium || utmCampaign || utmTerm || utmContent) {
    const dest = new URL(cached.redirectUrl);
    if (utmSource) dest.searchParams.set("utm_source", utmSource);
    if (utmMedium) dest.searchParams.set("utm_medium", utmMedium);
    if (utmCampaign) dest.searchParams.set("utm_campaign", utmCampaign);
    if (utmTerm) dest.searchParams.set("utm_term", utmTerm);
    if (utmContent) dest.searchParams.set("utm_content", utmContent);
    redirectUrl = dest.toString();
  }

  // 4. Fire-and-forget: analytics + tap log queue
  logTapAsync(request, {
    bandId,
    eventId: cached.eventId,
    mode: cached.currentMode,
    windowId: cached.windowId,
    redirectUrl: cached.redirectUrl,
    utmSource,
    utmMedium,
    utmCampaign,
    utmTerm,
    utmContent,
  });

  // 5. Redirect
  return NextResponse.redirect(redirectUrl, 302);
}
