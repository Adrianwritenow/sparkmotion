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

const mockSendContactEmail = vi.fn();
vi.mock('@sparkmotion/email', () => ({
  sendContactEmail: (...args: unknown[]) => mockSendContactEmail(...args),
}));

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
    expect(result[0]!.id).toBe('org-1');
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

// ─── organizations.create ───────────────────────────────────────────────────
describe('organizations.create', () => {
  it('ADMIN creates org with custom slug and contactEmail', async () => {
    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const created = createMockOrg({
      slug: 'custom-slug',
      contactEmail: 'info@example.com',
    });
    prismaMock.organization.create.mockResolvedValue(created as any);

    const result = await caller.organizations.create({
      name: 'Test Org',
      slug: 'Custom Slug!',
      websiteUrl: 'https://example.com',
      contactEmail: 'info@example.com',
    });

    expect(prismaMock.organization.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Test Org',
          slug: 'custom-slug',
          websiteUrl: 'https://example.com',
          contactEmail: 'info@example.com',
        }),
      })
    );
    expect(result.slug).toBe('custom-slug');
  });

  it('ADMIN creates org without slug (auto-generated from name)', async () => {
    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const created = createMockOrg({ slug: 'my-org' });
    prismaMock.organization.create.mockResolvedValue(created as any);

    await caller.organizations.create({ name: 'My Org', contactEmail: 'test@example.com' });

    expect(prismaMock.organization.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'My Org',
          slug: 'my-org',
        }),
      })
    );
  });

  it('returns CONFLICT on duplicate slug', async () => {
    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const { Prisma } = await import('@sparkmotion/database');
    prismaMock.organization.create.mockRejectedValue(
      new (Prisma.PrismaClientKnownRequestError as any)('Unique constraint', { code: 'P2002' })
    );

    await expect(
      caller.organizations.create({ name: 'Dup Org', contactEmail: 'dup@example.com' })
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

// ─── organizations.checkSlug ─────────────────────────────────────────────────
describe('organizations.checkSlug', () => {
  it('returns available=true for unused slug', async () => {
    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    prismaMock.organization.findUnique.mockResolvedValue(null as any);

    const result = await caller.organizations.checkSlug({ slug: 'New Slug' });

    expect(result).toEqual({ available: true, slug: 'new-slug' });
  });

  it('returns available=false for taken slug', async () => {
    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    prismaMock.organization.findUnique.mockResolvedValue({ id: 'org-2' } as any);

    const result = await caller.organizations.checkSlug({ slug: 'taken-slug' });

    expect(result).toEqual({ available: false, slug: 'taken-slug' });
  });

  it('excludes own org from conflict check', async () => {
    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    prismaMock.organization.findUnique.mockResolvedValue({ id: 'org-1' } as any);

    const result = await caller.organizations.checkSlug({ slug: 'my-slug', excludeOrgId: 'org-1' });

    expect(result).toEqual({ available: true, slug: 'my-slug' });
  });

  it('returns available=false for empty normalized slug', async () => {
    const caller = createTestCaller({ role: 'ADMIN', orgId: null });

    const result = await caller.organizations.checkSlug({ slug: '---' });

    expect(result).toEqual({ available: false, slug: '' });
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

  it('ADMIN updates org slug (normalized)', async () => {
    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const updated = createMockOrg({ slug: 'new-slug' });
    prismaMock.organization.update.mockResolvedValue(updated as any);

    const result = await caller.organizations.update({ id: 'org-1', slug: 'New Slug!' });

    expect(prismaMock.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'org-1' },
        data: expect.objectContaining({ slug: 'new-slug' }),
      })
    );
    expect(result.slug).toBe('new-slug');
  });

  it('returns CONFLICT on duplicate slug', async () => {
    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    const { Prisma } = await import('@sparkmotion/database');
    prismaMock.organization.update.mockRejectedValue(
      new (Prisma.PrismaClientKnownRequestError as any)('Unique constraint', { code: 'P2002' })
    );

    await expect(
      caller.organizations.update({ id: 'org-1', slug: 'taken-slug' })
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('CUSTOMER is rejected with FORBIDDEN', async () => {
    const caller = createTestCaller({ role: 'CUSTOMER', orgId: 'org-1' });

    await expect(
      caller.organizations.update({ id: 'org-1', name: 'Hacked' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

// ─── organizations.delete ────────────────────────────────────────────────────
describe('organizations.delete', () => {
  it('ADMIN can delete an organization', async () => {
    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    prismaMock.organization.delete.mockResolvedValue(createMockOrg() as any);

    const result = await caller.organizations.delete({ id: 'org-1' });

    expect(prismaMock.organization.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'org-1' } })
    );
    expect(result).toEqual({ success: true });
  });

  it('CUSTOMER is rejected with FORBIDDEN', async () => {
    const caller = createTestCaller({ role: 'CUSTOMER', orgId: 'org-1' });

    await expect(
      caller.organizations.delete({ id: 'org-1' })
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

// ─── organizations.sendContactEmail ─────────────────────────────────────────
describe('organizations.sendContactEmail', () => {
  it('ADMIN can send contact email', async () => {
    const caller = createTestCaller({ role: 'ADMIN', orgId: null, name: 'Admin User', email: 'admin@test.com' });
    prismaMock.organization.findUnique.mockResolvedValue({ name: 'Test Org' } as any);
    mockSendContactEmail.mockResolvedValue(undefined);

    const result = await caller.organizations.sendContactEmail({
      orgId: 'org-1',
      to: 'contact@testorg.com',
      subject: 'Hello',
      body: 'Test message',
    });

    expect(result).toEqual({ success: true });
    expect(mockSendContactEmail).toHaveBeenCalledWith({
      to: 'contact@testorg.com',
      subject: 'Hello',
      body: 'Test message',
      orgName: 'Test Org',
      senderName: 'Admin User',
    });
  });

  it('returns NOT_FOUND when org does not exist', async () => {
    const caller = createTestCaller({ role: 'ADMIN', orgId: null });
    prismaMock.organization.findUnique.mockResolvedValue(null as any);

    await expect(
      caller.organizations.sendContactEmail({
        orgId: 'nonexistent',
        to: 'contact@testorg.com',
        subject: 'Hello',
        body: 'Test message',
      })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('CUSTOMER is rejected with FORBIDDEN', async () => {
    const caller = createTestCaller({ role: 'CUSTOMER', orgId: 'org-1' });

    await expect(
      caller.organizations.sendContactEmail({
        orgId: 'org-1',
        to: 'contact@testorg.com',
        subject: 'Hello',
        body: 'Test message',
      })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
