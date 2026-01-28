# Codebase Structure

**Analysis Date:** 2026-01-28

## Directory Layout

```
sparkmotion/
├── apps/                          # Three Next.js applications
│   ├── admin/                     # Staff dashboard (role: ADMIN)
│   │   ├── src/
│   │   │   └── app/
│   │   │       ├── page.tsx              # Home
│   │   │       ├── layout.tsx            # Root layout
│   │   │       ├── globals.css           # Tailwind + custom styles
│   │   │       └── api/
│   │   │           └── trpc/[trpc]/      # tRPC endpoint handler
│   │   ├── next.config.ts
│   │   └── package.json
│   ├── customer/                  # Organization dashboard (role: CUSTOMER, org-scoped)
│   │   ├── src/
│   │   │   └── app/               # (same structure as admin)
│   │   ├── next.config.ts
│   │   └── package.json
│   └── hub/                       # Critical: NFC redirect endpoint (public)
│       ├── src/
│       │   └── app/
│       │       ├── page.tsx              # Home (error page only)
│       │       ├── layout.tsx            # Root layout
│       │       ├── globals.css           # Minimal styles
│       │       └── e/                    # **CRITICAL ENDPOINT**
│       │           └── route.ts          # GET /e?bandId=xxx → 302 redirect
│       ├── next.config.ts
│       └── package.json
├── packages/                      # Shared libraries (workspaces)
│   ├── ui/                        # React component library
│   │   ├── src/
│   │   │   ├── event-card.tsx            # Composed: Event display card
│   │   │   ├── event-list.tsx            # Composed: List of events with pagination
│   │   │   ├── stat-card.tsx             # Composed: Stat display with trend
│   │   │   └── index.ts                  # Public exports
│   │   ├── components/ui/         # shadcn/ui primitives (auto-generated)
│   │   ├── lib/
│   │   │   └── utils.ts                  # cn() helper for Tailwind
│   │   ├── tailwind.config.ts
│   │   └── package.json
│   ├── database/                  # Prisma ORM + client
│   │   ├── src/
│   │   │   └── index.ts                  # Exports: db singleton, Prisma types
│   │   ├── prisma/
│   │   │   ├── schema.prisma             # Data model (8 models)
│   │   │   └── migrations/               # Auto-generated migration files
│   │   └── package.json
│   ├── redis/                     # Redis client + cache/analytics utilities
│   │   ├── src/
│   │   │   ├── client.ts                 # Redis singleton (ioredis)
│   │   │   ├── cache.ts                  # Cache-aside operations (band, event)
│   │   │   ├── analytics.ts              # Real-time tap aggregation
│   │   │   ├── keys.ts                   # Redis key constants
│   │   │   └── index.ts                  # Public exports
│   │   └── package.json
│   └── api/                       # tRPC server setup + routers
│       ├── src/
│       │   ├── trpc.ts                   # tRPC instance + middleware (isAuthed, isAdmin, isCustomer)
│       │   ├── root.ts                   # Main appRouter combining all subroutes
│       │   ├── index.ts                  # Public exports: appRouter, AppRouter type
│       │   └── routers/
│       │       ├── events.ts             # list, byId, create, update, delete
│       │       ├── windows.ts            # list, create, toggle, delete
│       │       ├── bands.ts              # list, uploadBatch, tapHistory
│       │       └── analytics.ts          # realtime, tapsByHour, eventSummary
│       └── package.json
├── .planning/                     # GSD planning documents
│   └── codebase/
│       ├── ARCHITECTURE.md        # (this document)
│       └── STRUCTURE.md           # (this document)
├── turbo.json                     # Monorepo build config
├── pnpm-workspace.yaml            # pnpm workspaces definition
├── tsconfig.json                  # Root TypeScript config
├── package.json                   # Root scripts + pnpm version
├── pnpm-lock.yaml                 # Lock file
├── CLAUDE.md                      # Instructions for Claude
├── SYSTEM.md                      # System architecture overview
├── PHASES.md                      # Implementation phases
└── CONTEXT.md                     # Project context
```

## Directory Purposes

**apps/admin:**
- Purpose: Staff-only dashboard for managing all organizations and events
- Contains: Next.js app with tRPC client, shadcn components
- Key files: `page.tsx` (home), `api/trpc/[trpc]/route.ts` (API handler)
- Auth context: role: ADMIN, no org scoping

**apps/customer:**
- Purpose: Organization-scoped dashboard for managing their events
- Contains: Nearly identical to admin, but auth enforces org scoping
- Key files: `page.tsx` (home), `api/trpc/[trpc]/route.ts` (API handler)
- Auth context: role: CUSTOMER, orgId scoping in queries

