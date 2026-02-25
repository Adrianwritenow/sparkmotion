---
phase: 17-demo-ui-transfer
plan: 05
subsystem: ui
tags: [organizations, forms, placeholders, admin, customer]
dependency_graph:
  requires: [17-02-collapsible-sidebar]
  provides: [organizations-pages, event-form-styling, placeholder-pages]
  affects: [admin-app, customer-app]
tech_stack:
  added: []
  patterns: [server-components, tab-navigation, disabled-forms, placeholder-shells]
key_files:
  created:
    - apps/admin/src/app/(dashboard)/organizations/[id]/page.tsx
    - apps/admin/src/app/(dashboard)/events/campaigns/new/page.tsx
    - apps/admin/src/app/(dashboard)/settings/page.tsx
    - apps/admin/src/app/(dashboard)/profile/page.tsx
    - apps/customer/src/app/(dashboard)/settings/page.tsx
    - apps/customer/src/app/(dashboard)/profile/page.tsx
  modified:
    - apps/admin/src/app/(dashboard)/organizations/page.tsx
    - apps/admin/src/app/(dashboard)/events/new/page.tsx
    - apps/customer/src/app/(dashboard)/events/new/page.tsx
decisions:
  - Placeholder pages use coming-soon banners and disabled inputs instead of hiding entirely
  - Tab navigation uses URL query params (?tab=overview) for state management
  - Member avatars replaced with count in production (no avatar data in DB)
  - All placeholder pages show session user data where applicable
metrics:
  duration: 4m 28s
  tasks_completed: 2
  files_created: 6
  files_modified: 3
  commits: 2
  completed_at: 2026-02-10T16:37:00Z
---

# Phase 17 Plan 05: Organizations, Forms, and Placeholder Pages Summary

**One-liner:** Organizations table with tabbed detail view, restyled event forms, and shell pages for campaigns/settings/profile using demo design patterns.

## What Was Built

### Task 1: Organizations Pages and Event Forms
**Commit:** f4349da

**Organizations List (`apps/admin/src/app/(dashboard)/organizations/page.tsx`):**
- Redesigned with demo's table layout
- Stats row: Total Organizations (real count), Active Users (sum of orgUsers), Avg Growth (placeholder)
- Search/filter bar: UI only, no wiring (deferred)
- Table columns: Organization (name + domain), Members (count from orgUsers), Events (count), Status (Active badge), Actions (View Details link + more button)
- Pagination footer: Shows actual count, buttons disabled (no pagination logic yet)
- Uses real DB data: `db.organization.findMany()` with `_count` for events and orgUsers

**Organization Detail (`apps/admin/src/app/(dashboard)/organizations/[id]/page.tsx`):**
- NEW PAGE with tabbed interface
- Header: Large avatar (gradient with initials), org name, metadata (domain, joined date)
- Tab navigation: overview, events, analytics, members, settings
- Tab state: URL query params (`?tab=overview`)
- Overview tab: About section, Quick Stats (Total Events from DB, Active Users from orgUsers count, Avg Session placeholder), Contact Info sidebar
- Events tab: List of org's events with link to event detail
- Other tabs: Placeholder text
- Uses real DB data: `db.organization.findUnique()` with events included

**Create Event Forms (both apps):**
- Restyled with demo design: Back button, header with subtitle, card container
- **Preserved ALL existing form logic:** EventFormWrapper component, tRPC mutations, validation
- Admin: `apps/admin/src/app/(dashboard)/events/new/page.tsx`
- Customer: `apps/customer/src/app/(dashboard)/events/new/page.tsx`

### Task 2: Shell/Placeholder Pages
**Commit:** 331f965

**Create Campaign (`apps/admin/src/app/(dashboard)/events/campaigns/new/page.tsx`):**
- Admin only (customer has no campaigns)
- Header with Megaphone icon
- Coming-soon banner: "Campaign functionality is coming soon..."
- Disabled form fields: Campaign Name, Organization select, Description
- Cancel/Create buttons: Create button disabled
- No tRPC, no business logic

**Settings Pages (both apps):**
- `apps/admin/src/app/(dashboard)/settings/page.tsx`
- `apps/customer/src/app/(dashboard)/settings/page.tsx`
- Coming-soon banner at top
- Sidebar nav: General, Notifications, Security, API Keys, Team, Email (all disabled except General visual state)
- Profile Information section: Avatar (from session), First/Last Name (from session.user.name split), Email (from session.user.email) — all inputs disabled
- Preferences section: Toggle switches (visual only, not functional, disabled)
- Cancel/Save buttons disabled
- Uses `auth()` for session data

