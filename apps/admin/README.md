# Admin Dashboard

Internal admin dashboard for managing all organizations, events, campaigns, and users. Requires `ADMIN` role.

- **Port:** 3000
- **Production:** admin.sparkmotion.net

## Environment Variables

Shared (set in root `.env`):

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `AUTH_SECRET` | NextAuth secret |

Admin-specific (set in `.env.local`):

| Variable | Description |
|----------|-------------|
| `AUTH_URL` | This app's public URL (`http://localhost:3000` locally) |
| `AUTH_COOKIE_PREFIX` | Session cookie prefix (`admin-auth`) |
| `NEXT_PUBLIC_NFC_BASE_URL` | Hub URL for NFC test links (`localhost:3002`) |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Maps API key for venue autocomplete |

## Routes

| Path | Description |
|------|-------------|
| `/` | Dashboard home |
| `/organizations` | All organizations list |
| `/organizations/[id]` | Organization detail |
| `/events` | All events list |
| `/events/[id]` | Event detail |
| `/events/[id]/windows` | Event window (PRE/LIVE/POST) management |
| `/campaigns` | All campaigns list |
| `/campaigns/[id]` | Campaign detail |
| `/analytics` | Cross-org analytics |
| `/users` | User management |
| `/usage` | Infrastructure/cost usage |
| `/settings` | App settings |
| `/profile` | User profile |
| `/auth/signin` | Login page |

## Important Files

| File | Purpose |
|------|---------|
| `src/app/layout.tsx` | Root layout (TRPCProvider, SessionProvider, ThemeProvider) |
| `src/app/providers.tsx` | Client providers (SessionProvider + ThemeProvider) |
| `src/app/(dashboard)/layout.tsx` | Dashboard layout with sidebar + mobile header |
| `src/app/api/auth/[...nextauth]/route.ts` | NextAuth handler |
| `src/app/api/auth/cross-login/route.ts` | Accepts transfer tokens from customer app |
| `src/app/api/trpc/[trpc]/route.ts` | tRPC handler (`maxDuration=60`) |
| `src/middleware.ts` | Auth guard (redirects non-ADMIN users) |

## Auth

This app is the **auth host**. The customer app delegates authentication here via `AUTH_REMOTE_URL`.

**Cross-login flow:** When an ADMIN user logs into the customer app, the customer app generates a short-lived JWT and redirects to `/api/auth/cross-login` on this app, which mints a full session and redirects to `/`.
