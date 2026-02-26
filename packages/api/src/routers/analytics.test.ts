import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';

// ─── Module-level mocks ────────────────────────────────────────────────────────
// test-mocks.ts has NO router imports, making it safe to use inside vi.mock factories.

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
  getAnalytics: vi.fn().mockResolvedValue({
    totalTaps: 42,
    uniqueTaps: 10,
    byMode: { pre: 5, live: 30, post: 7 },
  }),
  getHourlyAnalytics: vi.fn().mockResolvedValue([]),
  getVelocityHistory: vi.fn().mockResolvedValue([]),
}));

vi.mock('../lib/engagement', () => ({
  getEventEngagement: vi.fn().mockResolvedValue(new Map()),
  aggregateCampaignEngagement: vi.fn(),
}));

// Import after vi.mock declarations
import { prismaMock } from '../test-mocks';
import { createTestCaller, createMockEvent, createMockWindow } from '../test-utils';

beforeEach(() => {
  mockReset(prismaMock);
});

// ─── analytics.live ────────────────────────────────────────────────────────────

describe('analytics.live', () => {
  it('rejects unauthenticated caller with UNAUTHORIZED', async () => {
    const caller = createTestCaller(undefined);
    await expect(caller.analytics.live({ eventId: 'event-1' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('returns totalTaps, uniqueTaps, and mode for ADMIN caller', async () => {
    prismaMock.eventWindow.findMany.mockResolvedValue([]);

    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const result = await caller.analytics.live({ eventId: 'event-1' });

    expect(result).toMatchObject({
      totalTaps: 42,
      uniqueTaps: 10,
      mode: 'pre',
    });
  });

  it('throws FORBIDDEN when CUSTOMER accesses event from different org', async () => {
    prismaMock.event.findUnique.mockResolvedValue(
      createMockEvent({ orgId: 'other-org' }) as any
    );

    const caller = createTestCaller({ role: 'CUSTOMER', orgId: 'org-1' });
    await expect(caller.analytics.live({ eventId: 'event-1' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('returns mode=live when a LIVE window is active', async () => {
    prismaMock.event.findUnique.mockResolvedValue(
      createMockEvent({ orgId: 'org-1' }) as any
    );
    prismaMock.eventWindow.findMany.mockResolvedValue([
      createMockWindow({ windowType: 'LIVE', isActive: true }) as any,
    ]);

    const caller = createTestCaller({ role: 'CUSTOMER', orgId: 'org-1' });
    const result = await caller.analytics.live({ eventId: 'event-1' });

    expect(result.mode).toBe('live');
  });
});

// ─── analytics.eventSummary ────────────────────────────────────────────────────

describe('analytics.eventSummary', () => {
  it('rejects unauthenticated caller with UNAUTHORIZED', async () => {
    const caller = createTestCaller(undefined);
    await expect(
      caller.analytics.eventSummary({ eventId: 'event-1' })
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('returns bandCount, tapCount, uniqueBands for ADMIN caller', async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      { total_taps: BigInt(5), unique_bands: BigInt(3) },
    ] as any);
    prismaMock.band.count.mockResolvedValue(10);

    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const result = await caller.analytics.eventSummary({ eventId: 'event-1' });

    expect(result).toEqual({ bandCount: 10, tapCount: 5, uniqueBands: 3, engagementPercent: 0 });
  });

  it('handles empty tap results gracefully (returns zeros)', async () => {
    prismaMock.$queryRaw.mockResolvedValue([] as any);
    prismaMock.band.count.mockResolvedValue(0);

    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const result = await caller.analytics.eventSummary({ eventId: 'event-1' });

    expect(result).toEqual({ bandCount: 0, tapCount: 0, uniqueBands: 0, engagementPercent: 0 });
  });
});

// ─── analytics.velocityHistory (CUSTOMER org-scoping) ─────────────────────────

describe('analytics.velocityHistory', () => {
  it('rejects CUSTOMER accessing event from different org with FORBIDDEN', async () => {
    prismaMock.event.findUnique.mockResolvedValue(
      createMockEvent({ orgId: 'other-org' }) as any
    );

    const caller = createTestCaller({ role: 'CUSTOMER', orgId: 'org-1' });
    await expect(
      caller.analytics.velocityHistory({ eventId: 'event-1' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('allows CUSTOMER to access their own org event', async () => {
    prismaMock.event.findUnique.mockResolvedValue(
      createMockEvent({ orgId: 'org-1' }) as any
    );

    const caller = createTestCaller({ role: 'CUSTOMER', orgId: 'org-1' });
    const result = await caller.analytics.velocityHistory({ eventId: 'event-1' });
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── analytics.tapsByRedirectType ────────────────────────────────────────────

describe('analytics.tapsByRedirectType', () => {
  it('rejects unauthenticated caller with UNAUTHORIZED', async () => {
    const caller = createTestCaller(undefined);
    await expect(
      caller.analytics.tapsByRedirectType({ eventId: 'event-1' })
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('returns category counts for ADMIN caller', async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      { category: 'LIVE', count: 50 },
      { category: 'FALLBACK', count: 10 },
    ] as any);

    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const result = await caller.analytics.tapsByRedirectType({ eventId: 'event-1' });

    expect(result).toEqual([
      { category: 'LIVE', count: 50 },
      { category: 'FALLBACK', count: 10 },
    ]);
  });

  it('throws FORBIDDEN when CUSTOMER accesses event from different org', async () => {
    prismaMock.event.findUnique.mockResolvedValue(
      createMockEvent({ orgId: 'other-org' }) as any
    );

    const caller = createTestCaller({ role: 'CUSTOMER', orgId: 'org-1' });
    await expect(
      caller.analytics.tapsByRedirectType({ eventId: 'event-1' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

// ─── analytics.campaignTapsByRedirectType ────────────────────────────────────

describe('analytics.campaignTapsByRedirectType', () => {
  it('rejects unauthenticated caller with UNAUTHORIZED', async () => {
    const caller = createTestCaller(undefined);
    await expect(
      caller.analytics.campaignTapsByRedirectType({ campaignId: 'campaign-1' })
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('returns empty array when campaign has no events', async () => {
    prismaMock.campaign.findUniqueOrThrow.mockResolvedValue({
      orgId: 'org-1',
      events: [],
    } as any);

    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const result = await caller.analytics.campaignTapsByRedirectType({ campaignId: 'campaign-1' });

    expect(result).toEqual([]);
  });

  it('returns category counts for campaign events', async () => {
    prismaMock.campaign.findUniqueOrThrow.mockResolvedValue({
      orgId: 'org-1',
      events: [{ id: 'event-1' }, { id: 'event-2' }],
    } as any);
    prismaMock.$queryRaw.mockResolvedValue([
      { category: 'PRE', count: 20 },
      { category: 'ORG', count: 5 },
    ] as any);

    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const result = await caller.analytics.campaignTapsByRedirectType({ campaignId: 'campaign-1' });

    expect(result).toEqual([
      { category: 'PRE', count: 20 },
      { category: 'ORG', count: 5 },
    ]);
  });
});
