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

vi.mock('@sparkmotion/redis', () => ({}));

import { prismaMock } from '../test-mocks';
import { createTestCaller, createMockTag } from '../test-utils';

beforeEach(() => {
  mockReset(prismaMock);
});

// ─── tags.list ────────────────────────────────────────────────────────────────

describe('tags.list', () => {
  it('rejects unauthenticated caller with UNAUTHORIZED', async () => {
    const caller = createTestCaller(undefined);
    await expect(caller.tags.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('returns all tags for ADMIN caller', async () => {
    const mockTag = createMockTag();
    prismaMock.bandTag.findMany.mockResolvedValue([mockTag] as any);

    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const result = await caller.tags.list();

    expect(prismaMock.bandTag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true, title: true },
        orderBy: { title: 'asc' },
      })
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('tag-1');
    expect(result[0]?.title).toBe('VIP');
  });

  it('returns tags for CUSTOMER caller (tags are global, no org-scoping)', async () => {
    const tags = [
      createMockTag({ id: 'tag-1', title: 'VIP' }),
      createMockTag({ id: 'tag-2', title: 'Staff' }),
    ];
    prismaMock.bandTag.findMany.mockResolvedValue(tags as any);

    const caller = createTestCaller({ role: 'CUSTOMER', orgId: 'org-1' });
    const result = await caller.tags.list();

    expect(result).toHaveLength(2);
  });

  it('returns empty array when no tags exist', async () => {
    prismaMock.bandTag.findMany.mockResolvedValue([]);

    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const result = await caller.tags.list();

    expect(result).toEqual([]);
  });
});
