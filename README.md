# SparkMotion

Multi-tenant NFC event engagement platform. NFC wristbands dynamically redirect attendees based on event timeline (pre/live/post modes).

**Client:** Compassion International (30-city tour, March 2026)

## Architecture

```
NFC Tap -> *.sparkmotion.net/e?bandId=XXX
  |
  +-- Cloudflare Worker (edge, <15ms)
  |     KV lookup by bandId
  |     HIT (99% during live) -> 302 redirect + async analytics
  |     MISS -> proxy to Hub
  |
  +-- Hub /e route (Vercel, ~200ms)
        Auto-assignment, GeoIP routing, DB lookup
        Caches result to KV for future hits
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | Turborepo + pnpm |
| Framework | Next.js 14 (App Router) |
| API | tRPC v10 |
| Database | PostgreSQL (Neon) + Prisma 6 |
| Cache | Redis (ioredis on Vercel, Upstash REST on Cloudflare) |
| Edge | Cloudflare Workers + KV |
| Auth | NextAuth v5 (credentials) |
| UI | shadcn/ui + Tailwind CSS |
| Language | TypeScript (strict) |

## Monorepo Structure

```
apps/
  admin/        -> Admin dashboard (all orgs, port 3000)
  customer/     -> Customer portal (org-scoped, port 3001)
  hub/          -> NFC redirect backend + crons (port 3002)
  redirect/     -> Cloudflare Worker edge redirects

packages/
  api/          -> tRPC routers (events, analytics, infrastructure)
  auth/         -> NextAuth v5 config + credential provider
  database/     -> Prisma schema + generated client
  email/        -> React Email templates + Resend client
  redis/        -> ioredis client wrapper
  ui/           -> Shared React components (shadcn + custom)
```

### Shared Packages

| Package | Import | Description |
|---------|--------|-------------|
| `api` | `@sparkmotion/api` | tRPC v10 routers — events, bands, campaigns, organizations, analytics, users, windows, tags, infrastructure |
| `auth` | `@sparkmotion/auth` | NextAuth v5 config with credential provider + bcryptjs password hashing |
| `database` | `@sparkmotion/database` | Prisma 6 schema, generated client, seed scripts (`seed-prod`) |
| `email` | `@sparkmotion/email` | Resend client + React Email templates (user-invite, password-reset, contact-org) |
| `redis` | `@sparkmotion/redis` | ioredis client wrapper for caching and queue operations |
| `ui` | `@sparkmotion/ui` | shadcn/ui primitives (Button, Card, Dialog, Table, etc.) + custom business components |

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | >= 20 |
| pnpm | 9.15.0 (pinned via `packageManager`) |
| Wrangler | >= 3.99 (for Cloudflare Worker) |
| PostgreSQL | Any (Neon in production) |
| Redis | ioredis-compatible (Upstash in production) |

## Quick Start

```bash
# Install dependencies
pnpm install

# Copy environment file
cp .env.template .env
# Fill in DATABASE_URL, REDIS_URL, AUTH_SECRET

# Generate Prisma client
pnpm db:generate

# Push schema to database
pnpm db:push

# Enable required PostgreSQL extensions (once)
# psql: CREATE EXTENSION IF NOT EXISTS cube;
# psql: CREATE EXTENSION IF NOT EXISTS earthdistance;

# Start all apps
pnpm dev
```

Apps will be available at:
- Admin: http://localhost:3000
- Customer: http://localhost:3001
- Hub: http://localhost:3002

## Environment Variables

Root `.env` (shared by all Vercel apps):

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Neon PostgreSQL connection string (pooled) |
| `REDIS_URL` | Upstash Redis URL (`rediss://...`) |
| `AUTH_SECRET` | Shared NextAuth secret (`openssl rand -base64 32`) |

Per-app variables are documented in each app's README:
- [apps/admin/README.md](apps/admin/README.md)
- [apps/customer/README.md](apps/customer/README.md)
- [apps/hub/README.md](apps/hub/README.md)
- [apps/redirect/README.md](apps/redirect/README.md)

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start all apps in development mode |
| `pnpm build` | Build all apps (runs Prisma generate first) |
| `pnpm lint` | Lint all packages |
| `pnpm db:generate` | Generate Prisma client |
| `pnpm db:migrate` | Run Prisma migrations |
| `pnpm db:push` | Push schema to database (no migration) |
| `pnpm db:seed-prod` | Seed production data (Compassion org, admin user) |
| `pnpm db:studio` | Open Prisma Studio GUI |
| `pnpm test` | Run all tests (Vitest) |

