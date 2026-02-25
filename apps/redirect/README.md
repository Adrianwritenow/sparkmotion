# Redirect Worker

Cloudflare Worker handling edge NFC redirects. Target latency: <15ms on KV hit. This is the first hop for every NFC tap — the Worker either serves a cached redirect from KV or proxies to the Hub.

- **Entry:** `src/worker.ts` (129 lines, single file)
- **Production:** `*.sparkmotion.net` (Cloudflare route)

## Flow

```
GET /e?bandId=XXX
  |
  +-- KV lookup: REDIRECT_MAP.get(bandId)
  |
  +-- HIT:
  |     Append UTM params if present
  |     302 redirect to entry.url
  |     waitUntil -> async analytics (7 Redis commands)
  |
  +-- MISS:
        Extract orgSlug from subdomain (compassion.sparkmotion.net -> compassion)
        Proxy to HUB_URL/e?bandId=...&orgSlug=...
        Forward geo headers (x-real-latitude/longitude from cf object)
        Forward IP + user-agent
        Hub returns 302 (passed through via redirect: "manual")
        On Hub failure -> 302 to FALLBACK_URL
```

Other routes:
- `GET /health` — returns `{ status: "ok" }`
- All other paths — `404`

## Analytics Pipeline

On every KV hit, 7 Upstash Redis commands are sent as a single pipelined HTTP request via `ctx.waitUntil` (non-blocking):

| # | Command | Key | Purpose |
|---|---------|-----|---------|
| 1 | `INCR` | `analytics:{eventId}:taps:total` | Lifetime tap counter |
| 2 | `PFADD` | `analytics:{eventId}:taps:unique` | HyperLogLog unique bands |
| 3 | `INCR` | `analytics:{eventId}:taps:hourly:{YYYY-MM-DDTHH}` | Hourly tap bucket |
| 4 | `INCR` | `analytics:{eventId}:mode:{mode}` | Per-mode counter (pre/live/post) |
| 5 | `INCR` | `analytics:{eventId}:velocity:{bucket}` | 10-second velocity bucket |
| 6 | `EXPIRE` | `analytics:{eventId}:velocity:{bucket}` | 30-min TTL on velocity key |
| 7 | `LPUSH` | `tap-log:pending` | Queue tap record for Hub's flush-taps cron |

## Environment

**KV Binding** (in `wrangler.toml`):

| Binding | Description |
|---------|-------------|
| `REDIRECT_MAP` | KV namespace storing `bandId -> { url, eventId, mode }` JSON entries |

**Secrets** (set via `wrangler secret put`):

| Secret | Description |
|--------|-------------|
| `HUB_URL` | Hub origin URL for KV-miss proxying |
| `UPSTASH_REDIS_REST_URL` | Upstash REST endpoint for analytics |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash auth token |
| `FALLBACK_URL` | Last-resort redirect if Hub is unreachable |

## Important Files

| File | Purpose |
|------|---------|
| `src/worker.ts` | Entire worker — fetch handler + logTap() |
| `wrangler.toml` | Worker config + KV binding |
| `.dev.vars` | Local secrets for `wrangler dev` |

## Development

```bash
# Start local dev server (uses Miniflare)
pnpm dev

# Deploy to Cloudflare
pnpm deploy

# Push secrets from .dev.vars to Cloudflare
pnpm secrets
```

To set individual secrets:

```bash
wrangler secret put HUB_URL
wrangler secret put UPSTASH_REDIS_REST_URL
wrangler secret put UPSTASH_REDIS_REST_TOKEN
wrangler secret put FALLBACK_URL
```
