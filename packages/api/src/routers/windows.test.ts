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
    },
  };
});

vi.mock('@sparkmotion/redis', () => ({
  invalidateEventCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/redirect-map-generator', () => ({
  generateRedirectMap: vi.fn().mockResolvedValue({
    skipped: false,
    bandsWritten: 0,
    eventsProcessed: 0,
  }),
}));

vi.mock('../services/evaluate-schedule', () => ({
  evaluateEventSchedule: vi.fn().mockResolvedValue({ changed: false }),
}));

import { prismaMock } from '../test-mocks';
import { createTestCaller, createMockEvent, createMockWindow } from '../test-utils';

beforeEach(() => {
  mockReset(prismaMock);
});

// ─── windows.list ──────────────────────────────────────────────────────────────

describe('windows.list', () => {
  it('rejects unauthenticated caller with UNAUTHORIZED', async () => {
    const caller = createTestCaller(undefined);
    await expect(caller.windows.list({ eventId: 'event-1' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('returns windows for the given event', async () => {
    const mockWindow = createMockWindow();
    prismaMock.event.findUnique.mockResolvedValue(
      createMockEvent({ scheduleMode: false }) as any
    );
    prismaMock.eventWindow.findMany.mockResolvedValue([mockWindow] as any);

    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const result = await caller.windows.list({ eventId: 'event-1' });

    expect(prismaMock.eventWindow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { eventId: 'event-1' } })
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('window-1');
  });
});

// ─── windows.create ────────────────────────────────────────────────────────────

describe('windows.create', () => {
  it('rejects unauthenticated caller with UNAUTHORIZED', async () => {
    const caller = createTestCaller(undefined);
    await expect(
      caller.windows.create({
        eventId: 'event-1',
        windowType: 'LIVE',
        url: 'https://example.com/live',
        startTime: new Date('2026-03-01T10:00:00Z'),
        endTime: new Date('2026-03-01T12:00:00Z'),
      })
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('creates window when no overlap exists', async () => {
    const startTime = new Date('2026-03-01T10:00:00Z');
    const endTime = new Date('2026-03-01T12:00:00Z');
    const mockWindow = createMockWindow({ startTime, endTime });

    prismaMock.eventWindow.findFirst.mockResolvedValue(null);
    prismaMock.event.findUnique.mockResolvedValue(
      createMockEvent({ scheduleMode: false }) as any
    );
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    prismaMock.eventWindow.create.mockResolvedValue(mockWindow as any);

    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const result = await caller.windows.create({
      eventId: 'event-1',
      windowType: 'LIVE',
      url: 'https://example.com/live',
      startTime,
      endTime,
    });

    expect(result.id).toBe('window-1');
  });

  it('throws BAD_REQUEST when window overlaps an existing window', async () => {
    prismaMock.eventWindow.findFirst.mockResolvedValue(createMockWindow() as any);

    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    await expect(
      caller.windows.create({
        eventId: 'event-1',
        windowType: 'LIVE',
        url: 'https://example.com/live',
        startTime: new Date('2026-03-01T10:00:00Z'),
        endTime: new Date('2026-03-01T12:00:00Z'),
      })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('throws BAD_REQUEST when startTime >= endTime', async () => {
    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    await expect(
      caller.windows.create({
        eventId: 'event-1',
        windowType: 'LIVE',
        url: 'https://example.com/live',
        startTime: new Date('2026-03-01T12:00:00Z'),
        endTime: new Date('2026-03-01T10:00:00Z'),
      })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

// ─── windows.toggle ────────────────────────────────────────────────────────────

describe('windows.toggle', () => {
  it('rejects unauthenticated caller with UNAUTHORIZED', async () => {
    const caller = createTestCaller(undefined);
    await expect(
      caller.windows.toggle({ id: 'window-1', isActive: true })
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('activates window and deactivates siblings via transaction', async () => {
    const mockEvent = createMockEvent({ scheduleMode: false });
    prismaMock.eventWindow.findUniqueOrThrow.mockResolvedValue(
      createMockWindow({ isActive: false, event: mockEvent }) as any
    );

    const updatedWindow = createMockWindow({ isActive: true });
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    prismaMock.eventWindow.updateMany.mockResolvedValue({ count: 0 } as any);
    prismaMock.eventWindow.update.mockResolvedValue(updatedWindow as any);

    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const result = await caller.windows.toggle({ id: 'window-1', isActive: true });

    expect(result.isActive).toBe(true);
  });
});

// ─── windows.delete ────────────────────────────────────────────────────────────

describe('windows.delete', () => {
  it('rejects unauthenticated caller with UNAUTHORIZED', async () => {
    const caller = createTestCaller(undefined);
    await expect(caller.windows.delete({ id: 'window-1' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('deletes window by id', async () => {
    const mockEvent = createMockEvent({ orgId: 'org-1' });
    prismaMock.eventWindow.findUniqueOrThrow.mockResolvedValue(
      createMockWindow({ event: mockEvent }) as any
    );
    prismaMock.eventWindow.delete.mockResolvedValue(createMockWindow() as any);

    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    await expect(caller.windows.delete({ id: 'window-1' })).resolves.not.toThrow();

    expect(prismaMock.eventWindow.delete).toHaveBeenCalledWith({
      where: { id: 'window-1' },
    });
  });
});
