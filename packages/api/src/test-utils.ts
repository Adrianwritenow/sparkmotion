import { createCallerFactory } from '@trpc/server';
import { appRouter } from './root';
import type { TRPCContext } from './trpc';

// ─── Prisma Mock ──────────────────────────────────────────────────────────────
// Re-exported from test-mocks.ts so consumers only need one import.
// The prismaMock singleton lives in test-mocks.ts (no router imports) to avoid
// circular dependencies when used inside vi.mock factories.
export { prismaMock } from './test-mocks';
import { prismaMock } from './test-mocks';

// ─── Caller factory (created once) ───────────────────────────────────────────
// createCallerFactory() (0 args) returns createCallerInner(router) which returns
// createCaller(ctx). The imported createCallerFactory from @trpc/server has a
// misleading type signature that accepts a generic — but at runtime it takes no
// arguments. We call it correctly here: createCallerFactory()(appRouter).
const createCaller = createCallerFactory()(appRouter);

// ─── Test Caller Factory ──────────────────────────────────────────────────────
// Usage: const caller = createTestCaller({ role: 'ADMIN', orgId: null });
//        const caller = createTestCaller(undefined); // unauthenticated
export function createTestCaller(userOverrides?: Partial<TRPCContext['user']>) {
  const user = userOverrides !== undefined ? buildUser(userOverrides) : null;
  const ctx: TRPCContext = {
    db: prismaMock as unknown as typeof import('@sparkmotion/database').db,
    session: user ? { user, expires: '' } : null,
    user,
    headers: new Headers(),
  };
  return createCaller(ctx);
}

// ─── User Builder ─────────────────────────────────────────────────────────────
export function buildUser(overrides: Partial<TRPCContext['user']> = {}) {
  return {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    role: 'ADMIN' as const,
    orgId: null,
    ...overrides,
  };
}

// ─── Factory Functions ────────────────────────────────────────────────────────
// These match the actual Prisma schema fields exactly.

export function createMockOrg(overrides: Record<string, unknown> = {}) {
  return {
    id: 'org-1',
    name: 'Test Org',
    slug: 'test-org',
    websiteUrl: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

export function createMockEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'event-1',
    orgId: 'org-1',
    campaignId: null,
    name: 'Test Event',
    city: null,
    state: null,
    country: null,
    zipcode: null,
    location: null,
    venueName: null,
    formattedAddress: null,
    latitude: null,
    longitude: null,
    timezone: 'UTC',
    scheduleMode: false,
    fallbackUrl: null,
    status: 'ACTIVE' as const,
    estimatedAttendees: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

export function createMockBand(overrides: Record<string, unknown> = {}) {
  return {
    id: 'band-1',
    bandId: 'BAND-001',
    eventId: 'event-1',
    name: null,
    email: null,
    tagId: null,
    autoAssigned: false,
    autoAssignDistance: null,
    flagged: false,
    firstTapAt: null,
    lastTapAt: null,
    tapCount: 0,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

export function createMockCampaign(overrides: Record<string, unknown> = {}) {
  return {
    id: 'campaign-1',
    orgId: 'org-1',
    name: 'Test Campaign',
    status: 'DRAFT' as const,
    startDate: null,
    endDate: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

export function createMockWindow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'window-1',
    eventId: 'event-1',
    windowType: 'LIVE' as const,
    url: 'https://example.com/live',
    startTime: null,
    endTime: null,
    isManual: false,
    isActive: false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

export function createMockTag(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tag-1',
    title: 'VIP',
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}
