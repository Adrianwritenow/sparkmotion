# Deploy Checklist (Before Feb 27, 2026)

## Architecture: Two-Tier Edge + Hub

NFC redirect traffic flows through a **Cloudflare Worker** at the edge, with the **Vercel Hub** as a fallback for complex logic:

```
NFC Tap → *.sparkmotion.net/e?bandId=XXX
  │
  ├─ Cloudflare Worker (edge, <15ms):
  │    KV lookup by bandId
  │    HIT (99% during live event) → 302 redirect + async analytics
  │    MISS → proxy to Hub
  │
  └─ Hub /e route (Vercel, ~200ms):
       Auto-assignment, GeoIP routing, DB access
       Hub handles its own analytics (no double-count)
```

- **KV hit path** (~99% of live-event traffic): Worker reads from globally-replicated Cloudflare KV, fires async Upstash analytics, returns 302. Sub-15ms.
- **KV miss path** (first tap from unknown band, pre-event): Worker proxies to Hub `/e` route, which handles auto-assignment, GeoIP, and DB lookups. Hub records its own analytics — Worker does not, avoiding double-count.
- **KV sync**: The existing `update-windows` cron calls `generateRedirectMap()` every minute, which writes entries to both Redis and Cloudflare KV. No new sync logic needed.

## Infrastructure Upgrades (No Code Changes)

- [ ] Upgrade Upstash Redis to **Pro** ($10/mo) — need >115 cmd/sec for analytics pipeline
- [ ] Upgrade Vercel to **Pro** ($20/mo) — 60s timeout for crons + mutations, reliable cron execution
- [ ] Upgrade Neon PostgreSQL to **Scale** ($19/mo) — 50GB storage for 18M+ tap logs

**Total base cost**: ~$49/mo

## Code Fixes (Applied in This PR)

- [x] **P0**: Fix LRANGE/LTRIM race condition — atomic Lua script in `flush-taps/route.ts`
- [x] **P1**: Remove `_count: { tapLogs }` from `events.byId` — eliminates full-table scan at 600K+ taps/event
- [x] **P1**: Add `maxDuration = 60` to tRPC route handlers (admin + customer apps)
- [x] **P2**: Replace `groupBy` with `COUNT(DISTINCT)` in analytics kpis — single row instead of 200K rows
- [x] **P3**: Optimize flush-taps transaction — 2 batch SQL queries instead of 2N individual UPDATEs
- [x] **P3**: Fix cost projection from 7 to 9 commands/tap

## Vercel Project Setup

Create 3 Vercel projects, all linked to the same GitHub repo:

| Project | Root Directory | Framework Preset |
|---------|---------------|-----------------|
| `sparkmotion-admin` | `apps/admin` | Next.js |
| `sparkmotion-customer` | `apps/customer` | Next.js |
| `sparkmotion-hub` | `apps/hub` | Next.js |

For each project:
- [ ] Create project in Vercel dashboard (or `vercel link`)
- [ ] Set **Root Directory** to the correct `apps/*` path
- [ ] Framework Preset: **Next.js**
- [ ] Enable **Pro plan** features (60s function timeout, cron jobs)

## Environment Variables

### Shared (set on all 3 Vercel projects)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Neon PostgreSQL connection string (`?sslmode=require`) |
| `REDIS_URL` | Upstash Redis `redis://` connection string (ioredis format) |
| `AUTH_SECRET` | Shared NextAuth secret (same value across all apps) |

### Per-App

**`sparkmotion-admin`**
| Variable | Value |
|----------|-------|
| `AUTH_COOKIE_PREFIX` | `admin-auth` |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Maps API key (for venue autocomplete) |

**`sparkmotion-customer`**
| Variable | Value |
|----------|-------|
| `AUTH_COOKIE_PREFIX` | `customer-auth` |
| `NEXT_PUBLIC_ADMIN_URL` | Production admin URL (e.g. `https://admin.sparkmotion.net`) |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Maps API key (for venue autocomplete) |

**`sparkmotion-hub`**
| Variable | Value |
|----------|-------|
| `CRON_SECRET` | Secret token to authenticate cron job requests |
| `CF_ACCOUNT_ID` | Cloudflare account ID (for KV sync) |
| `CF_API_TOKEN` | Cloudflare API token with Workers KV write access |
| `CF_KV_NAMESPACE_ID` | Cloudflare KV namespace ID for `REDIRECT_MAP` |

### Cloudflare Worker (`apps/redirect`)

| Secret | Description |
|--------|-------------|
| `HUB_URL` | Hub origin URL, e.g. `https://hub.sparkmotion.net` |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token |
| `FALLBACK_URL` | Generic fallback URL (e.g. `https://sparkmotion.io`) |

KV namespace binding: `REDIRECT_MAP` (configured in `wrangler.toml`).

Deploy:
```bash
cd apps/redirect && pnpm wrangler deploy
```

## Domains & DNS

