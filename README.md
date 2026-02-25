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
  redis/        -> ioredis client wrapper
  ui/           -> Shared React components (shadcn + custom)
```

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
| `pnpm db:studio` | Open Prisma Studio GUI |

## Production Domains

| Domain | Target | Purpose |
|--------|--------|---------|
| `sparkmotion.net` | DigitalOcean | Marketing site (existing) |
| `*.sparkmotion.net` | Cloudflare Worker | NFC redirect edge handler |
| `hub.sparkmotion.net` | Vercel | Hub fallback + crons |
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
        +-- TapLog[]       (immutable audit log, ~600K per event)
```

## Deployment

See [DEPLOY-CHECKLIST.md](DEPLOY-CHECKLIST.md) for the full deploy order, infrastructure requirements, and environment variable reference.
