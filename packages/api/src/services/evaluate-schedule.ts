import { TZDate } from "@date-fns/tz";

type PrismaClient = {
  eventWindow: {
    findMany: (args: any) => Promise<any[]>;
    updateMany: (args: any) => Promise<any>;
    update: (args: any) => Promise<any>;
  };
};

/**
 * Evaluates which window should be active for a scheduled event and updates DB if state differs.
 *
 * Uses half-open interval: now >= start && now < end.
 * First-created window wins if multiple overlap (createdAt ordering).
 * Idempotent — only writes if state actually changed.
 *
 * @returns { changed, activeWindowId } where changed indicates if DB was updated
 */
export async function evaluateEventSchedule(
  tx: PrismaClient,
  eventId: string,
  timezone: string
): Promise<{ changed: boolean; activeWindowId: string | null }> {
  const allWindows = await tx.eventWindow.findMany({
    where: {
      eventId,
      startTime: { not: null },
      endTime: { not: null },
    },
    orderBy: { createdAt: "asc" },
  });

  if (allWindows.length === 0) {
    return { changed: false, activeWindowId: null };
  }

  const now = new TZDate(new Date(), timezone);

  // Find the first window that covers "now" (half-open interval)
  const shouldBeActive = allWindows.find((w: any) => {
    if (!w.startTime || !w.endTime) return false;
    const start = new TZDate(w.startTime, timezone);
    const end = new TZDate(w.endTime, timezone);
    const endInclusive = new Date(end.getTime() + 60_000);
    return now >= start && now < endInclusive;
  });

  // Compare desired state vs current state
  const currentlyActive = allWindows.filter((w: any) => w.isActive);
  const desiredId = shouldBeActive?.id ?? null;
  const currentIds = currentlyActive.map((w: any) => w.id);

  const alreadyCorrect =
    (desiredId === null && currentlyActive.length === 0) ||
    (desiredId !== null && currentlyActive.length === 1 && currentIds[0] === desiredId);

  if (alreadyCorrect) {
    return { changed: false, activeWindowId: desiredId };
  }

  // Deactivate all, then activate the matching one
  await tx.eventWindow.updateMany({
    where: { eventId },
    data: { isActive: false },
  });

  if (shouldBeActive) {
    await tx.eventWindow.update({
      where: { id: shouldBeActive.id },
      data: { isActive: true },
    });
  }

  return { changed: true, activeWindowId: desiredId };
}
