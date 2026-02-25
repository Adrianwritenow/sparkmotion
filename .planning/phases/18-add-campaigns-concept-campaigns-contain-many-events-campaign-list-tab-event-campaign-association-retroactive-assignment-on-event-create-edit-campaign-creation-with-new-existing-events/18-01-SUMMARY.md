---
phase: 18-campaigns
plan: 01
subsystem: campaigns-foundation
tags: [data-model, api, navigation, prisma, trpc]
dependency_graph:
  requires: []
  provides: [campaign-model, campaign-api, campaigns-nav]
  affects: [event-model]
tech_stack:
  added: [Campaign model, CampaignStatus enum, campaigns tRPC router]
  patterns: [nullable FK, onDelete SetNull, transaction-based associations, org-scoped CRUD]
key_files:
  created:
    - packages/api/src/routers/campaigns.ts
  modified:
    - packages/database/prisma/schema.prisma
    - packages/api/src/root.ts
    - apps/admin/src/components/layout/sidebar.tsx
    - apps/customer/src/components/layout/sidebar.tsx
decisions:
  - Campaign.slug is unique (global uniqueness)
  - Event.campaignId is nullable with onDelete SetNull (events survive campaign deletion)
  - Campaign creation supports immediate event association via eventIds array
  - CUSTOMER role enforces org ownership checks on update/delete
  - Megaphone icon chosen for campaigns navigation
metrics:
  duration: 201 seconds (3 minutes)
  completed: 2026-02-10T18:37:04Z
  tasks: 3
  commits: 3
---

# Phase 18 Plan 01: Campaign Foundation Summary

**One-liner:** Campaign data model with nullable event FK, full CRUD tRPC router with org-scoped access, and navigation links in both admin and customer sidebars.

## What Was Built

### Data Layer
- **Campaign Model:** Added to Prisma schema with id, orgId, name, slug (unique), status (enum), startDate, endDate, timestamps
- **CampaignStatus Enum:** DRAFT, ACTIVE, COMPLETED states
- **Event.campaignId:** Nullable FK with onDelete:SetNull (events survive campaign deletion)
- **Relations:** Campaign → Organization (required), Campaign → Events (one-to-many)
- **Indexes:** orgId, slug (unique), status, campaignId on Event

### API Layer
- **campaigns.list:** Org-scoped query with event counts (Admin sees all, Customer sees org only)
- **campaigns.byId:** Detailed campaign with nested events (includes band counts per event)
- **campaigns.create:** Transaction-based creation with optional event association via eventIds array
- **campaigns.update:** Partial updates with org ownership validation for CUSTOMER role
- **campaigns.delete:** Soft cleanup (onDelete:SetNull handles Event.campaignId automatically)

### UI Layer
- **Admin Sidebar:** Added Campaigns nav item after Events (Dashboard → Organizations → Events → Campaigns)
- **Customer Sidebar:** Added Campaigns nav item after Events (Dashboard → Events → Campaigns)
- **Icon:** Megaphone from lucide-react
- **Note:** Navigation links to /campaigns route (pages will be created in Plans 02/04)

## Architecture Decisions

### 1. Nullable Campaign Association
**Decision:** Event.campaignId is nullable with onDelete:SetNull
**Rationale:** Events are primary entities and should survive campaign deletion. Campaigns are organizational containers, not lifecycle owners.
**Impact:** Event forms don't require campaign selection. Campaigns can be deleted without cascading event deletion.

### 2. Transaction-Based Event Association
**Decision:** campaigns.create accepts optional eventIds array, uses $transaction to atomically create campaign and associate events
**Rationale:** Allows creating a campaign and immediately associating existing events in a single API call. Prevents partial state (campaign exists but events not associated).
**Impact:** Campaign creation forms can support "add existing events" flow in one submission.

### 3. Org-Scoped Authorization
**Decision:** CUSTOMER role automatically filters by ctx.user.orgId in list/byId, validates ownership on update/delete
**Rationale:** Follows existing pattern from events router. Prevents cross-org data leakage.
**Impact:** Customer users cannot see or modify campaigns from other organizations.

### 4. Global Slug Uniqueness
**Decision:** Campaign.slug has @unique constraint (not scoped to orgId)
**Rationale:** Simplifies URL routing and prevents slug collisions across system. Matches Event.slug pattern.
**Impact:** Slug generation must ensure global uniqueness (could add org prefix in future if needed).

## Deviations from Plan

None. Plan executed exactly as written.

## Verification Results

### Prisma Client Generation
```bash
$ pnpm --filter database push
✔ Database schema pushed successfully
✔ Generated Prisma Client (v6.19.2)

$ grep "CampaignStatus" packages/database/generated/client/index.d.ts
export const CampaignStatus: {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED'
}
```

### TypeScript Compilation
```bash
$ cd packages/api && pnpm tsc --noEmit
# No errors (exit 0)
```

