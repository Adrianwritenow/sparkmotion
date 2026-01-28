# Coding Conventions

**Analysis Date:** 2026-01-28

## Naming Patterns

**Files:**
- `kebab-case.ts` or `kebab-case.tsx` for all source files
- Examples: `event-card.tsx`, `tap-history.ts`, `cache.ts`, `client.ts`
- Index files: `index.ts` for package barrel exports

**Functions:**
- `camelCase` for all functions and async functions
- Examples: `getCachedBand()`, `setCachedBand()`, `invalidateEventCache()`, `recordTap()`
- Prefix async operations with action verb: `get`, `set`, `record`, `resolve`, etc.

**Variables:**
- `camelCase` for local variables and parameters
- `SCREAMING_SNAKE_CASE` for constants
- Examples: `bandId`, `eventId`, `BAND_TTL`, `EVENT_TTL`, `KEYS`

**Types and Interfaces:**
- `PascalCase` for all types, interfaces, and classes
- Examples: `CachedBand`, `CachedEventStatus`, `EventCardProps`, `TRPCContext`
- Suffix props interfaces with `Props`: `EventCardProps`, `EventListProps`, `StatCardProps`

**Router/Module Names:**
- `camelCase` with `Router` suffix for tRPC routers
- Examples: `eventsRouter`, `windowsRouter`, `bandsRouter`, `analyticsRouter`

## Code Style

**Formatting:**
- No explicit formatter configured (ESLint expected to be added during implementation)
- Target: Consistent spacing, 2-space indentation (inferred from code)

**Linting:**
- ESLint configured via `"lint": "eslint ."` in package.json
- Currently in setup phase (no `.eslintrc` or `.prettierrc` file yet)
- TypeScript strict mode enabled in `tsconfig.json`

**TypeScript Compiler Settings:**
- `strict: true` - Full strict type checking
- `noUncheckedIndexedAccess: true` - Prevent unsafe index access
- `isolatedModules: true` - Ensure imports/exports are explicit
- `target: ES2022` - Modern JavaScript target
- `jsx: react-jsx` - New JSX transform (no React import needed)

## Import Organization

**Order (observed in codebase):**
1. External package imports (React, Next.js, tRPC, etc.)
2. Type imports from external packages
3. Local monorepo imports (from `@sparkmotion/*`)
4. Type imports from local packages

**Example from `packages/api/src/routers/events.ts`:**
```typescript
import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../trpc";
import { db } from "@sparkmotion/database";
import { invalidateEventCache } from "@sparkmotion/redis";
```

**Path Aliases:**
- Relative imports: Used for local files (`../trpc`, `./client`)
- Workspace imports: Monorepo packages use `@sparkmotion/*` prefix
  - `@sparkmotion/api` - tRPC routers and procedures
  - `@sparkmotion/database` - Prisma client and types
  - `@sparkmotion/redis` - Redis client and cache utilities
  - `@sparkmotion/ui` - React components
- App-level aliases: `@/` prefix for app-specific imports (e.g., `@/lib/trpc`)

## Error Handling

**Backend (tRPC):**
- Use `TRPCError` from `@trpc/server` for API errors
- Standard tRPC error codes: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `BAD_REQUEST`
- Errors thrown in middleware/procedures automatically propagate to client
```typescript
// From packages/api/src/trpc.ts
if (!ctx.user) {
  throw new TRPCError({ code: "UNAUTHORIZED" });
}
if (ctx.user.role !== "ADMIN") {
  throw new TRPCError({ code: "FORBIDDEN" });
}
```

**HTTP Routes:**
- Use `NextResponse.json()` for error responses with appropriate status codes
- Return errors with shape: `{ error: string }`
- Log errors to console before returning
```typescript
// From apps/hub/src/app/e/route.ts
if (!bandId) {
  return NextResponse.json({ error: "bandId is required" }, { status: 400 });
}
try {
  // ... handler logic
} catch (error) {
  console.error("Redirect error:", error);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}
```

**Fire-and-forget Operations:**
- Use `.catch(() => {})` to silence errors on non-critical background tasks
- Do NOT block critical paths (like redirects) with error handling
```typescript
// From apps/hub/src/app/e/route.ts
// Log tap asynchronously — don't block redirect
logTap(bandData, request).catch(() => {});
return NextResponse.redirect(bandData.redirectUrl, 302);
```

## Logging

**Framework:** `console` methods (no dedicated logging library)

**Patterns:**
- `console.error()` for exceptions and failures
- Prefix with context: `"Redirect error: "`, `"Error loading event: "`
- Log before returning error responses to ensure visibility
```typescript
// From apps/hub/src/app/e/route.ts
console.error("Redirect error:", error);
```

**Guidelines:**
- Error logs on critical path (redirect endpoint)
- No info/debug logs in performance-critical functions
- Async logging should NOT block critical operations (use `.catch(() => {})`)

## Comments

**When to Comment:**
- Complex business logic (e.g., mode determination, window scheduling)
- Non-obvious algorithmic decisions
- Performance-critical sections with explanation
- When WHY matters more than WHAT the code does

**Examples from codebase:**
```typescript
// From apps/hub/src/app/e/route.ts
// 1. Check Redis cache for band
// 2. Cache miss — look up band in DB, auto-create if needed
// 3. Log tap asynchronously — don't block redirect
// 4. Redirect

// Band not found — no event to redirect to
return NextResponse.json({ error: "Unknown band" }, { status: 404 });

// Fire-and-forget: update DB and Redis analytics in parallel
await Promise.all([...]);

// Default to pre-event
currentMode = "pre";
```

