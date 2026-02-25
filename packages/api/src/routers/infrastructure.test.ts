import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';

// ─── Module-level mocks ────────────────────────────────────────────────────────
// infrastructure.ts uses adminProcedure — CUSTOMER callers get FORBIDDEN before
// any procedure body runs (the middleware checks role first).

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
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
  },
}));

vi.mock('../services/redirect-map-generator', () => ({
  generateRedirectMap: vi.fn().mockResolvedValue({
    skipped: false,
    bandsWritten: 10,
    eventsProcessed: 2,
  }),
}));

import { prismaMock } from '../test-mocks';
import { createTestCaller, createMockEvent } from '../test-utils';

beforeEach(() => {
  mockReset(prismaMock);
  vi.clearAllMocks();
});

// ─── infrastructure.getMapStatus ──────────────────────────────────────────────

describe('infrastructure.getMapStatus', () => {
  it('rejects unauthenticated caller with FORBIDDEN', async () => {
    const caller = createTestCaller(undefined);
    await expect(caller.infrastructure.getMapStatus()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('rejects CUSTOMER caller with FORBIDDEN', async () => {
    const caller = createTestCaller({ role: 'CUSTOMER', orgId: 'org-1' });
    await expect(caller.infrastructure.getMapStatus()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('returns stale status when Redis key is not set', async () => {
    const { redis } = await import('@sparkmotion/redis');
    (redis.get as any).mockResolvedValue(null);

    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const result = await caller.infrastructure.getMapStatus();

    expect(result).toMatchObject({
      lastRefreshed: null,
      bandCount: 0,
      sizeBytes: 0,
      isStale: true,
    });
  });

  it('returns map status with isStale=false when metadata is fresh', async () => {
    const freshMeta = JSON.stringify({
      lastRefreshed: new Date().toISOString(),
      bandCount: 1500,
      sizeBytes: 150000,
    });
    const { redis } = await import('@sparkmotion/redis');
    (redis.get as any).mockResolvedValue(freshMeta);

    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const result = await caller.infrastructure.getMapStatus();

    expect(result.bandCount).toBe(1500);
    expect(result.isStale).toBe(false);
  });
});

// ─── infrastructure.costProjection ────────────────────────────────────────────

describe('infrastructure.costProjection', () => {
  it('rejects CUSTOMER caller with FORBIDDEN', async () => {
    const caller = createTestCaller({ role: 'CUSTOMER', orgId: 'org-1' });
    await expect(
      caller.infrastructure.costProjection({ days: '7' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('returns projection with zero cost when no upcoming events', async () => {
    prismaMock.event.findMany.mockResolvedValue([]);

    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const result = await caller.infrastructure.costProjection({ days: '7' });

    expect(result.totalCost).toBe(0);
    expect(result.upcomingEvents).toHaveLength(0);
    expect(result.projectionDays).toBe(7);
  });
});