## Production Domains

| Domain | Target | Purpose |
|--------|--------|---------|
| `sparkmotion.net` | Squarespace | Marketing site (existing) |
| `*.sparkmotion.net` | Cloudflare Worker | NFC redirect + Webflow proxy |
| `geo.sparkmotion.net` | Vercel | Hub fallback + crons |
| `admin.sparkmotion.net` | Vercel | Admin dashboard |
| `app.sparkmotion.net` | Vercel | Customer portal |

## Data Model

```
Organization
  +-- User[]         (role: ADMIN | CUSTOMER, orgRole: OWNER | EDITOR | VIEWER)
  +-- Campaign[]     (optional grouping, e.g. "30-City Tour")
  |     +-- Event[]
  +-- Event[]        (city, venue, geo coords, schedule mode)
        +-- EventWindow[]  (PRE / LIVE / POST redirect URLs, one active at a time)
        +-- Band[]         (physical NFC chip -> event assignment)
        |     +-- TapLog[]
        +-- TapLog[]       (immutable change log, ~600K per event)
```

## Testing

**Framework:** [Vitest](https://vitest.dev/) (v4)

```bash
# Run all tests
pnpm test

# Run tests in watch mode (from packages/api)
cd packages/api && pnpm vitest
```

Tests live in `packages/api/src/routers/` alongside the router files:

| Test File | Coverage |
|-----------|----------|
| `events.test.ts` | Event CRUD, org scoping, soft delete |
| `bands.test.ts` | Band assignment, CSV import, tap counts |
| `campaigns.test.ts` | Campaign lifecycle, event association |
| `organizations.test.ts` | Org CRUD, access control |
| `users.test.ts` | User management, roles, invitations |
| `windows.test.ts` | Event window scheduling, activation |
| `analytics.test.ts` | Tap analytics, time series |
| `tags.test.ts` | Tag CRUD, assignment |
| `infrastructure.test.ts` | Usage/cost endpoints |

## Load Testing

**Framework:** [k6](https://k6.io/) with Grafana Cloud integration

```bash
cd load-tests

# Run locally (streams results to Grafana Cloud)
./run-k6.sh

# Run on Grafana Cloud generators
./run-k6.sh --cloud-exec

# Run locally without cloud
./run-k6.sh --no-cloud
```

**Scenarios** (defined in `load-tests/e2e-load.js`):

| Scenario | Type | Description |
|----------|------|-------------|
| `tappers` | ramping-arrival-rate | Worker redirect simulation (500 → 10K RPS) |
| `admins` | constant-vus (10) | Dashboard analytics polling |
| `exporters` | constant-vus (2) | CSV export via tRPC |
| `cron_trigger` | constant-arrival-rate | flush-taps cron simulation |
| `queue_sampler` | constant-arrival-rate | Redis queue observability |

**SLO thresholds:** redirect p95 < 50ms, analytics p95 < 5s, error rate < 1%, KV hit rate > 99%

See `load-tests/` for seed scripts, environment configs, and analysis reports.

## CI/CD

GitHub Actions pipeline (`.github/workflows/ci.yml`):

```
PR / push to main or staging:
  lint  ──┐
  test  ──┼──> build
  audit ──┘
                 │
  (merge to main only)
                 ├──> db-push (Prisma schema → production)
                 └──> deploy-worker-production

  (merge to staging only)
                 ├──> open-release-pr (staging → main)
                 └──> deploy-worker-staging
```

Additionally, CodeQL runs on every push/PR and weekly for security analysis.

## Git Workflow

```
feature branch ──> PR to staging ──> PR staging → main
```

1. Branch off `staging` for all work
2. Open PR to `staging` — CI runs lint, test, audit, build
3. Merge to `staging` — Worker deploys to staging, release PR auto-opens
4. Merge release PR (`staging → main`) — Worker + schema deploy to production

## Deployment

See [DEPLOY-CHECKLIST.md](DEPLOY-CHECKLIST.md) for the full deploy order, infrastructure requirements, and environment variable reference.