**JSDoc/TSDoc:**
- Not extensively used; TypeScript types provide self-documentation
- Function signatures with parameter types are sufficient
- Interface properties typed and self-documenting
```typescript
// From packages/redis/src/cache.ts
export interface CachedBand {
  bandId: string;
  eventId: string;
  status: string;
  currentMode: string;
  redirectUrl: string;
}

export async function getCachedBand(bandId: string): Promise<CachedBand | null> {
  const data = await redis.get(KEYS.band(bandId));
  return data ? JSON.parse(data) : null;
}
```

## Function Design

**Size Guidelines:**
- Functions should be small and focused (single responsibility)
- Nested helpers for specialized logic (e.g., `resolveEventStatus()`, `getRedirectUrl()` in redirect handler)
- Router procedures typically 5-15 lines (validation + DB call + return)

**Parameters:**
- Use object destructuring for multiple parameters
- Zod validation for tRPC input (automatic runtime validation)
- Type everything; no implicit `any`
```typescript
// From packages/api/src/routers/bands.ts
.input(
  z.object({
    eventId: z.string(),
    bandIds: z.array(z.string()).min(1).max(10000),
  })
)
.mutation(async ({ input }) => {
  // Input is typed and validated
  const data = input.bandIds.map((bandId) => ({...}));
});
```

**Return Values:**
- Explicit return types on all async functions
- Return typed objects, not raw database results (when possible)
- Cache-aside functions return `Promise<T | null>`
```typescript
export async function getCachedBand(bandId: string): Promise<CachedBand | null>
export async function setCachedBand(bandId: string, band: CachedBand): Promise<void>
export async function recordTap(eventId: string, bandId: string, mode: string): Promise<void>
```

## Module Design

**Exports:**
- Named exports for functions and types
- Default export only for React components (page/layout components)
- Use barrel files (`index.ts`) for public APIs
```typescript
// From packages/ui/src/index.ts
export { EventCard } from "./event-card";
export { EventList } from "./event-list";
export { StatCard } from "./stat-card";

// From packages/redis/src/index.ts
export { getCachedBand, setCachedBand, invalidateBandCache } from "./cache";
export { recordTap, getAnalytics } from "./analytics";
```

**Barrel Files:**
- Used to group and expose related functionality
- Keep barrel files simple (just re-exports)
- One barrel file per package (`src/index.ts`)

**Package Organization:**
- Each package has clear single purpose:
  - `@sparkmotion/database` - Prisma client
  - `@sparkmotion/redis` - Redis operations
  - `@sparkmotion/api` - tRPC router definitions
  - `@sparkmotion/ui` - React components
  - `apps/admin` - Admin dashboard
  - `apps/hub` - Public redirect endpoint
  - `apps/customer` - Customer portal

## Next.js-Specific Conventions

**Server vs Client Components:**
- Default to server components in `app/` directory
- Use `'use client'` only when necessary (browser APIs, hooks)
- No indication of client-only use in hub/redirect route (server-side only)

**Route Handlers:**
- Named exports: `GET`, `POST`, `PUT`, `DELETE`
- Use `NextRequest` and `NextResponse` for request/response handling
- Type routes explicitly with TypeScript
```typescript
// From apps/hub/src/app/e/route.ts
export async function GET(request: NextRequest) {
  // handler logic
  return NextResponse.redirect(...) or NextResponse.json(...)
}
```

**Runtime Configuration:**
- Specify `export const runtime` for route/page requirements
- `"nodejs"` for database/Redis access
- `"edge"` for fast redirects with no external services
```typescript
// From apps/hub/src/app/e/route.ts
export const runtime = "nodejs"; // needs DB/Redis access
```

## React Component Conventions

**Functional Components:**
- All React components are functional (no class components)
- Props interfaces named with `Props` suffix
- Destructure props in function signature
```typescript
// From packages/ui/src/event-card.tsx
interface EventCardProps {
  name: string;
  tourName?: string | null;
  status: string;
  bandCount: number;
  onClick?: () => void;
}

export function EventCard({ name, tourName, status, bandCount, onClick }: EventCardProps) {
  return (/* JSX */);
}
```

**Styling:**
- Inline Tailwind CSS classes
- No CSS modules or styled-components
- Use semantic CSS class names
```typescript
className="rounded-lg border border-gray-200 p-4 hover:shadow-sm transition-all cursor-pointer"
className="flex items-center justify-between"
```

## Async/Await

**Pattern:**
- Async functions marked with `async` keyword
- Always return `Promise<T>` with explicit type
- Use `await` for sequential operations, `Promise.all()` for parallel
```typescript
// Sequential
const event = await db.event.findUniqueOrThrow({...});
const windows = await db.eventWindow.findMany({...});

// Parallel
const [bandCount, tapCount, uniqueBands] = await Promise.all([
  db.band.count({...}),
  db.tapLog.count({...}),
  db.band.count({...}),
]);

// Fire-and-forget (with error suppression)
logTap(bandData, request).catch(() => {});
```

## Constants and Configuration

**TTL Constants:**
- Defined as module-level constants with clear naming
- Values in seconds
```typescript
// From packages/redis/src/cache.ts
const BAND_TTL = 300; // 5 minutes
const EVENT_TTL = 60; // 1 minute
```

**Key Generation:**
- Centralized in `keys.ts` module
- Use factory functions to generate cache keys
```typescript
// From packages/redis/src/keys.ts
export const KEYS = {
  band: (bandId: string) => `band:${bandId}` as const,
  eventStatus: (eventId: string) => `event:${eventId}:status` as const,
  tapsTotal: (eventId: string) => `analytics:${eventId}:taps:total` as const,
};
```

---

*Convention analysis: 2026-01-28*
