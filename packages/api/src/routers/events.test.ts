import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';

// ─── Module-level mocks ────────────────────────────────────────────────────────
// Routers import `db` at module scope from @sparkmotion/database, so the entire
// module must be mocked before any router code runs.
//
// The vi.mock factory uses an async import of test-mocks.ts (not test-utils.ts).
// test-mocks.ts has NO router imports, so it does not create a circular dependency
// with the router under test.

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

vi.mock('../lib/engagement', () => ({
  getEventEngagement: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock('../services/evaluate-schedule', () => ({
  evaluateEventSchedule: vi.fn().mockResolvedValue(undefined),
}));

import { createTestCaller, createMockEvent } from '../test-utils';
import { prismaMock } from '../test-mocks';
import { invalidateEventCache } from '@sparkmotion/redis';
import { getEventEngagement } from '../lib/engagement';

// ─── Setup ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
  mockReset(prismaMock);
  vi.clearAllMocks();
  prismaMock.changeLog.create.mockResolvedValue({} as any);
});

// ─── events.list ──────────────────────────────────────────────────────────────
describe('events.list', () => {
  it('ADMIN returns all events without org filter', async () => {
    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const mockEvents = [
      { ...createMockEvent(), org: {}, windows: [], campaign: null, _count: { bands: 5 } },
    ];
    prismaMock.event.findMany.mockResolvedValue(mockEvents as any);
    prismaMock.$queryRaw.mockResolvedValue([]);

    const result = await caller.events.list({});

    expect(prismaMock.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null } })
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('event-1');
  });

  it('ADMIN can filter by orgId', async () => {
    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const mockEvents = [
      { ...createMockEvent({ orgId: 'org-2' }), org: {}, windows: [], campaign: null, _count: { bands: 0 } },
    ];
    prismaMock.event.findMany.mockResolvedValue(mockEvents as any);
    prismaMock.$queryRaw.mockResolvedValue([]);

    await caller.events.list({ orgId: 'org-2' });

    expect(prismaMock.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: 'org-2', deletedAt: null } })
    );
  });

  it('CUSTOMER auto-scopes to their org', async () => {
    const caller = createTestCaller({ role: 'CUSTOMER', orgId: 'org-1' });
    prismaMock.event.findMany.mockResolvedValue([]);
    prismaMock.$queryRaw.mockResolvedValue([]);

    await caller.events.list({});

    expect(prismaMock.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ orgId: 'org-1', deletedAt: null }) })
    );
  });

  it('unauthenticated caller is rejected with UNAUTHORIZED', async () => {
    const caller = createTestCaller(undefined);

    await expect(caller.events.list({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

// ─── events.byId ──────────────────────────────────────────────────────────────
describe('events.byId', () => {
  it('returns event with windows, band count, and currentMode', async () => {
    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const mockEvent = {
      ...createMockEvent(),
      org: {},
      windows: [
        {
          id: 'w-1',
          windowType: 'LIVE',
          isActive: true,
          url: '',
          startTime: null,
          endTime: null,
          isManual: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          eventId: 'event-1',
        },
      ],
      bands: [],
      campaign: null,
      _count: { bands: 3 },
    };
    prismaMock.event.findUniqueOrThrow.mockResolvedValue(mockEvent as any);
    vi.mocked(getEventEngagement).mockResolvedValueOnce(
      new Map([['event-1', { totalTaps: 10, engagementPercent: 0, elapsedWindows: 0, engagedPairs: 0 }]])
    );

    const result = await caller.events.byId({ id: 'event-1' });

    expect(prismaMock.event.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'event-1', deletedAt: null } })
    );
    expect(result.currentMode).toBe('live');
    expect(result.tapCount).toBe(10);
  });
});

// ─── events.create ────────────────────────────────────────────────────────────
describe('events.create', () => {
  it('ADMIN creates event, invalidateEventCache is NOT called for new events', async () => {
    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const newEvent = createMockEvent({ orgId: 'org-1' });
    prismaMock.event.create.mockResolvedValue(newEvent as any);

    const result = await caller.events.create({ orgId: 'org-1', name: 'Test Event' });

    expect(prismaMock.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orgId: 'org-1', name: 'Test Event' }),
      })
    );
    expect(invalidateEventCache).not.toHaveBeenCalled();
    expect(result.id).toBe('event-1');
  });

  it('CUSTOMER creates event scoped to their orgId', async () => {
    const caller = createTestCaller({ role: 'CUSTOMER', orgId: 'org-1' });
    const newEvent = createMockEvent({ orgId: 'org-1' });
    prismaMock.event.create.mockResolvedValue(newEvent as any);

    await caller.events.create({ orgId: 'org-other', name: 'Customer Event' });

    expect(prismaMock.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orgId: 'org-1' }),
      })
    );
  });
});

// ─── events.update ────────────────────────────────────────────────────────────
describe('events.update', () => {
  it('ADMIN updates event and invalidateEventCache IS called', async () => {
    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const existing = createMockEvent();
    const updated = createMockEvent({ name: 'Updated Event' });
    prismaMock.event.findUniqueOrThrow.mockResolvedValue(existing as any);
    prismaMock.event.update.mockResolvedValue(updated as any);

    const result = await caller.events.update({ id: 'event-1', name: 'Updated Event' });

    expect(prismaMock.event.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'event-1' } })
    );
    expect(invalidateEventCache).toHaveBeenCalledWith('event-1');
    expect(result.name).toBe('Updated Event');
  });

  it('CUSTOMER cannot update event from another org', async () => {
    const caller = createTestCaller({ role: 'CUSTOMER', orgId: 'org-2' });
    const existing = createMockEvent({ orgId: 'org-1' });
    prismaMock.event.findUniqueOrThrow.mockResolvedValue(existing as any);

    await expect(
      caller.events.update({ id: 'event-1', name: 'Hacked' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(prismaMock.event.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'event-1', deletedAt: null } })
    );
  });
});

// ─── events.delete ────────────────────────────────────────────────────────────
describe('events.delete', () => {
  it('ADMIN soft-deletes event', async () => {
    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const existing = createMockEvent();
    prismaMock.event.findUniqueOrThrow.mockResolvedValue(existing as any);
    prismaMock.band.findMany.mockResolvedValue([]);
    prismaMock.$transaction.mockImplementation(async (args: any) => {
      if (Array.isArray(args)) return args.map(() => ({}));
      return args(prismaMock);
    });
    prismaMock.event.update.mockResolvedValue(existing as any);
    prismaMock.band.updateMany.mockResolvedValue({ count: 0 } as any);

    await caller.events.delete({ id: 'event-1' });

    expect(prismaMock.event.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'event-1', deletedAt: null } })
    );
    expect(invalidateEventCache).toHaveBeenCalledWith('event-1');
  });

  it('CUSTOMER cannot delete event from another org', async () => {
    const caller = createTestCaller({ role: 'CUSTOMER', orgId: 'org-2' });
    const existing = createMockEvent({ orgId: 'org-1' });
    prismaMock.event.findUniqueOrThrow.mockResolvedValue(existing as any);

    await expect(caller.events.delete({ id: 'event-1' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
