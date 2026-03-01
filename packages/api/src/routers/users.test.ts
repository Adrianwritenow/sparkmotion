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
import { createTestCaller } from '../test-utils';

const mockUserRow = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  role: 'ADMIN' as const,
  timezone: 'America/New_York',
};

beforeEach(() => {
  mockReset(prismaMock);
  prismaMock.changeLog.create.mockResolvedValue({} as any);
});

// ─── users.me ─────────────────────────────────────────────────────────────────

describe('users.me', () => {
  it('rejects unauthenticated caller with UNAUTHORIZED', async () => {
    const caller = createTestCaller(undefined);
    await expect(caller.users.me()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('returns current user profile for authenticated caller', async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue(mockUserRow as any);

    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const result = await caller.users.me();

    expect(prismaMock.user.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1' } })
    );
    expect(result.id).toBe('user-1');
    expect(result.email).toBe('test@example.com');
  });

  it('returns profile for CUSTOMER caller scoped to their id', async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({
      ...mockUserRow,
      id: 'user-2',
      role: 'CUSTOMER' as const,
    } as any);

    const caller = createTestCaller({ role: 'CUSTOMER', orgId: 'org-1', id: 'user-2' });
    const result = await caller.users.me();

    expect(prismaMock.user.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-2' } })
    );
    expect(result.id).toBe('user-2');
  });
});

// ─── users.updateTimezone ─────────────────────────────────────────────────────

describe('users.updateTimezone', () => {
  it('rejects unauthenticated caller with UNAUTHORIZED', async () => {
    const caller = createTestCaller(undefined);
    await expect(
      caller.users.updateTimezone({ timezone: 'America/Chicago' })
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('updates timezone and returns updated user', async () => {
    const updated = { id: 'user-1', timezone: 'America/Chicago' };
    prismaMock.user.update.mockResolvedValue(updated as any);

    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const result = await caller.users.updateTimezone({ timezone: 'America/Chicago' });

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: { timezone: 'America/Chicago' },
      })
    );
    expect(result.timezone).toBe('America/Chicago');
  });
});

// ─── users.updateProfile ──────────────────────────────────────────────────────

describe('users.updateProfile', () => {
  it('rejects unauthenticated caller with UNAUTHORIZED', async () => {
    const caller = createTestCaller(undefined);
    await expect(
      caller.users.updateProfile({ name: 'New Name' })
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('updates profile and returns updated user', async () => {
    const updated = { id: 'user-1', name: 'New Name', email: 'test@example.com' };
    prismaMock.user.update.mockResolvedValue(updated as any);

    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const result = await caller.users.updateProfile({ name: 'New Name' });

    expect(result.name).toBe('New Name');
  });
});
