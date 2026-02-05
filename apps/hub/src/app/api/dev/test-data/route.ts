import { NextResponse } from "next/server";
import { db } from "@sparkmotion/database";

export const dynamic = "force-dynamic";

/**
 * GET /api/dev/test-data
 *
 * Returns orgs, active events, and bands for the dev test panel.
 * Only enabled in development mode.
 */
export async function GET() {
  // Only allow in development
  if (process.env.NODE_ENV === "production" && !process.env.ENABLE_DEV_TEST_PANEL) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const orgs = await db.organization.findMany({
    select: {
      id: true,
      name: true,
      events: {
        where: { status: "ACTIVE" },
        select: {
          id: true,
          name: true,
          bands: {
            where: { status: "ACTIVE" },
            select: {
              id: true,
              bandId: true,
            },
            take: 100,
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ orgs });
}
