# Customer Dashboard

Org-scoped dashboard for customers to manage their events, campaigns, and analytics. Requires `CUSTOMER` role.

- **Port:** 3001
- **Production:** app.sparkmotion.net

## Environment Variables

Shared (set in root `.env`):

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `AUTH_SECRET` | NextAuth secret |

Customer-specific (set in `.env.local`):

| Variable | Description |
|----------|-------------|
| `AUTH_REMOTE_URL` | Admin app URL for auth delegation (`http://localhost:3000`) |
| `AUTH_COOKIE_PREFIX` | Session cookie prefix (`customer-auth`) |
| `NEXT_PUBLIC_ADMIN_URL` | Admin app URL for cross-login redirect (`http://localhost:3000`) |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Maps API key for venue autocomplete |

## Routes

| Path | Description |
|------|-------------|
| `/` | Dashboard home (org-scoped) |
| `/events` | Org events list |
| `/events/[id]` | Event detail |
| `/events/[id]/windows` | Event window management |
| `/campaigns` | Org campaigns list |
| `/campaigns/[id]` | Campaign detail |
| `/analytics` | Org analytics |
| `/settings` | Org settings |
| `/profile` | User profile |
| `/auth/signin` | Login page |

## Important Files

| File | Purpose |
|------|---------|
| `src/app/layout.tsx` | Root layout (TRPCProvider, SessionProvider, ThemeProvider) |
| `src/app/providers.tsx` | Client providers (SessionProvider + ThemeProvider) |
| `src/app/(dashboard)/layout.tsx` | Dashboard layout with sidebar + mobile header |
| `src/app/api/auth/[...nextauth]/route.ts` | NextAuth handler |
| `src/app/api/auth/transfer-token/route.ts` | Generates JWT for cross-login to admin app |
| `src/app/api/trpc/[trpc]/route.ts` | tRPC handler (`maxDuration=60`) |
| `src/middleware.ts` | Auth guard (redirects non-CUSTOMER users to admin) |

## Auth

This app **delegates** authentication to the admin app via `AUTH_REMOTE_URL`.

**Cross-login flow:** When an ADMIN user signs into this app, the sign-in page detects the ADMIN role and redirects to `/api/auth/transfer-token`, which generates a 30-second JWT, deletes the local session cookies, and redirects to the admin app's `/api/auth/cross-login?token=...`.