### File Structure
```
packages/
  database/
    prisma/schema.prisma ← Campaign model, CampaignStatus enum, Event.campaignId
  api/
    src/
      routers/campaigns.ts ← NEW (118 lines, full CRUD)
      root.ts ← campaigns: campaignsRouter registered
apps/
  admin/src/components/layout/sidebar.tsx ← Campaigns nav added
  customer/src/components/layout/sidebar.tsx ← Campaigns nav added
```

## Task Breakdown

### Task 1: Add Campaign Model and Event FK to Prisma Schema
**Commit:** 48dba67
**Files:** packages/database/prisma/schema.prisma
**Changes:**
- Added CampaignStatus enum (DRAFT, ACTIVE, COMPLETED)
- Added Campaign model with 9 fields, 2 relations, 3 indexes
- Added campaignId nullable FK to Event with onDelete:SetNull
- Added campaigns relation field to Organization
- Pushed schema to database (Neon PostgreSQL)
- Regenerated Prisma client

### Task 2: Create Campaigns tRPC Router with Full CRUD
**Commit:** c453f10
**Files:** packages/api/src/routers/campaigns.ts (NEW), packages/api/src/root.ts
**Changes:**
- Implemented 5 procedures: list, byId, create, update, delete
- Added org-scoped access control (ADMIN vs CUSTOMER roles)
- Implemented transaction-based event association in create
- Added ownership validation in update/delete for CUSTOMER role
- Registered campaigns router in root appRouter

### Task 3: Add Campaigns Navigation to Both App Sidebars
**Commit:** 6bf0d47
**Files:** apps/admin/src/components/layout/sidebar.tsx, apps/customer/src/components/layout/sidebar.tsx
**Changes:**
- Imported Megaphone icon from lucide-react in both files
- Added Campaigns nav item after Events in admin sidebar
- Added Campaigns nav item after Events in customer sidebar
- Navigation order: Dashboard, [Organizations (admin only)], Events, Campaigns

## Success Criteria Validation

- [x] Campaign model in Prisma schema with correct fields, relations, and indexes
- [x] CampaignStatus enum (DRAFT, ACTIVE, COMPLETED)
- [x] Event.campaignId nullable FK with onDelete:SetNull and index
- [x] campaigns tRPC router with list, byId, create, update, delete
- [x] Root router registers campaigns namespace
- [x] Both app sidebars show Campaigns navigation with Megaphone icon

## Self-Check

**Created files:**
```bash
$ [ -f "packages/api/src/routers/campaigns.ts" ] && echo "FOUND" || echo "MISSING"
FOUND
```

**Modified files:**
```bash
$ grep -q "model Campaign" packages/database/prisma/schema.prisma && echo "FOUND: Campaign model"
FOUND: Campaign model

$ grep -q "campaigns: campaignsRouter" packages/api/src/root.ts && echo "FOUND: campaigns router"
FOUND: campaigns router

$ grep -q "Megaphone" apps/admin/src/components/layout/sidebar.tsx && echo "FOUND: admin nav"
FOUND: admin nav

$ grep -q "Megaphone" apps/customer/src/components/layout/sidebar.tsx && echo "FOUND: customer nav"
FOUND: customer nav
```

**Commits:**
```bash
$ git log --oneline | head -3
6bf0d47 feat(18-01): add Campaigns navigation to both app sidebars
c453f10 feat(18-01): create campaigns tRPC router with full CRUD
48dba67 feat(18-01): add Campaign model and Event.campaignId FK
```

## Self-Check: PASSED

All artifacts created, all commits present, no missing files.

## Next Steps (Plan 02/04)

**Admin App (Plan 02):**
- Create /campaigns page with campaign list (table/cards)
- Create /campaigns/[id] detail page with events tab
- Create /campaigns/new and /campaigns/[id]/edit forms
- Implement campaign-event association UI

**Customer App (Plan 04):**
- Mirror admin campaign pages for customer role
- Org-scoped campaign list (no org filter UI)
- Event form dropdown for campaign selection

**Dependencies:**
- This plan provides: campaign-model, campaign-api, campaigns-nav
- Plan 02 requires: campaign-api (✓), campaigns-nav (✓)
- Plan 03 requires: campaign-model (✓)
- Plan 04 requires: campaign-api (✓), campaigns-nav (✓)

## Technical Notes

### Prisma Client Generation
The Prisma push command automatically regenerates the client after schema changes. No separate `pnpm generate` needed unless schema changed without push.

### tRPC Router Pattern
The campaigns router follows the exact pattern from events router:
- protectedProcedure for all operations (requires authentication)
- Role-based access control (ADMIN vs CUSTOMER)
- Org-scoped queries and ownership validation
- Include strategies for nested data (org, events, _count)

### Navigation Pattern
Both sidebars use the same NavItem component with gradient highlighting for active routes. The /campaigns route will 404 until Plan 02/04 creates the pages.

### Campaign-Event Relationship
The nullable FK pattern (Event.campaignId) with onDelete:SetNull means:
1. Events can exist without campaigns
2. Deleting a campaign sets Event.campaignId to null (doesn't delete events)
3. Event forms can optionally select a campaign
4. Campaign forms can associate existing events on creation

This provides flexibility for incremental campaign adoption.
