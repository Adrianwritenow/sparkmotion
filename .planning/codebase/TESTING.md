# Testing Patterns

**Analysis Date:** 2026-01-28

## Test Framework

**Status:** Not yet implemented

**Runner:**
- No test runner currently configured (Jest, Vitest, or testing-library not in dependencies)

**Assertion Library:**
- Not detected

**Run Commands:**
```bash
# No test commands currently defined in package.json
# When implemented, expected pattern:
npm run test              # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report
```

## Test Infrastructure Needs

**Recommended Setup:**
- **Unit Testing:** Jest or Vitest
- **React Component Testing:** React Testing Library + Jest/Vitest
- **API Testing:** tRPC's built-in test utilities or direct handler testing
- **Integration Testing:** Manual or E2E framework (Playwright/Cypress)
- **Coverage Reporting:** Built into Jest/Vitest

**Why not yet implemented:**
- Project is in early MVP phase (deadline: Feb 27, 2026)
- Testing is lower priority than core functionality
- Linting/formatting also not yet configured

## Test File Organization

**When implemented, use this pattern:**

**Location:**
- Co-located with source files in same directory
- Alternative: Dedicated `__tests__` directory per package

**Naming:**
- `[module].test.ts` for unit tests
- `[module].spec.ts` for integration tests
- React components: `[component].test.tsx`

**Directory Structure (anticipated):**
```
packages/api/src/
  ├── routers/
  │   ├── events.ts
  │   └── events.test.ts
  ├── trpc.ts
  └── trpc.test.ts

packages/redis/src/
  ├── cache.ts
  ├── cache.test.ts
  ├── analytics.ts
  └── analytics.test.ts

packages/ui/src/
  ├── event-card.tsx
  ├── event-card.test.tsx
  ├── event-list.tsx
  └── event-list.test.tsx
```

## Test Structure

**Expected Pattern (when implemented):**

### Unit Test Suite
```typescript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { getCachedBand, setCachedBand } from '@sparkmotion/redis';
import { redis } from '@sparkmotion/redis/client';

describe('Cache Operations', () => {
  beforeEach(() => {
    // Setup: clear cache
    redis.flushdb();
  });

  afterEach(() => {
    // Cleanup
    redis.flushdb();
  });

  describe('getCachedBand', () => {
    it('should return null when band not in cache', async () => {
      const result = await getCachedBand('unknown-band-id');
      expect(result).toBeNull();
    });

    it('should return cached band data when available', async () => {
      const bandData = {
        bandId: 'band-123',
        eventId: 'event-456',
        status: 'ACTIVE',
        currentMode: 'live',
        redirectUrl: 'https://example.com/live',
      };

      await setCachedBand('band-123', bandData);
      const result = await getCachedBand('band-123');

      expect(result).toEqual(bandData);
    });
  });
});
```

### tRPC Procedure Test
```typescript
import { describe, it, expect } from '@jest/globals';
import { eventsRouter } from '@sparkmotion/api';
import { db } from '@sparkmotion/database';

describe('Events Router', () => {
  describe('list procedure', () => {
    it('should return all events for admin', async () => {
      // Arrange
      const adminContext = { user: { id: 'user-1', role: 'ADMIN' } };
      const caller = eventsRouter.createCaller(adminContext);

      // Act
      const events = await caller.list({ orgId: 'org-1' });

      // Assert
      expect(events).toHaveLength(1);
      expect(events[0].name).toBe('Test Event');
    });

    it('should throw FORBIDDEN for non-admin querying other orgs', async () => {
      const customerContext = {
        user: { id: 'user-1', role: 'CUSTOMER', orgId: 'org-1' },
      };
      const caller = eventsRouter.createCaller(customerContext);

      await expect(
        caller.list({ orgId: 'org-2' })
      ).rejects.toThrow('FORBIDDEN');
    });
  });
});
```

