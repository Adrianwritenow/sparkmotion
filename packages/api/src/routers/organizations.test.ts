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

vi.mock('@sparkmotion/redis', () => ({}));

import { prismaMock } from '../test-mocks';
import { createTestCaller, createMockOrg } from '../test-utils';

// ─── Setup ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
  mockReset(prismaMock);
  vi.clearAllMocks();
});

// ─── organizations.list ───────────────────────────────────────────────────────
describe('organizations.list', () => {
  it('ADMIN returns all organizations', async () => {
    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const mockOrgs = [
      { ...createMockOrg(), _count: { events: 3 } },
      { ...createMockOrg({ id: 'org-2', name: 'Org 2', slug: 'org-2' }), _count: { events: 1 } },
    ];
    prismaMock.organization.findMany.mockResolvedValue(mockOrgs as any);

    const result = await caller.organizations.list();

    expect(prismaMock.organization.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { name: 'asc' } })
    );
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('org-1');
  });

  it('CUSTOMER is rejected with FORBIDDEN', async () => {
    const caller = createTestCaller({ role: 'CUSTOMER', orgId: 'org-1' });

    await expect(caller.organizations.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('unauthenticated caller is rejected with UNAUTHORIZED', async () => {
    const caller = createTestCaller(undefined);

    await expect(caller.organizations.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

// ─── organizations.byId ───────────────────────────────────────────────────────
describe('organizations.byId', () => {
  it('returns org with event and user counts', async () => {
    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const mockOrg = {
      ...createMockOrg(),
      _count: { events: 5, users: 3 },
    };
    prismaMock.organization.findUniqueOrThrow.mockResolvedValue(mockOrg as any);

    const result = await caller.organizations.byId({ id: 'org-1' });

    expect(prismaMock.organization.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'org-1' } })
    );
    expect(result.id).toBe('org-1');
  });
});

// ─── organizations.update (adminProcedure) ────────────────────────────────────
describe('organizations.update', () => {
  it('ADMIN updates org name', async () => {
    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const updated = createMockOrg({ name: 'New Org Name' });
    prismaMock.organization.update.mockResolvedValue(updated as any);

    const result = await caller.organizations.update({ id: 'org-1', name: 'New Org Name' });

    expect(prismaMock.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'org-1' },
        data: expect.objectContaining({ name: 'New Org Name' }),
      })
    );
    expect(result.name).toBe('New Org Name');
  });

  it('CUSTOMER is rejected with FORBIDDEN', async () => {
    const caller = createTestCaller({ role: 'CUSTOMER', orgId: 'org-1' });

    await expect(
      caller.organizations.update({ id: 'org-1', name: 'Hacked' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

// ─── organizations.updateName ─────────────────────────────────────────────────
describe('organizations.updateName', () => {
  it('ADMIN updates any org name', async () => {
    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const updated = createMockOrg({ name: 'Admin Updated' });
    prismaMock.organization.update.mockResolvedValue(updated as any);

    await caller.organizations.updateName({ orgId: 'org-1', name: 'Admin Updated' });

    expect(prismaMock.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'org-1' } })
    );
  });

  it('CUSTOMER can update their own org name', async () => {
    const caller = createTestCaller({ role: 'CUSTOMER', orgId: 'org-1' });
    const updated = createMockOrg({ name: 'My Org New Name' });
    prismaMock.organization.update.mockResolvedValue(updated as any);

    await caller.organizations.updateName({ orgId: 'org-1', name: 'My Org New Name' });

    expect(prismaMock.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'org-1' } })
    );
  });

  it('CUSTOMER cannot update another org name', async () => {
    const caller = createTestCaller({ role: 'CUSTOMER', orgId: 'org-1' });

    await expect(
      caller.organizations.updateName({ orgId: 'org-2', name: 'Hacked Org' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