**apps/hub:**
- Purpose: Public-facing NFC redirect endpoint (CRITICAL)
- Contains: Minimal UI (error pages only), zero client-side logic
- Key files: `e/route.ts` (NFC handler), `page.tsx` (fallback)
- Auth context: public/anonymous, no auth required

**packages/ui:**
- Purpose: Shared React component library
- Contains: shadcn/ui primitives + custom business components
- Key files: `event-card.tsx`, `event-list.tsx`, `stat-card.tsx`, `index.ts` (exports)
- Note: shadcn components auto-install to `components/ui/`

**packages/database:**
- Purpose: Single source of truth for data model and Prisma client
- Contains: Prisma schema, migrations, client singleton
- Key files: `schema.prisma` (8 models), `src/index.ts` (exports db singleton)
- Models: Organization, User, OrgUser, Event, EventWindow, Band, TapLog

**packages/redis:**
- Purpose: Cache-aside and analytics for critical path
- Contains: Redis client, cache helpers, analytics aggregation
- Key files: `client.ts`, `cache.ts`, `analytics.ts`, `keys.ts`
- Exports: getCachedBand, setCachedBand, recordTap, getAnalytics, redis client

**packages/api:**
- Purpose: tRPC server with role-based routers
- Contains: tRPC setup, middleware, 4 routers
- Key files: `trpc.ts` (middleware), `root.ts` (router composition), routers/*
- Exports: appRouter, AppRouter type, tRPC procedures

## Key File Locations

**Entry Points:**

- `apps/hub/src/app/e/route.ts`: **CRITICAL** NFC redirect endpoint (GET /e?bandId=xxx)
- `apps/admin/src/app/page.tsx`: Admin dashboard home
- `apps/customer/src/app/page.tsx`: Customer dashboard home
- `apps/admin/src/app/api/trpc/[trpc]/route.ts`: tRPC handler
- `apps/customer/src/app/api/trpc/[trpc]/route.ts`: tRPC handler

**Configuration:**

- `turbo.json`: Build task definitions (dev, build, lint, generate)
- `pnpm-workspace.yaml`: Monorepo root, defines `apps/*` and `packages/*`
- `tsconfig.json`: Root TypeScript strict mode config
- `packages/database/prisma/schema.prisma`: Data model definition
- `packages/ui/tailwind.config.ts`: Tailwind theme configuration

**Core Logic:**

- `packages/api/src/trpc.ts`: tRPC context + middleware (protectedProcedure, adminProcedure, customerProcedure)
- `packages/api/src/root.ts`: tRPC router composition (events, windows, bands, analytics)
- `packages/api/src/routers/events.ts`: Event CRUD + list/byId queries
- `packages/api/src/routers/windows.ts`: Event window management (manual/scheduled modes)
- `packages/api/src/routers/bands.ts`: Band listing, batch upload, tap history
- `packages/api/src/routers/analytics.ts`: Real-time taps, hourly breakdown, event summary
- `packages/redis/src/cache.ts`: Cache-aside with TTL management
- `packages/redis/src/analytics.ts`: Redis pipeline for tap counting + HyperLogLog unique tracking

**Testing:**

- Not configured yet (no test files found)

## Naming Conventions

**Files:**

- Components: `PascalCase.tsx` (e.g., `EventCard.tsx`)
- Utilities: `kebab-case.ts` (e.g., `event-card.ts`)
- Routes: kebab-case directories with `route.ts` (e.g., `api/trpc/[trpc]/route.ts`)
- Config: lowercase with extension (e.g., `next.config.ts`, `tailwind.config.ts`)

**Directories:**

- Feature directories: lowercase plural (e.g., `routers/`, `components/`)
- Dynamic segments: `[brackets]` (e.g., `[trpc]`, `[eventId]`)
- Catch-all routes: `[...slug]` (not currently used)

**TypeScript/React:**

- Component names: `PascalCase` (e.g., `function EventCard()`)
- Function names: `camelCase` (e.g., `getCachedBand()`)
- Types/Interfaces: `PascalCase` (e.g., `interface CachedBand`)
- Constants: `SCREAMING_SNAKE_CASE` (e.g., `BAND_TTL = 300`)
- Enums: `PascalCase` (e.g., `enum WindowType`)

## Where to Add New Code

**New API Procedure (e.g., new query or mutation):**

1. Create procedure in appropriate router in `packages/api/src/routers/` (e.g., `events.ts`)
2. Use `protectedProcedure`, `adminProcedure`, or `customerProcedure` based on auth
3. Define Zod input schema
4. Implement with Prisma queries
5. Register in `packages/api/src/root.ts` appRouter

Example location: `packages/api/src/routers/events.ts`

```typescript
export const eventsRouter = router({
  newProcedure: protectedProcedure
    .input(z.object({ /* schema */ }))
    .query(async ({ ctx, input }) => {
      // implementation
    }),
});
```

**New Component:**

1. If used 3+ times or composes multiple primitives: create in `packages/ui/src/` and export from `packages/ui/src/index.ts`
2. If single-use: create in app's `src/app/` (e.g., `apps/admin/src/app/components/MyComponent.tsx`)
3. Import primitives from `@sparkmotion/ui` (shadcn) or compose new components
4. Use Tailwind CSS with `cn()` helper from `packages/ui/lib/utils.ts`

Example location: `packages/ui/src/event-card.tsx`

**New Route (e.g., new page in admin):**

1. Create directory in `apps/admin/src/app/` or `apps/customer/src/app/`
2. Add `page.tsx` file (Server Component by default)
3. Use tRPC client to fetch data on Client Components if needed
4. Import shadcn components from `@sparkmotion/ui`

Example location: `apps/admin/src/app/events/page.tsx`

**New Database Model:**

1. Add model definition to `packages/database/prisma/schema.prisma`
2. Create migration: `pnpm db:migrate` (or use `pnpm db:push` for dev)
3. Regenerate Prisma client: `pnpm db:generate`
4. Create tRPC router in `packages/api/src/routers/` for CRUD operations
5. Register router in `packages/api/src/root.ts`

Example location: `packages/database/prisma/schema.prisma`

**New Cache Key Pattern:**

1. Add key generator to `packages/redis/src/keys.ts` in `KEYS` object
2. Create cache operations in `packages/redis/src/cache.ts` (get/set/invalidate)
3. Export from `packages/redis/src/index.ts`
4. Call invalidation after Prisma mutations in routers

Example location: `packages/redis/src/keys.ts`

## Special Directories

**node_modules:**
- Purpose: Dependency installations (one at root, one per app/package due to pnpm)
- Generated: Yes
- Committed: No (in .gitignore)

**prisma/migrations:**
- Purpose: Auto-generated migration SQL files
- Generated: Yes (by Prisma CLI)
- Committed: Yes (for reproducible deploys)

**.next/**
- Purpose: Next.js build output
- Generated: Yes
- Committed: No (in .gitignore)

**.turbo/**
- Purpose: Turbo build cache
- Generated: Yes
- Committed: No

**.planning/codebase/**
- Purpose: GSD codebase analysis documents
- Generated: Yes (by Claude)
- Committed: Yes

## Monorepo Scripts

**From root (`package.json`):**

```bash
pnpm dev               # Start all apps in dev mode (turbo dev)
pnpm build             # Build all apps (turbo build)
pnpm lint              # Lint all packages (turbo lint)
pnpm db:generate       # Regenerate Prisma client
pnpm db:migrate        # Create new migration
pnpm db:push           # Push schema to DB (dev only)
pnpm db:studio         # Open Prisma Studio GUI
```

**Workspace-specific:**

```bash
pnpm --filter @sparkmotion/admin dev     # Start admin app only
pnpm --filter @sparkmotion/database generate  # Prisma for database package only
```

## Package Dependencies

**Admin/Customer apps depend on:**
- `@sparkmotion/api` (tRPC routers)
- `@sparkmotion/database` (Prisma client)
- `@sparkmotion/ui` (components + tailwind)
- `next`, `react`, `react-dom`, `@trpc/client`, `@trpc/react-query`, `@tanstack/react-query`

**Hub app depends on:**
- `@sparkmotion/database` (Prisma client for logging)
- `@sparkmotion/redis` (cache, analytics)
- `next`, `react`, `react-dom`

**API package exports:**
- `appRouter`, `AppRouter` type, tRPC procedures to Admin/Customer

**Database package exports:**
- `db` (Prisma client singleton), `*` (all Prisma types)

**Redis package exports:**
- `redis` (client), `getCachedBand`, `setCachedBand`, `getCachedEventStatus`, `setCachedEventStatus`, `recordTap`, `getAnalytics`, `KEYS`

**UI package exports:**
- `EventCard`, `EventList`, `StatCard` (custom components)
- All shadcn/ui primitives via re-exports

---

*Structure analysis: 2026-01-28*