### React Component Test
```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventCard } from '@sparkmotion/ui';

describe('EventCard', () => {
  it('should render event name and status', () => {
    render(
      <EventCard
        name="Nashville Stop"
        tourName="Compassion Tour"
        status="ACTIVE"
        bandCount={1250}
      />
    );

    expect(screen.getByText('Nashville Stop')).toBeInTheDocument();
    expect(screen.getByText('Compassion Tour')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    expect(screen.getByText('1250 bands')).toBeInTheDocument();
  });

  it('should call onClick handler when clicked', async () => {
    const user = userEvent.setup();
    const handleClick = jest.fn();

    render(
      <EventCard
        name="Test Event"
        status="DRAFT"
        bandCount={0}
        onClick={handleClick}
      />
    );

    await user.click(screen.getByText('Test Event'));
    expect(handleClick).toHaveBeenCalled();
  });

  it('should apply correct status badge color for ACTIVE', () => {
    render(
      <EventCard
        name="Test"
        status="ACTIVE"
        bandCount={0}
      />
    );

    const badge = screen.getByText('ACTIVE');
    expect(badge).toHaveClass('bg-green-100', 'text-green-800');
  });
});
```

## Mocking

**Framework:** When implemented, use Jest mocks or Vitest mocking

**Patterns (anticipated):**

### Mock Redis
```typescript
jest.mock('@sparkmotion/redis/client', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    pfadd: jest.fn(),
    pfcount: jest.fn(),
    pipeline: jest.fn(() => ({
      incr: jest.fn(),
      exec: jest.fn(),
    })),
  },
}));

import { redis } from '@sparkmotion/redis/client';

describe('Analytics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should record tap with pipeline', async () => {
    const mockPipeline = { incr: jest.fn(), exec: jest.fn() };
    (redis.pipeline as jest.Mock).mockReturnValue(mockPipeline);

    await recordTap('event-1', 'band-1', 'live');

    expect(mockPipeline.incr).toHaveBeenCalledWith('analytics:event-1:taps:total');
    expect(mockPipeline.exec).toHaveBeenCalled();
  });
});
```

### Mock Database
```typescript
jest.mock('@sparkmotion/database', () => ({
  db: {
    event: {
      findMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    band: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      createMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
  },
}));
```

### Mock Next.js Request/Response
```typescript
import { NextRequest } from 'next/server';

const mockRequest = new NextRequest(
  new URL('http://localhost:3000/e?bandId=band-123'),
  {
    headers: {
      'user-agent': 'Mozilla/5.0...',
      'x-forwarded-for': '192.168.1.1',
    },
  }
);
```

**What to Mock:**
- External services (Redis, Database)
- Next.js Request/Response objects
- Async timers (if testing timeout behavior)
- Network requests (if any)

**What NOT to Mock:**
- Pure functions (cache key generation, URL determination)
- Business logic (mode calculation, window scheduling)
- TypeScript types/interfaces
- Standard library functions

## Fixtures and Factories

**Test Data (anticipated pattern):**

### Factory Functions
```typescript
// __tests__/fixtures/factories.ts
export function createMockBand(overrides = {}) {
  return {
    id: 'band-1',
    bandId: 'band-123',
    eventId: 'event-456',
    status: 'ACTIVE',
    tapCount: 0,
    firstTapAt: null,
    lastTapAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createMockEvent(overrides = {}) {
  return {
    id: 'event-1',
    name: 'Nashville Stop',
    tourName: 'Compassion Tour',
    slug: 'nashville-2026',
    status: 'ACTIVE',
    preUrl: 'https://example.com/pre',
    liveUrl: 'https://example.com/live',
    postUrl: 'https://example.com/post',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createMockContext(overrides = {}) {
  return {
    user: {
      id: 'user-1',
      role: 'ADMIN' as const,
      ...overrides,
    },
  };
}
```

### Usage in Tests
```typescript
it('should process active band', async () => {
  const band = createMockBand({ status: 'ACTIVE' });
  const event = createMockEvent({ name: 'Test Event' });

  const result = await processRedirect(band, event);
  expect(result.success).toBe(true);
});
```

**Location:**
- `__tests__/fixtures/` or `test/fixtures/` directory
- Shared across all tests in package

