import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';

// ─── Module-level mocks ────────────────────────────────────────────────────────
// Routers import `db` at module scope from @sparkmotion/database, so the entire
// module must be mocked before any router code runs.

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

vi.mock('@sparkmotion/redis', () => ({}));

// campaigns.ts imports getEventEngagement which also calls db.$queryRaw
vi.mock('../lib/engagement', () => ({
  getEventEngagement: vi.fn().mockResolvedValue(new Map()),
}));

import { prismaMock } from '../test-mocks';
import { createTestCaller, createMockCampaign, createMockOrg } from '../test-utils';

// ─── Setup ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
  mockReset(prismaMock);
  vi.clearAllMocks();
  prismaMock.changeLog.create.mockResolvedValue({} as any);
});

// ─── campaigns.list ───────────────────────────────────────────────────────────
describe('campaigns.list', () => {
  it('ADMIN returns all campaigns without org filter', async () => {
    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const mockCampaigns = [
      {
        ...createMockCampaign(),
        org: createMockOrg(),
        events: [],
        _count: { events: 0 },
      },
    ];
    prismaMock.campaign.findMany.mockResolvedValue(mockCampaigns as any);

    const result = await caller.campaigns.list({});

    expect(prismaMock.campaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null } })
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('campaign-1');
  });

  it('ADMIN can filter by orgId', async () => {
    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const mockCampaigns = [
      {
        ...createMockCampaign({ orgId: 'org-2' }),
        org: createMockOrg({ id: 'org-2' }),
        events: [],
        _count: { events: 0 },
      },
    ];
    prismaMock.campaign.findMany.mockResolvedValue(mockCampaigns as any);

    await caller.campaigns.list({ orgId: 'org-2' });

    expect(prismaMock.campaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: 'org-2', deletedAt: null } })
    );
  });

  it('CUSTOMER auto-scopes to their org', async () => {
    const caller = createTestCaller({ role: 'CUSTOMER', orgId: 'org-1' });
    prismaMock.campaign.findMany.mockResolvedValue([]);

    await caller.campaigns.list({});

    expect(prismaMock.campaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: 'org-1', deletedAt: null } })
    );
  });

  it('unauthenticated caller is rejected with UNAUTHORIZED', async () => {
    const caller = createTestCaller(undefined);

    await expect(caller.campaigns.list({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

// ─── campaigns.byId ───────────────────────────────────────────────────────────
describe('campaigns.byId', () => {
  it('returns campaign with events and engagement data', async () => {
    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const mockCampaign = {
      ...createMockCampaign(),
      org: createMockOrg(),
      events: [{ id: 'event-1', location: 'Nashville', _count: { bands: 10 } }],
      _count: { events: 1 },
    };
    prismaMock.campaign.findUniqueOrThrow.mockResolvedValue(mockCampaign as any);

    const result = await caller.campaigns.byId({ id: 'campaign-1' });

    expect(prismaMock.campaign.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'campaign-1', deletedAt: null } })
    );
    expect(result.id).toBe('campaign-1');
    expect(result).toHaveProperty('aggregateEngagement');
    expect(result).toHaveProperty('totalBands');
    expect(result).toHaveProperty('locations');
  });
});

// ─── campaigns.create ─────────────────────────────────────────────────────────
describe('campaigns.create', () => {
  it('ADMIN creates campaign', async () => {
    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const newCampaign = createMockCampaign({ orgId: 'org-1' });
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    prismaMock.campaign.create.mockResolvedValue(newCampaign as any);

    const result = await caller.campaigns.create({
      orgId: 'org-1',
      name: 'Test Campaign',
    });

    expect(prismaMock.campaign.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orgId: 'org-1', name: 'Test Campaign' }),
      })
    );
    expect(result.id).toBe('campaign-1');
  });

  it('CUSTOMER creates campaign scoped to their orgId', async () => {
    const caller = createTestCaller({ role: 'CUSTOMER', orgId: 'org-1' });
    const newCampaign = createMockCampaign({ orgId: 'org-1' });
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    prismaMock.campaign.create.mockResolvedValue(newCampaign as any);

    await caller.campaigns.create({
      orgId: 'org-other', // should be ignored
      name: 'Customer Campaign',
    });

    expect(prismaMock.campaign.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orgId: 'org-1' }),
      })
    );
  });
});

// ─── campaigns.update ─────────────────────────────────────────────────────────
describe('campaigns.update', () => {
  it('ADMIN updates campaign', async () => {
    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const updated = createMockCampaign({ name: 'Updated Campaign' });
    prismaMock.campaign.findUniqueOrThrow.mockResolvedValue({ orgId: 'org-1' } as any);
    prismaMock.campaign.update.mockResolvedValue(updated as any);

    const result = await caller.campaigns.update({ id: 'campaign-1', name: 'Updated Campaign' });

    expect(prismaMock.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'campaign-1' },
        data: expect.objectContaining({ name: 'Updated Campaign' }),
      })
    );
    expect(result.name).toBe('Updated Campaign');
  });

  it('CUSTOMER cannot update campaign belonging to different org', async () => {
    const caller = createTestCaller({ role: 'CUSTOMER', orgId: 'org-2' });
    prismaMock.campaign.findUniqueOrThrow.mockResolvedValue(
      { orgId: 'org-1' } as any
    );

    await expect(
      caller.campaigns.update({ id: 'campaign-1', name: 'Hacked' })
    ).rejects.toThrow('Forbidden');
  });
});

// ─── campaigns.delete ─────────────────────────────────────────────────────────
describe('campaigns.delete', () => {
  it('ADMIN soft-deletes campaign', async () => {
    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    prismaMock.$transaction.mockResolvedValue([{}, { count: 0 }] as any);

    await caller.campaigns.delete({ id: 'campaign-1' });

    expect(prismaMock.$transaction).toHaveBeenCalled();
  });

  it('CUSTOMER cannot delete campaign belonging to different org', async () => {
    const caller = createTestCaller({ role: 'CUSTOMER', orgId: 'org-2' });
    prismaMock.campaign.findUniqueOrThrow.mockResolvedValue(
      { orgId: 'org-1' } as any
    );

    await expect(caller.campaigns.delete({ id: 'campaign-1' })).rejects.toThrow('Forbidden');
  });
});
