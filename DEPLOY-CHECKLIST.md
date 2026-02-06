# Deploy Checklist (Before Feb 27, 2026)

## Infrastructure Upgrades (No Code Changes)

- [ ] Upgrade Upstash Redis to **Pro** ($10/mo) — need >115 cmd/sec for analytics pipeline
- [ ] Upgrade Vercel to **Pro** ($20/mo) — 60s timeout for crons + mutations, reliable cron execution
- [ ] Upgrade Neon PostgreSQL to **Scale** ($19/mo) — 50GB storage for 18M+ tap logs
- [ ] Upgrade Cloudflare Workers to **Paid** ($5/mo) — >100K req/day limit

**Total base cost**: ~$54/mo + ~$15-25/tour in usage fees

## Code Fixes (Applied in This PR)

- [x] **P0**: Fix LRANGE/LTRIM race condition — atomic Lua script in `flush-taps/route.ts`
- [x] **P1**: Remove `_count: { tapLogs }` from `events.byId` — eliminates full-table scan at 600K+ taps/event
- [x] **P1**: Add `maxDuration = 60` to tRPC route handlers (admin + customer apps)
- [x] **P2**: Replace `groupBy` with `COUNT(DISTINCT)` in analytics kpis — single row instead of 200K rows
- [x] **P3**: Optimize flush-taps transaction — 2 batch SQL queries instead of 2N individual UPDATEs
- [x] **P3**: Fix cost projection from 7 to 9 commands/tap

## Post-Launch (Not Urgent)

- [ ] Full-rebuild `refreshMap` timeout — only affects admin manual refresh with 30+ events
- [ ] TapLog table partitioning — not needed at 18M rows, consider at 100M+
- [ ] Redis key expiration for analytics HyperLogLog keys — add TTL after tour ends
- [ ] SSE connection multiplexing — only if >100 concurrent dashboard viewers
