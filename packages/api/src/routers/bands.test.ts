import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';

// ─── Module-level mocks ────────────────────────────────────────────────────────

vi.mock('@sparkmotion/database', async () => {
  const { prismaMock } = await import('../test-mocks');
  return {
    db: prismaMock,
    Prisma: {
      sql: vi.fn((...args: unknown[]) => args),
      join: vi.fn((arr: unknown[]) => arr),
      PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
        code: string;
        constructor(message: string, { code }: { code: string }) {
          super(message);
          this.code = code;
        }
      },
    },
  };
});

vi.mock('@sparkmotion/redis', () => ({
  invalidateEventCache: vi.fn().mockResolvedValue(undefined),
  invalidateBandCache: vi.fn().mockResolvedValue(undefined),
}));

import { createTestCaller, createMockBand, createMockEvent } from '../test-utils';
import { prismaMock } from '../test-mocks';

// ─── Setup ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
  mockReset(prismaMock);
  vi.clearAllMocks();
  prismaMock.changeLog.create.mockResolvedValue({} as any);
});

// ─── bands.list ───────────────────────────────────────────────────────────────
describe('bands.list', () => {
  it('returns paginated bands for a given event', async () => {
    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const mockBands = [{ ...createMockBand(), tag: null }];
    prismaMock.band.findMany.mockResolvedValue(mockBands as any);
    prismaMock.band.count.mockResolvedValue(1);

    const result = await caller.bands.list({ eventId: 'event-1' });

    expect(prismaMock.band.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ eventId: 'event-1', deletedAt: null }),
      })
    );
    expect(result.bands).toHaveLength(1);
    expect(result.totalCount).toBe(1);
    expect(result.page).toBe(1);
  });

  it('unauthenticated caller is rejected with UNAUTHORIZED', async () => {
    const caller = createTestCaller(undefined);

    await expect(caller.bands.list({ eventId: 'event-1' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});

// ─── bands.listAll ────────────────────────────────────────────────────────────
describe('bands.listAll', () => {
  it('ADMIN returns all bands across all orgs', async () => {
    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const mockBands = [
      {
        ...createMockBand(),
        event: { id: 'event-1', name: 'Test', status: 'ACTIVE' },
        tag: null,
      },
    ];
    prismaMock.band.findMany.mockResolvedValue(mockBands as any);
    prismaMock.band.count.mockResolvedValue(1);

    const result = await caller.bands.listAll({});

    expect(prismaMock.band.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      })
    );
    expect(result.bands).toHaveLength(1);
  });

  it('CUSTOMER scopes bands by their org', async () => {
    const caller = createTestCaller({ role: 'CUSTOMER', orgId: 'org-1' });
    prismaMock.band.findMany.mockResolvedValue([]);
    prismaMock.band.count.mockResolvedValue(0);

    await caller.bands.listAll({});

    expect(prismaMock.band.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          event: expect.objectContaining({ orgId: 'org-1' }),
        }),
      })
    );
  });
});

// ─── bands.uploadBatch ────────────────────────────────────────────────────────
describe('bands.uploadBatch', () => {
  it('batch creates bands for an event', async () => {
    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const mockEvent = createMockEvent();
    prismaMock.event.findUnique.mockResolvedValue(mockEvent as any);
    prismaMock.band.createMany.mockResolvedValue({ count: 3 });
    prismaMock.band.count.mockResolvedValue(0);

    const result = await caller.bands.uploadBatch({
      eventId: 'event-1',
      bandIds: ['BAND-001', 'BAND-002', 'BAND-003'],
    });

    expect(prismaMock.band.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ bandId: 'BAND-001', eventId: 'event-1' }),
        ]),
        skipDuplicates: true,
      })
    );
    expect(result.created).toBe(3);
    expect(result.existingInOtherEvents).toBe(0);
  });

  it('returns NOT_FOUND when event does not exist', async () => {
    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    prismaMock.event.findUnique.mockResolvedValue(null);

    await expect(
      caller.bands.uploadBatch({ eventId: 'no-such-event', bandIds: ['BAND-001'] })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('CUSTOMER cannot upload to another org event', async () => {
    const caller = createTestCaller({ role: 'CUSTOMER', orgId: 'org-2' });
    const mockEvent = createMockEvent({ orgId: 'org-1' });
    prismaMock.event.findUnique.mockResolvedValue(mockEvent as any);

    await expect(
      caller.bands.uploadBatch({ eventId: 'event-1', bandIds: ['BAND-001'] })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

// ─── bands.activityFeed ───────────────────────────────────────────────────────
describe('bands.activityFeed', () => {
  it('returns paginated tap logs filtered by eventId', async () => {
    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const mockLog = {
      id: 'log-1',
      bandId: 'band-1',
      eventId: 'event-1',
      tappedAt: new Date(),
      windowId: null,
      band: {
        bandId: 'BAND-001',
        name: null,
        tagId: null,
        autoAssigned: false,
        autoAssignDistance: null,
        flagged: false,
        tag: null,
      },
      event: { name: 'Test Event' },
    };
    prismaMock.tapLog.findMany.mockResolvedValue([mockLog] as any);
    prismaMock.tapLog.count.mockResolvedValue(1);

    const result = await caller.bands.activityFeed({ eventId: 'event-1' });

    expect(prismaMock.tapLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { eventId: 'event-1' } })
    );
    expect(result.logs).toHaveLength(1);
    expect(result.totalCount).toBe(1);
  });

  it('CUSTOMER scopes activity feed to their org events', async () => {
    const caller = createTestCaller({ role: 'CUSTOMER', orgId: 'org-1' });
    prismaMock.event.findMany.mockResolvedValue([{ id: 'event-1' }] as any);
    prismaMock.tapLog.findMany.mockResolvedValue([]);
    prismaMock.tapLog.count.mockResolvedValue(0);

    await caller.bands.activityFeed({});

    expect(prismaMock.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ orgId: 'org-1', deletedAt: null }),
      })
    );
  });
});

// ─── bands.bulkReassign ───────────────────────────────────────────────────────
describe('bands.bulkReassign', () => {
  it('reassigns bands to a target event and returns updated count', async () => {
    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const targetEvent = createMockEvent({ id: 'event-2', orgId: 'org-1' });
    const sourceBands = [{ id: 'band-1', bandId: 'BAND-001', eventId: 'event-1' }];
    prismaMock.event.findUnique.mockResolvedValue(targetEvent as any);
    prismaMock.band.findMany.mockResolvedValue(sourceBands as any);
    prismaMock.band.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.tapLog.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.band.updateMany.mockResolvedValue({ count: 1 });

    const result = await caller.bands.bulkReassign({
      bandIds: ['band-1'],
      targetEventId: 'event-2',
    });

    expect(prismaMock.band.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['band-1'] } },
        data: expect.objectContaining({ eventId: 'event-2' }),
      })
    );
    expect(result.updated).toBe(1);
  });

  it('CUSTOMER cannot bulk reassign to an event outside their org', async () => {
    const caller = createTestCaller({ role: 'CUSTOMER', orgId: 'org-2' });
    const targetEvent = createMockEvent({ id: 'event-2', orgId: 'org-1' });
    prismaMock.event.findUnique.mockResolvedValue(targetEvent as any);

    await expect(
      caller.bands.bulkReassign({ bandIds: ['band-1'], targetEventId: 'event-2' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