The root domain `sparkmotion.net` hosts the existing marketing site on DigitalOcean — **do not change it**. NFC wristbands are programmed with URLs like `https://compassion.sparkmotion.net/e?bandId=00000001`. The Cloudflare Worker intercepts all wildcard subdomain traffic at the edge; on KV miss, the Worker proxies to `hub.sparkmotion.net` on Vercel. Explicit CNAME records for `admin` and `app` override the wildcard for those subdomains.

| Service | Domain | DNS Record | Target |
|---------|--------|-----------|--------|
| Marketing site | `sparkmotion.net` | (existing) | DigitalOcean (unchanged) |
| NFC redirect (edge) | `*.sparkmotion.net` | Proxied via Cloudflare | Cloudflare Worker route |
| Hub (Worker fallback) | `hub.sparkmotion.net` | CNAME | `cname.vercel-dns.com` |
| Admin app | `admin.sparkmotion.net` | CNAME | `cname.vercel-dns.com` |
| Customer app | `app.sparkmotion.net` | CNAME | `cname.vercel-dns.com` |

> **How it works:** The wildcard `*.sparkmotion.net` is proxied through Cloudflare, where a Worker route handles `/e` requests at the edge via KV lookup. On KV miss, the Worker proxies to `hub.sparkmotion.net` (Vercel) for auto-assignment and GeoIP routing. Explicit CNAME records for `admin`, `app`, and `hub` take priority over the wildcard. The root `sparkmotion.net` (no subdomain) is unaffected.

- [ ] Configure `*.sparkmotion.net` on Cloudflare with Worker route for `/e` path
- [ ] Add `hub.sparkmotion.net` as custom domain on the **hub** Vercel project
- [ ] Add `admin.sparkmotion.net` as custom domain on the **admin** Vercel project
- [ ] Add `app.sparkmotion.net` as custom domain on the **customer** Vercel project
- [ ] Create CNAME record: `hub.sparkmotion.net` → `cname.vercel-dns.com`
- [ ] Create CNAME record: `admin.sparkmotion.net` → `cname.vercel-dns.com`
- [ ] Create CNAME record: `app.sparkmotion.net` → `cname.vercel-dns.com`
- [ ] Verify SSL certificates are provisioned for all domains

## Database Production

- [ ] Enable PostgreSQL extensions required for GeoIP queries:
  ```sql
  CREATE EXTENSION IF NOT EXISTS cube;
  CREATE EXTENSION IF NOT EXISTS earthdistance;
  ```
  Required for `earth_distance()` and `ll_to_earth()` in the hub redirect route. These are not in any Prisma migration — they must be enabled manually on the Neon production database.
- [ ] Run Prisma migrations against production Neon database:
  ```bash
  DATABASE_URL="<production-url>" npx prisma migrate deploy
  ```
  Use `migrate deploy` (not `db push`) — it applies the migration history and is safe for production.
- [ ] Seed initial data if needed:
  ```bash
  DATABASE_URL="<production-url>" npx prisma db seed
  ```
  Review `packages/database/prisma/seed.ts` — ensure it only creates baseline data (orgs, default config), not test data.
- [ ] Create production admin user (manually or via seed) with `role: ADMIN`
- [ ] Verify connection pooling is enabled on Neon (use pooled connection string ending in `-pooler`)

## Deploy Order

1. **Database** — Enable `cube` + `earthdistance` extensions, run `prisma migrate deploy`, create admin user
2. **Hub app** — Deploy first. Must be live before the Worker can proxy to it. Cron endpoints must be live before `flush-taps` runs.
3. **Cloudflare Worker** — Deploy `apps/redirect` via `pnpm wrangler deploy`. Set secrets (`HUB_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `FALLBACK_URL`). Bind `REDIRECT_MAP` KV namespace.
4. **DNS** — Point `*.sparkmotion.net` through Cloudflare with Worker route. Add `hub.sparkmotion.net` CNAME to Vercel.
5. **Admin app** — Deploy, verify admin UI loads
6. **Customer app** — Deploy last (depends on admin URL being live)
7. **Verify end-to-end** — Open `https://compassion.sparkmotion.net/e?bandId=00000001` → confirm KV hit redirects instantly at edge. Test with unknown bandId → confirm Worker proxies to Hub → Hub responds with 302. Check Redis analytics keys, trigger flush-taps cron, verify tap log appears in DB.
8. **Enable Vercel crons** — Confirm `flush-taps` and `update-windows` crons are scheduled in hub's `vercel.json`

## Staging-First Approach

Deploy to a staging environment before production:
- [ ] Create staging Vercel projects (or use Preview deployments)
- [ ] Use a staging Neon database branch
- [ ] Test NFC redirect flow end-to-end with a real wristband tap
- [ ] Verify GeoIP-based event routing returns correct nearest event
- [ ] Load test redirect endpoint: target <50ms p99 at 5,000 req/s

## Post-Launch (Not Urgent)

- [ ] Full-rebuild `refreshMap` timeout — only affects admin manual refresh with 30+ events
- [ ] TapLog table partitioning — not needed at 18M rows, consider at 100M+
- [ ] Redis key expiration for analytics HyperLogLog keys — add TTL after tour ends
- [ ] SSE connection multiplexing — only if >100 concurrent dashboard viewers
