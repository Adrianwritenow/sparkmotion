# Deploy Checklist (Before Feb 27, 2026)

## Architecture: Two-Tier Edge + Hub

NFC redirect traffic flows through a **Cloudflare Worker** at the edge, with the **Vercel Hub** as a fallback for complex logic:

```
*.sparkmotion.net (wildcard subdomain, proxied through Cloudflare)
  │
  ├─ /e?bandId=XXX → Cloudflare Worker (edge, <15ms):
  │    KV lookup by bandId
  │    HIT (99% during live event) → 302 redirect + async analytics
  │    MISS → proxy to Hub
  │         └─ Hub /e route (Vercel, ~200ms):
  │              Auto-assignment, GeoIP routing, DB access
  │              Hub handles its own analytics (no double-count)
  │
  └─ /* (all other paths) → Cloudflare Worker proxies to Webflow:
       Org microsite (e.g. compassion-sparkmotion.webflow.io)
       Landing pages, about, etc.

admin.sparkmotion.net → Vercel (DNS only, gray cloud)
app.sparkmotion.net   → Vercel (DNS only, gray cloud)
geo.sparkmotion.net   → Vercel (DNS only, gray cloud)
sparkmotion.net       → Squarespace (DNS only, gray cloud)
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
| `HUB_URL` | Hub origin URL, e.g. `https://geo.sparkmotion.net` |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token |
| `FALLBACK_URL` | Generic fallback URL (e.g. `https://sparkmotion.io`) |
| `WEBFLOW_ORIGIN` | Webflow microsite origin, e.g. `https://compassion-sparkmotion.webflow.io` |

KV namespace binding: `REDIRECT_MAP` (configured in `wrangler.toml`).

Deploy:
```bash
cd apps/redirect && pnpm wrangler deploy
```

## Domains & DNS

The root domain `sparkmotion.net` hosts the existing marketing site on Squarespace. DNS must be migrated to Cloudflare so the wildcard `*.sparkmotion.net` can be proxied through a Cloudflare Worker. NFC wristbands use URLs like `https://compassion.sparkmotion.net/e?bandId=00000001`. The Worker handles `/e` (NFC redirect) and `/health` at the edge; all other paths are proxied to the org's Webflow microsite.

### DNS Records (Cloudflare)

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| A/CNAME | `@` (root) | Squarespace target | DNS only (gray cloud) |
| CNAME | `www` | Squarespace target | DNS only (gray cloud) |
| CNAME | `admin` | `cname.vercel-dns.com` | DNS only (gray cloud) |
| CNAME | `app` | `cname.vercel-dns.com` | DNS only (gray cloud) |
| CNAME | `hub` | `cname.vercel-dns.com` | DNS only (gray cloud) |
| CNAME | `*` | Worker route (see below) | Proxied (orange cloud) |

> **Important:** Root + `www` + `admin` + `app` + `hub` must be gray-cloud (DNS only) so Cloudflare doesn't intercept those. Only the wildcard `*` gets orange-cloud (proxied) so the Worker can handle it.

### Worker Route

In Cloudflare dashboard → Workers Routes:
- Route pattern: `*.sparkmotion.net/*`
- Worker: `sparkmotion-redirect`

All wildcard subdomain traffic hits the Worker. The Worker decides:
- `/e` → NFC redirect logic (KV lookup, Hub fallback)
- `/health` → health check
- Everything else → proxy to Webflow microsite (`WEBFLOW_ORIGIN`)

Explicit CNAME records for `admin`, `app`, `hub` (gray-cloud) bypass the Cloudflare proxy entirely and go straight to Vercel.

### Migration Steps

- [ ] Add `sparkmotion.net` to Cloudflare dashboard (Cloudflare scans existing DNS records)
- [ ] Recreate all existing Squarespace DNS records in Cloudflare (copy ALL records before switching)
- [ ] Add the DNS records listed above
- [ ] Update nameservers at Squarespace to point to Cloudflare's assigned nameservers
- [ ] Wait for DNS propagation (usually <1 hour, can take up to 48h)
- [ ] Configure Worker route: `*.sparkmotion.net/*` → `sparkmotion-redirect`
- [ ] Add `geo.sparkmotion.net` as custom domain on the **hub** Vercel project
- [ ] Add `admin.sparkmotion.net` as custom domain on the **admin** Vercel project
- [ ] Add `app.sparkmotion.net` as custom domain on the **customer** Vercel project
- [ ] Verify SSL certificates are provisioned for all domains
- [ ] Verify `sparkmotion.net` still serves Squarespace site after nameserver change

### Concerns

- **Squarespace nameserver change**: Squarespace may show a warning when nameservers move away. The site continues to work as long as the A/CNAME records in Cloudflare point to the same Squarespace targets.
- **Webflow asset paths**: The Worker proxies the full path, so relative paths resolve correctly. Test thoroughly after deploy.
- **Webflow SSL**: Worker fetches from `*.webflow.io` (valid SSL). No custom domain config needed in Webflow.
- **Multi-tenant future**: When adding more orgs, replace the single `WEBFLOW_ORIGIN` env var with a KV lookup (org slug → Webflow origin URL).

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
2. **Cloudflare DNS migration** — Add `sparkmotion.net` to Cloudflare, recreate all existing DNS records, update nameservers at Squarespace, wait for propagation
3. **Hub app** — Deploy first. Must be live before the Worker can proxy to it. Cron endpoints must be live before `flush-taps` runs.
4. **Cloudflare Worker** — Deploy `apps/redirect` via `pnpm wrangler deploy`. Set secrets (`HUB_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `FALLBACK_URL`, `WEBFLOW_ORIGIN`). Bind `REDIRECT_MAP` KV namespace. Configure Worker route: `*.sparkmotion.net/*` → `sparkmotion-redirect`.
5. **Admin app** — Deploy, verify admin UI loads at `admin.sparkmotion.net`
6. **Customer app** — Deploy last (depends on admin URL being live), verify at `app.sparkmotion.net`
7. **Verify end-to-end:**
   - `sparkmotion.net` → Squarespace marketing site (unchanged)
   - `compassion.sparkmotion.net` → Webflow microsite
   - `compassion.sparkmotion.net/e?bandId=00000001` → NFC redirect (302)
   - `admin.sparkmotion.net` → Admin dashboard (Vercel)
   - `app.sparkmotion.net` → Customer portal (Vercel)
   - Check Redis analytics keys, trigger flush-taps cron, verify tap log appears in DB
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
