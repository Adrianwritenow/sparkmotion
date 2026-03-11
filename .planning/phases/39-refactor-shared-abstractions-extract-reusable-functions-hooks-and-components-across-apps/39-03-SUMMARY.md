---
phase: 39-refactor-shared-abstractions
plan: 03
subsystem: ui
tags: [react, nextjs, sidebar, layout, navigation, next-themes, shadcn]

requires:
  - phase: 20-mobile-responsive-ui
    provides: "Original admin/customer sidebar with collapse/expand, Sheet drawer, tablet icon-rail, mobile header"

provides:
  - "Config-driven Sidebar in packages/ui/layout accepting navItems: NavItem[] and user/onSignOut props"
  - "Shared MobileHeader in packages/ui/layout accepting navItems/user/onSignOut props"
  - "NavItem and SidebarUser type exports from @sparkmotion/ui/layout"
  - "DashboardShell client component in each app (owns tRPC flaggedCount query and navItems config)"
  - "Deleted local sidebar, mobile-header, sort-row copies from both apps"

affects:
  - "apps/admin layout"
  - "apps/customer layout"
  - "packages/ui"

tech-stack:
  added:
    - "next-themes added as packages/ui dependency (required by shared Sidebar)"
  patterns:
    - "Config-driven nav: app layouts define navItems array, shared Sidebar renders it"
    - "Client boundary pattern: DashboardShell client component wraps server layout to isolate tRPC hooks"
    - "Prop-based user data: Sidebar accepts user?: SidebarUser instead of calling useSession() internally"

key-files:
  created:
    - "packages/ui/src/components/layout/sidebar.tsx"
    - "packages/ui/src/components/layout/mobile-header.tsx"
    - "packages/ui/src/components/layout/index.ts"
    - "apps/admin/src/components/layout/dashboard-shell.tsx"
    - "apps/customer/src/components/layout/dashboard-shell.tsx"
  modified:
    - "apps/admin/src/app/(dashboard)/layout.tsx"
    - "apps/customer/src/app/(dashboard)/layout.tsx"
    - "packages/ui/package.json"

key-decisions:
  - "DashboardShell client component per-app: keeps tRPC flaggedCount query in apps (not packages/ui), shared Sidebar stays pure/config-driven"
  - "Server layout delegates to DashboardShell: avoids adding 'use client' to layout.tsx directly, preserving server component boundary for future RSC use"
  - "next-themes added to packages/ui dependencies (not just peerDependencies) because TypeScript resolution in pnpm monorepo requires explicit declaration when package UI is compiled within app builds"
  - "Sort-row local copies deleted without import updates — both copies were dead code (no consumers found via grep)"

patterns-established:
  - "Layout shell pattern: thin server layout.tsx + client DashboardShell for tRPC + shared UI packages"
  - "NavItem type: { href, label, icon: React.ElementType, showAlert?: boolean } — standardized nav config shape"

requirements-completed: []

duration: 45min
completed: 2026-03-11
---

# Phase 39 Plan 03: Layout Components Extraction Summary

**Config-driven Sidebar and MobileHeader extracted to packages/ui/layout with NavItem[] prop pattern; DashboardShell client wrapper per-app handles flaggedCount tRPC query**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-03-11T19:30:00Z
- **Completed:** 2026-03-11T20:15:00Z
- **Tasks:** 2
- **Files modified:** 12 (5 created, 6 deleted, 1 modified)

## Accomplishments

- Shared `Sidebar` component in packages/ui accepts `navItems: NavItem[]`, `user?: SidebarUser`, and `onSignOut?: () => void` — no tRPC or useSession calls
- Shared `MobileHeader` in packages/ui accepts same props, renders Sheet drawer with Sidebar inside
- Admin `DashboardShell` defines 8 adminNavItems (Dashboard, Organizations, Events, Campaigns, Activity+alert, Users, Usage, Change Log)
- Customer `DashboardShell` defines 4 customerNavItems (Dashboard, Events, Campaigns, Activity+alert)
- Both DashboardShells call `trpc.bands.flaggedCount.useQuery` and inject `showAlert` into Activity nav item
- Deleted 6 local copies: admin/customer sidebar, admin/customer mobile-header, admin/customer sort-row (dead code)

## Task Commits

1. **Task 1: Create config-driven Sidebar and shared MobileHeader** - `52ce5ae` (feat)
2. **Task 2: Update app layouts, delete local copies** - `da92294` (feat)

## Files Created/Modified

- `packages/ui/src/components/layout/sidebar.tsx` - Config-driven Sidebar with navItems/user/onSignOut props
- `packages/ui/src/components/layout/mobile-header.tsx` - Shared MobileHeader using Sheet + Sidebar
- `packages/ui/src/components/layout/index.ts` - Barrel export for layout domain
- `packages/ui/package.json` - Added next-themes dependency, ./layout subpath export
- `apps/admin/src/components/layout/dashboard-shell.tsx` - Admin client shell with flaggedCount + adminNavItems
- `apps/customer/src/components/layout/dashboard-shell.tsx` - Customer client shell with flaggedCount + customerNavItems
- `apps/admin/src/app/(dashboard)/layout.tsx` - Now delegates to DashboardShell
- `apps/customer/src/app/(dashboard)/layout.tsx` - Now delegates to DashboardShell
- Deleted: admin/customer sidebar.tsx, mobile-header.tsx, sort-row.tsx

## Decisions Made

- **DashboardShell per-app:** Keeps tRPC calls in apps where they belong; packages/ui Sidebar stays pure
- **Server layout → client shell boundary:** layout.tsx stays server component, DashboardShell is the client boundary
- **next-themes in dependencies:** pnpm monorepo TypeScript resolution requires it when packages/ui code is compiled in app builds
- **Sort-row dead code deletion:** No importers found in either app; local copies simply deleted

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added next-themes as packages/ui dependency**
- **Found during:** Task 2 (build verification)
- **Issue:** Customer app build failed — `Cannot find module 'next-themes'` when packages/ui sidebar was compiled within app context. next-themes was only in app package.json, not in packages/ui.
- **Fix:** Added `"next-themes": "^0.4.6"` to packages/ui dependencies
- **Files modified:** packages/ui/package.json, pnpm-lock.yaml
- **Verification:** Second build attempt passed next-themes error (other pre-existing errors unmasked)
- **Committed in:** da92294 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking dependency)
**Impact on plan:** Necessary for correct type resolution in monorepo. No scope creep.

## Issues Encountered

**Pre-existing build failures (out of scope):** The customer and admin builds have pre-existing failures from phase 39-01/39-02 commits — components in packages/ui (campaign-form-dialog.tsx, windows-list.tsx) use `@/lib/trpc` app-specific imports that don't resolve from packages/ui context. Additionally admin has missing `html2canvas` types. These were masked by the next-themes error in the first build attempt. Documented in `deferred-items.md` in the phase directory.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Shared layout components ready for use in any future app layout changes
- NavItem type standardized — any new nav item follows `{ href, label, icon, showAlert? }` shape
- Blocker: Pre-existing packages/ui components with `@/lib/trpc` imports break customer/admin builds — should be fixed before deploying

---
*Phase: 39-refactor-shared-abstractions*
*Completed: 2026-03-11*