## Coverage

**Requirements:** Not enforced yet

**When implementing:**
- Target: 80%+ for critical paths (redirect, mode determination)
- Lower priority for UI components initially
- 100% not required given MVP timeline

**View Coverage (anticipated):**
```bash
npm run test:coverage
# Generates coverage report in ./coverage directory
# Open coverage/index.html in browser for HTML report
```

## Test Types

**Unit Tests:**
- Scope: Individual functions/procedures
- Approach: Test single responsibility
- Examples:
  - Cache get/set operations
  - Zod schema validation
  - Cache key generation
  - Mode determination logic
  - Component rendering

**Integration Tests:**
- Scope: Multiple components working together
- Approach: Test with real (or mocked service) integration
- Examples:
  - Full tRPC procedure with database
  - Redirect endpoint with cache + database + logging
  - Event creation → cache invalidation → response
  - UI component + data fetching

**E2E Tests:**
- Framework: Not yet configured (Playwright or Cypress)
- Scope: Full user journeys
- Examples:
  - NFC wristband tap → redirect flow
  - Admin create event → view analytics
  - Event mode transition in real-time

## Async Testing

**Pattern (anticipated):**

```typescript
// Return promise - Jest waits automatically
it('should fetch band from cache', async () => {
  const band = await getCachedBand('band-1');
  expect(band).toBeDefined();
});

// Or explicitly with done callback
it('should record tap asynchronously', (done) => {
  recordTap('event-1', 'band-1', 'live').then(() => {
    expect(somethingHappened).toBe(true);
    done();
  });
});

// Or with waitFor for assertions on eventually-true conditions
it('should update cache after tap', async () => {
  await recordTap('event-1', 'band-1', 'live');

  await waitFor(() => {
    expect(redis.incr).toHaveBeenCalled();
  });
});
```

## Error Testing

**Pattern (anticipated):**

```typescript
// Test thrown errors
it('should throw UNAUTHORIZED when no user', async () => {
  const context = { user: null };
  const caller = eventsRouter.createCaller(context);

  await expect(caller.list({})).rejects.toThrow('UNAUTHORIZED');
});

// Test rejection
it('should reject when band not found', async () => {
  (db.band.findUnique as jest.Mock).mockResolvedValue(null);

  await expect(resolveRedirect('unknown-band')).rejects.toThrow('Unknown band');
});

// Test graceful error handling
it('should return error response with status 400', async () => {
  const response = await GET(mockRequest(''));

  expect(response.status).toBe(400);
  const json = await response.json();
  expect(json.error).toBeDefined();
});
```

## Critical Path Testing

**Must-test areas (highest priority):**

1. **Redirect Endpoint** (`apps/hub/src/app/e/route.ts`)
   - Valid bandId → redirect with correct mode
   - Missing bandId → 400 error
   - Unknown bandId → 404 error
   - Disabled band → 403 error
   - Cache hit → fast redirect
   - Cache miss → fetch from DB and cache

2. **Mode Determination** (`resolveEventStatus` in redirect route)
   - Manual window active → use manual window mode
   - Scheduled window active → use scheduled mode
   - No active windows → default to "pre"
   - Correct URL returned for mode

3. **Cache Operations** (`packages/redis/src/cache.ts`)
   - getCachedBand returns null for missing key
   - setCachedBand stores with correct TTL
   - invalidateEventCache removes key
   - Pipeline operations atomic

4. **Authorization** (tRPC middleware)
   - adminProcedure rejects non-admin
   - protectedProcedure rejects unauthenticated
   - Org-scoped data access correct

## Known Testing Gaps

**Not yet covered:**
- No test runners configured
- No test utilities or helpers
- No fixture factories
- No mocking strategy defined
- No CI/CD test pipeline
- No coverage baseline

**Post-MVP Testing Plan:**
- Phase 3+: Implement Jest + React Testing Library
- Add unit tests for all routers
- Add integration tests for critical paths
- Set up coverage reporting
- Integrate tests into CI/CD

---

*Testing analysis: 2026-01-28*
