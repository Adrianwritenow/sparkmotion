# SOC 2 REPORT

SOC 2 Readiness — SparkMotion
Updated: 2026-02-28 (after Phase 32 compliance hardening)

  What You're Doing Well

  ┌──────────────────────────┬───────────────────────────────────────────────────────────────────────────────────────────────┐
  │           Area           │                                           Details                                            │
  ├──────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Password Security        │ bcrypt (cost 12), strong password policy, SHA-256 hashed reset tokens                        │
  ├──────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Brute-Force Protection   │ 5 failed logins → 15min lockout, 3 reset requests/hr                                        │
  ├──────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
  │ RBAC                     │ ADMIN/CUSTOMER roles enforced at tRPC middleware + app middleware                             │
  ├──────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SQL Injection            │ All queries use Prisma ORM or Prisma.sql parameterized templates                             │
  ├──────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
  │ XSS Prevention           │ React auto-escaping, no dangerouslySetInnerHTML                                              │
  ├──────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Secrets Management       │ All secrets in env vars, .env in .gitignore, no hardcoded keys                               │
  ├──────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Session Security         │ JWT + httpOnly cookies + SameSite=Lax + CSRF tokens                                          │
  ├──────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
  │ CI Lockfile              │ --frozen-lockfile prevents dependency drift                                                   │
  ├──────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
  │ HTTPS                    │ Cloudflare + Vercel enforce TLS by default                                                   │
  ├──────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Audit Logging            │ AuditLog model — tRPC middleware auto-logs all mutations + auth events (login/failure/lockout)│
  ├──────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Data Retention           │ 90-day TapLog TTL, pre-aggregation into AnalyticsSummary, expired token cleanup (daily cron)  │
  ├──────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Security Headers         │ HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, X-XSS-Protection on all apps │
  ├──────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Dependency Scanning      │ pnpm audit (high/critical) in CI, Dependabot weekly PRs, CodeQL static analysis              │
  ├──────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Secret Scanning          │ GitHub secret scanning + push protection enabled on repository                               │
  ├──────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Redis TLS Guard          │ Production warning if REDIS_URL is not using rediss:// (TLS)                                 │
  └──────────────────────────┴───────────────────────────────────────────────────────────────────────────────────────────────┘

  Resolved Gaps (Phase 32)

  ┌───────────────────────────┬────────────────────────────────────────────────────────────┬──────────┬──────────┐
  │         Former Gap        │                       How It Was Fixed                     │ Severity │  Status  │
  ├───────────────────────────┼────────────────────────────────────────────────────────────┼──────────┼──────────┤
  │ No audit logging          │ AuditLog model + tRPC middleware on all mutations + auth   │ CRITICAL │ RESOLVED │
  │                           │ event logging (login success/failure/lockout). Fire-and-   │          │          │
  │                           │ forget — never blocks responses.                           │          │          │
  ├───────────────────────────┼────────────────────────────────────────────────────────────┼──────────┼──────────┤
  │ No data retention policy  │ Daily cron aggregates TapLogs >90 days into                │ CRITICAL │ RESOLVED │
  │                           │ AnalyticsSummary, deletes raw records, cleans expired      │          │          │
  │                           │ password reset tokens. Runs 3 AM UTC.                      │          │          │
  ├───────────────────────────┼────────────────────────────────────────────────────────────┼──────────┼──────────┤
  │ No security headers       │ HSTS, X-Content-Type-Options, X-Frame-Options,             │ HIGH     │ RESOLVED │
  │                           │ Referrer-Policy, X-XSS-Protection on all 3 Next.js apps    │          │          │
  │                           │ + Cloudflare Worker. Production-only.                      │          │          │
  ├───────────────────────────┼────────────────────────────────────────────────────────────┼──────────┼──────────┤
  │ No dependency scanning    │ pnpm audit --audit-level=high in CI (blocks build),        │ HIGH     │ RESOLVED │
  │                           │ Dependabot weekly PRs, CodeQL TypeScript analysis on       │          │          │
  │                           │ push/PR/weekly. Secret scanning + push protection enabled. │          │          │
  ├───────────────────────────┼────────────────────────────────────────────────────────────┼──────────┼──────────┤
  │ Redis TLS not explicit    │ Production guard warns if REDIS_URL is not rediss://       │ MEDIUM   │ RESOLVED │
  └───────────────────────────┴────────────────────────────────────────────────────────────┴──────────┴──────────┘

  Remaining Gaps

  ┌───────────────────────────┬────────────────────────────────────────────────────────────┬──────────┐
  │            Gap            │                        SOC 2 Impact                        │ Severity │
  ├───────────────────────────┼────────────────────────────────────────────────────────────┼──────────┤
  │ No MFA/2FA                │ Single-factor auth for admin accounts                      │ HIGH     │
  ├───────────────────────────┼────────────────────────────────────────────────────────────┼──────────┤
  │ No structured logging     │ console.log only, no centralized log aggregation           │ HIGH     │
  ├───────────────────────────┼────────────────────────────────────────────────────────────┼──────────┤
  │ No incident response plan │ No documented breach procedures                            │ HIGH     │
  ├───────────────────────────┼────────────────────────────────────────────────────────────┼──────────┤
  │ No rate limiting on API   │ tRPC endpoints have no per-user throttling                 │ MEDIUM   │
  ├───────────────────────────┼────────────────────────────────────────────────────────────┼──────────┤
  │ No soft-deletes           │ Hard deletes with no recovery, no deletion audit trail     │ MEDIUM   │
  └───────────────────────────┴────────────────────────────────────────────────────────────┴──────────┘

  Bottom Line

  SparkMotion has made significant SOC 2 progress. The two CRITICAL gaps (audit logging and data retention) are now resolved.
  5 of 10 original gaps have been closed. Auth, input validation, code security, audit trails, data retention, security headers,
  and dependency scanning are all in place.

  Remaining work is operational infrastructure: MFA for admin accounts, centralized logging, incident response documentation,
  API rate limiting, and soft-delete patterns. None of these are blockers for launch — they are post-launch SOC 2 certification
  preparation items.