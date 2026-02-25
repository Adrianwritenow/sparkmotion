# Technology Stack

**Analysis Date:** 2026-01-28

## Languages

**Primary:**
- TypeScript 5.7.0 - All application code, strict mode enabled

**Secondary:**
- JavaScript - Build and configuration files (optional fallback)

## Runtime

**Environment:**
- Node.js >=20 - Required runtime version

**Package Manager:**
- pnpm 9.15.0 - Monorepo package management with workspace support
- Lockfile: `pnpm-lock.yaml` (managed automatically)

## Frameworks

**Core:**
- Next.js 14.2.0 - React framework for all three apps (admin, customer, hub)
  - App Router - Used for file-based routing
  - Server Components - Default pattern
  - Edge Runtime - Configured for critical hub app

**API:**
- tRPC 10.45.0 - Type-safe RPC layer
  - `@trpc/server` - Backend procedures and routers
  - `@trpc/client` - Frontend client library
  - `@trpc/react-query` - React hooks integration
  - `@trpc/next` - Next.js adapter
  - superjson 2.2.0 - Serialization for Date/complex types

**Database:**
- Prisma 6.2.0 - ORM and schema management
  - PostgreSQL provider configured
  - Prisma Client 6.2.0 - Runtime client
  - Prisma Studio - Development admin UI

**Caching & Real-time:**
- Redis via ioredis 5.4.0 - Cache layer
  - Client library: `packages/redis/src/client.ts`
  - Custom wrapper package: `@sparkmotion/redis`

**UI & Styling:**
- React 18.3.0 (admin/customer), 19.0.0 (ui package) - Component library
- React DOM 18.3.0 / 19.0.0 - DOM rendering
- Tailwind CSS 3.4.0 - Utility-first CSS framework
- PostCSS 8 - CSS transformation
- Autoprefixer 10 - Vendor prefixing

**Data Validation:**
- Zod 3.24.0 - Schema validation for tRPC inputs and runtime type checking

**State Management:**
- TanStack React Query 4.36.0 - Server state synchronization with tRPC

## Key Dependencies

**Critical:**
- `@prisma/client` 6.2.0 - Database operations, critical for all queries
- `ioredis` 5.4.0 - Redis connection, required for cache layer and <50ms latency target
- `@trpc/server` 10.45.0 - Backend RPC layer, handles all API operations
- `zod` 3.24.0 - Input validation for all tRPC procedures

**Infrastructure:**
- `@tanstack/react-query` 4.36.0 - Client-side data fetching and caching
- `superjson` 2.2.0 - Date serialization across tRPC boundary
- `turbo` 2.3.0 - Monorepo build orchestration and task caching

**Development:**
- TypeScript 5.7.0 - Strict type checking with `noUncheckedIndexedAccess` enabled
- `@types/node` 20 - Node.js type definitions
- `@types/react` 18/19 - React type definitions
- `@types/react-dom` 18/19 - React DOM type definitions

## Configuration

**Environment:**
- `.env` file required at monorepo root
- Environment variables loaded by Next.js automatically in apps
- Required variables:
  - `DATABASE_URL` - PostgreSQL connection string
  - `REDIS_URL` - Redis connection string
  - `NEXTAUTH_SECRET` - Authentication secret (stub, not yet wired)
  - `NEXTAUTH_URL` - OAuth callback URL

**Build:**
- `turbo.json` - Task definitions for build, dev, lint, and generate scripts
- `tsconfig.json` (root) - Shared TypeScript configuration (strict: true)
- `tsconfig.json` (each workspace) - Workspace-specific extensions
- `next.config.ts` (apps) - transpilePackages configured per app

**Monorepo Structure:**
- Turborepo with pnpm workspaces
- Three applications: `admin` (port 3000), `customer` (port 3001), `hub` (port 3002)
- Four shared packages: `api`, `database`, `redis`, `ui`

## Platform Requirements

**Development:**
- Node.js >=20 (enforced in root package.json)
- pnpm 9.15.0 (enforced via packageManager field)
- PostgreSQL database (local or remote)
- Redis instance (local or remote)

**Production:**
- Node.js >=20
- PostgreSQL database (managed service recommended)
- Redis (managed service recommended)
- Next.js deployment platform (Vercel, AWS Lambda, etc.)
  - Hub app runs on Node.js runtime (requires DB/Redis access)
  - Other apps can use edge runtime for reduced latency

## Compilation & Output

**TypeScript Compilation:**
- Target: ES2022
- Module: ESNext
- Transpilation: Each app uses Turbo and Next.js built-in transpilers
- transpilePackages configured in next.config.ts for shared packages

**Build Output:**
- `.next/` directories for each app (excludes cache via Turbo)
- Type definitions published from package sources (src/index.ts)

---

*Stack analysis: 2026-01-28*