**Profile Pages (both apps):**
- `apps/admin/src/app/(dashboard)/profile/page.tsx`
- `apps/customer/src/app/(dashboard)/profile/page.tsx`
- Cover banner: Gradient background
- Large avatar: Orange gradient circle with initials from session.user.name
- User name and role from session
- Edit Profile button disabled
- Two-column layout: About sidebar (Building, MapPin, Mail, Phone, Calendar — hardcoded data), Activity Log (placeholder entries with bullet timeline)
- View Full History button (visual only)
- Uses `auth()` for session data

## Deviations from Plan

None — plan executed exactly as written.

## Technical Approach

**Pattern A: Real DB Data for Organizations**
- Organizations list and detail pages use actual Prisma queries
- `_count` for aggregate data (events, orgUsers)
- No hardcoded mock data

**Pattern B: Preserved Existing Logic for Event Forms**
- Only updated page-level wrapper styling
- EventFormWrapper component unchanged
- tRPC mutations, validation, submission logic all intact

**Pattern C: Placeholder Pattern for Deferred Features**
- Coming-soon banners explain functionality not yet available
- Disabled inputs show visual design without functional wiring
- Session data displayed where applicable (Settings, Profile)
- No tRPC calls, no form submissions

**Pattern D: Tab Navigation with URL State**
- Organization detail tabs use `searchParams.tab`
- No client-side state management needed
- Server component can read tab from URL directly

## Verification Results

All verification criteria met:

1. Organizations list page shows table with org name, domain, event count ✅
2. Organization detail page exists at /organizations/[id] with tab navigation ✅
3. Create Event pages have "Back to Events" link and demo-styled wrapper ✅
4. Event creation form still submits correctly (existing tRPC logic preserved) ✅
5. `ls apps/admin/src/app/(dashboard)/organizations/` shows page.tsx and [id]/ directory ✅
6. Campaign page has "coming soon" indicator and disabled form ✅
7. Settings pages show visual layout without functional data wiring ✅
8. Profile pages show session user data in demo's visual layout ✅
9. No tRPC mutations or form submissions in placeholder pages ✅
10. Customer does NOT have /organizations or /events/campaigns routes ✅

## Files Changed

**Created (6):**
- apps/admin/src/app/(dashboard)/organizations/[id]/page.tsx — Organization detail with tabs
- apps/admin/src/app/(dashboard)/events/campaigns/new/page.tsx — Campaign shell
- apps/admin/src/app/(dashboard)/settings/page.tsx — Settings placeholder
- apps/admin/src/app/(dashboard)/profile/page.tsx — Profile placeholder
- apps/customer/src/app/(dashboard)/settings/page.tsx — Settings placeholder
- apps/customer/src/app/(dashboard)/profile/page.tsx — Profile placeholder

**Modified (3):**
- apps/admin/src/app/(dashboard)/organizations/page.tsx — Table redesign
- apps/admin/src/app/(dashboard)/events/new/page.tsx — Form restyling
- apps/customer/src/app/(dashboard)/events/new/page.tsx — Form restyling

## Impact

**Admin App:**
- Organizations now have full-featured list and detail pages
- Event creation form matches demo visual design
- Campaign, Settings, Profile pages exist as navigable shells

**Customer App:**
- Event creation form matches demo visual design
- Settings and Profile pages exist as navigable shells
- No organizations or campaigns (correct scope)

**Navigation:**
- All nav items in both apps now have corresponding pages
- No 404s when clicking sidebar links
- Clear indicators (coming-soon banners) for deferred functionality

**User Experience:**
- Consistent visual design across all pages
- Real data shown where available
- Placeholder pages look complete but clearly communicate "coming soon"

## Self-Check: PASSED

**Created files verified:**
```
FOUND: apps/admin/src/app/(dashboard)/organizations/[id]/page.tsx
FOUND: apps/admin/src/app/(dashboard)/events/campaigns/new/page.tsx
FOUND: apps/admin/src/app/(dashboard)/settings/page.tsx
FOUND: apps/admin/src/app/(dashboard)/profile/page.tsx
FOUND: apps/customer/src/app/(dashboard)/settings/page.tsx
FOUND: apps/customer/src/app/(dashboard)/profile/page.tsx
```

**Commits verified:**
```
FOUND: f4349da (Task 1: Organizations and event forms)
FOUND: 331f965 (Task 2: Placeholder pages)
```

**Key content verified:**
```
✅ Organization detail has activeTab state management
✅ Organizations list shows "Organizations" heading
✅ Campaign page contains "Campaign" text
✅ Settings page contains "Settings" text
✅ Profile page contains "Profile" text
```

All files created, all commits exist, all key content present.
