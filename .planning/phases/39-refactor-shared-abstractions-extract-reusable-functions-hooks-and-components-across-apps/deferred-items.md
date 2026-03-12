# Deferred Items (Out of Scope for 39-03)

## Pre-existing Build Failures (from 39-01, 39-02 commits)

These errors were present before plan 39-03 executed and are NOT caused by 39-03 changes.

### 1. packages/ui/src/components/campaigns/campaign-form-dialog.tsx
- Uses `import { trpc } from "@/lib/trpc"` — app-specific path alias doesn't resolve in packages/ui context
- Exposed when `./events` and `./campaigns` subpath exports were added to packages/ui/package.json (39-01/39-02 commits)

### 2. packages/ui/src/components/events/windows-list.tsx
- Uses `import { trpc } from "@/lib/trpc"` — same issue
- Cannot resolve app-specific alias from packages/ui

### 3. Admin app: missing `html2canvas` type declarations
- Pre-existing in admin app, not related to layout refactor

These need to be fixed in a dedicated cleanup plan — likely removing `@/lib/trpc` references from packages/ui components and replacing with prop-based patterns.
