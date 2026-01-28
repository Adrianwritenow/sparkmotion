# External Integrations

**Analysis Date:** 2026-01-28

## APIs & External Services

**None currently integrated.** The codebase implements only internal APIs via tRPC.

**Future integrations noted in comments:**
- Authentication: TODO comment in `apps/admin/src/app/api/trpc/[trpc]/route.ts:11` - real auth not yet wired
- NextAuth scaffolding prepared (env vars present) but not implemented

## Data Storage

**Databases:**
- PostgreSQL (primary database)
  - Connection: `DATABASE_URL` environment variable
  - Provider: `postgresql` in `packages/database/prisma/schema.prisma`
  - Client: Prisma ORM (`@prisma/client` 6.2.0)
  - Usage: All persistent data (organizations, users, events, bands, tap logs)

**File Storage:**
- Local filesystem only - No S3 or cloud storage configured
- Branding JSON stored in `Organization.brandingJson` column (Prisma Json type)

**Caching:**
- Redis (in-memory cache)
  - Connection: `REDIS_URL` environment variable
  - Client: ioredis 5.4.0
  - Implementation: `packages/redis/` package
  - Usage:
    - Band data cache (keys: `band:${bandId}`)
    - Event status cache (keys: `event:${eventId}`)
    - Tap analytics aggregation

## Authentication & Identity

**Auth Provider:**
- Custom (in-progress, not fully wired)
  - Implementation: NextAuth scaffolding prepared
  - Current state: Auth middleware stub in tRPC context
  - File: `packages/api/src/trpc.ts` - defines `isAuthed`, `isAdmin`, `isCustomer` procedures
  - Session: Placeholder `ctx.user` object (null by default)
  - Environment: `NEXTAUTH_SECRET` and `NEXTAUTH_URL` vars prepared but unused

**User Model:**
```
Model: User (Prisma)
├── id (CUID)
├── email (unique)
├── name
├── role: UserRole (ADMIN | CUSTOMER)
└── orgUsers (relationship to organizations)
```

**Organization Access Control:**
- Multi-tenant via `Organization` model
- User-organization relationships through `OrgUser` model (roles: OWNER, EDITOR, VIEWER)
- Org scoping enforced in tRPC procedures: `packages/api/src/routers/events.ts`

## Monitoring & Observability

**Error Tracking:**
- None configured - No Sentry, Rollbar, or similar
- Error logging: Console logging only (`console.error` in route handlers)
- File: `apps/hub/src/app/e/route.ts:61-62` - Basic try/catch with console output

**Logs:**
- Approach: Console-based only
- Tap events logged to PostgreSQL (`TapLog` model) for analytics
- File: `apps/hub/src/app/e/route.ts:142-161` - Logs tap events with user agent and IP
- No external log aggregation (ELK, CloudWatch, etc.)

**Analytics:**
- Database: Tap logs persisted in `TapLog` table
  - Captures: bandId, eventId, tappedAt, modeServed, redirectUrl, userAgent, ipAddress
  - Queryable via `packages/api/src/routers/analytics.ts`
- Cache: Redis aggregate tracking via `packages/redis/src/analytics.ts`

## CI/CD & Deployment

**Hosting:**
- Not deployed yet - Development environment only (Feb 27 deadline)
- Expected targets: Vercel (Next.js native), AWS Lambda, or similar
- Hub app requires Node.js runtime (database/Redis access)

**CI Pipeline:**
- None configured
- Monorepo scripts defined in root `package.json`:
  - `pnpm dev` - Start all apps in dev mode
  - `pnpm build` - Build all apps via Turbo
  - `pnpm lint` - Run ESLint across monorepo (config not yet defined)
  - `pnpm db:*` - Prisma scripts (generate, migrate, push, studio)

**Build Tool:**
- Turbo 2.3.0 - Task orchestration and caching
- Configuration: `turbo.json` at root

## Environment Configuration

**Required env vars (from .env.example):**
```
DATABASE_URL="postgresql://user:pass@localhost:5432/sparkmotion"
REDIS_URL="redis://localhost:6379"
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"
NEXTAUTH_URL="http://localhost:3000"
```

**App-specific env:**
- Each Next.js app loads `.env.local` automatically
- Shared vars defined in root `.env` with workspace inheritance

**Secrets location:**
- Development: `.env.local` (git-ignored)
- Production: Environment variables in deployment platform
- No secrets management tool (HashiCorp Vault, AWS Secrets Manager) configured

## Webhooks & Callbacks

**Incoming:**
- None configured - No external webhooks received

**Outgoing:**
- None configured - No external APIs called
- Future: NextAuth OAuth callbacks prepared (env vars present)

## API Integration Points

**Internal APIs Only:**
- tRPC endpoint: `/api/trpc` (admin and customer apps)
  - File: `apps/admin/src/app/api/trpc/[trpc]/route.ts`
  - Router: `packages/api/src/root.ts`
  - Routers defined:
    - `events` - CRUD and listing for events
    - `windows` - Event window management
    - `bands` - Band data and assignment
    - `analytics` - Tap analytics and reporting

**Critical Redirect Path:**
- Hub app endpoint: `/e` (public, no auth)
  - File: `apps/hub/src/app/e/route.ts`
  - Query param: `?bandId=<NFC_BAND_ID>`
  - Response: HTTP 302 redirect to pre/live/post URL
  - Dependencies: Redis cache, PostgreSQL database

## Deployment Readiness

**Not production-ready yet:**
- Auth not wired (middleware stubs in place)
- Error tracking not implemented
- No monitoring/alerting configured
- No log aggregation set up
- No rate limiting configured (critical for 5,000 req/s target)
- No CDN configured (critical for <50ms latency target)

**Scaling considerations:**
- Redis connection pooling via ioredis (maxRetriesPerRequest: 3)
- PostgreSQL connection pooling via Prisma (default pool size)
- No load balancing configured yet
- No caching headers set on redirect response

---

*Integration audit: 2026-01-28*
