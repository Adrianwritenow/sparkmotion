---
phase: 32-soc-2-backend-compliance-hardening
plan: "03"
subsystem: security
tags: [soc2, security-headers, hsts, cloudflare-worker, redis, tls]
dependency_graph:
  requires: []
  provides:
    - security-headers-next-apps
    - security-headers-cloudflare-worker
    - redis-tls-production-guard
  affects:
    - apps/admin
    - apps/customer
    - apps/hub
    - apps/redirect
    - packages/redis
tech_stack:
  added: []
  patterns:
    - Next.js headers() async function for production-only security headers
    - Cloudflare Worker SECURITY_HEADERS constant + withSecurityHeaders() helper
    - new Response(null, { status: 302 }) instead of Response.redirect() to allow header mutation
    - Redis TLS guard with console.warn on startup in production
key_files:
  created: []
  modified:
    - apps/admin/next.config.mjs
    - apps/customer/next.config.mjs
    - apps/hub/next.config.mjs
    - apps/redirect/src/worker.ts
    - packages/redis/src/client.ts
decisions:
  - HSTS max-age=31536000 with includeSubDomains since all sparkmotion.net subdomains use HTTPS
  - X-Frame-Options DENY since admin/customer apps must never be iframed
  - Headers production-only in Next.js to avoid HSTS issues with localhost HTTP development
  - Response.redirect() replaced with new Response(null, { status: 302 }) in Worker because Response.redirect() creates opaque responses where headers cannot be modified
  - Redis TLS guard is warning-only (not crash) to allow graceful non-TLS local dev when NODE_ENV is incorrectly set
metrics:
  duration: "95 seconds"
  completed_date: "2026-02-28"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 5
---

# Phase 32 Plan 03: Security Headers and Redis TLS Guard Summary

**One-liner:** Production security headers (HSTS, CSP-adjacent, clickjacking protection) added to all 3 Next.js apps and Cloudflare Worker, plus Redis TLS enforcement warning.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add security headers to all Next.js apps | 9e16cf8 | apps/admin/next.config.mjs, apps/customer/next.config.mjs, apps/hub/next.config.mjs |
| 2 | Add security headers to Cloudflare Worker + Redis TLS guard | 333a202 | apps/redirect/src/worker.ts, packages/redis/src/client.ts |

## What Was Built

### Task 1: Next.js Security Headers (3 apps)

All three Next.js apps (admin, customer, hub) received an `async headers()` function in their `next.config.mjs`. The function returns an empty array in non-production environments to avoid HSTS problems with localhost HTTP, and returns the full security header set in production.

Headers applied to all routes (`source: '/(.*)'`):
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-XSS-Protection: 1; mode=block`

### Task 2: Cloudflare Worker Security Headers

Added a `SECURITY_HEADERS` constant and a `withSecurityHeaders(response)` helper function near the top of `worker.ts`. The helper copies all existing response headers and adds the 5 security headers.

All response paths updated:
- `/health` health check: `withSecurityHeaders(Response.json(...))`
- Non-`/e` paths (404): `withSecurityHeaders(Response.json(...))`
- Missing `bandId` (400): `withSecurityHeaders(Response.json(...))`
- Scan mode HTML page: `...SECURITY_HEADERS` spread into headers object
- Hub proxy response: `withSecurityHeaders(hubResponse)`
- Fallback redirect (catch block): replaced `Response.redirect()` with `withSecurityHeaders(new Response(null, { status: 302, headers: { Location: ... } }))`
- KV hit redirect: replaced `Response.redirect()` with `withSecurityHeaders(new Response(null, { status: 302, headers: { Location: redirectUrl } }))`

### Task 2: Redis TLS Production Guard

Added a production check at module load time in `packages/redis/src/client.ts`. If `NODE_ENV === "production"` and `REDIS_URL` does not start with `rediss://`, a console warning is emitted showing the current protocol. This is warning-only (no crash) to allow graceful error reporting.

## Decisions Made

1. **Headers production-only in Next.js** — `if (process.env.NODE_ENV !== 'production') return []` prevents HSTS from being set on localhost HTTP, which would break development workflows for 1 year.

2. **`Response.redirect()` replaced entirely in Worker** — `Response.redirect()` returns an opaque redirect where headers are frozen and cannot be modified. The replacement `new Response(null, { status: 302, headers: { Location: url } })` is semantically identical but allows `withSecurityHeaders()` to mutate it.

3. **Warning-only TLS guard** — The Redis TLS check uses `console.warn` rather than throwing, so a misconfigured production environment surfaces clearly in logs without crashing the application. SOC 2 auditors can see the warning in log aggregation.

4. **HSTS includeSubDomains** — All `*.sparkmotion.net` subdomains use HTTPS (enforced by Cloudflare), so `includeSubDomains` is safe and strengthens the security posture.

5. **`X-Frame-Options: DENY`** — Admin and customer apps must never appear in iframes. DENY is stronger than SAMEORIGIN and appropriate for these dashboard applications.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `apps/admin/next.config.mjs` contains `Strict-Transport-Security`: confirmed
- `apps/customer/next.config.mjs` contains `Strict-Transport-Security`: confirmed
- `apps/hub/next.config.mjs` contains `Strict-Transport-Security`: confirmed
- `apps/redirect/src/worker.ts` contains `SECURITY_HEADERS` constant and `withSecurityHeaders` applied to all response paths: confirmed
- No `Response.redirect()` calls remain in `worker.ts`: confirmed
- `packages/redis/src/client.ts` contains `rediss://` TLS guard: confirmed
- Commit `9e16cf8`: verified in git log
- Commit `333a202`: verified in git log
