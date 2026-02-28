# Milestone v1.4: UI Overhaul — Demo Component Transfer

**Status:** In Progress
**Phases:** 17+
**Total Plans:** 0

## Overview

Transfer the demo UI components, flow, theme, and logo assets from the sparkmotion-components reference project into the production admin and customer apps. Replace existing UI with the demo design while preserving all existing functionality (tRPC procedures, auth, data fetching). Document any implied logic for future phases.

## Phases

### Phase 17: Demo UI Transfer

**Goal:** Transfer components, layout flow, theme configuration, and logo/brand assets from sparkmotion-components (`/Users/adrianrodriguez/Desktop/sparkmotion-components`) into both admin and customer apps, replacing existing UI while keeping all current functionality intact. Document implied logic that will be implemented in a subsequent phase.
**Depends on:** v1.3 complete
**Plans:** 6 plans

Plans:
- [x] 17-01-PLAN.md — Theme infrastructure, branding assets, next-themes setup
- [x] 17-02-PLAN.md — Collapsible sidebar with theme switcher and user profile (both apps)
- [x] 17-03-PLAN.md — Dashboard pages with real data (admin + customer)
- [x] 17-04-PLAN.md — Events list card layout and tabbed event detail pages
- [x] 17-05-PLAN.md — Organizations pages, create event restyle, campaign/settings/profile shells
- [x] 17-06-PLAN.md — Visual verification checkpoint

**Details:**
Source: `/Users/adrianrodriguez/Desktop/sparkmotion-components` — contains demo UI showing desired look and feel.

Scope:
- Transfer component structure and styling
- Apply theme (colors, typography, spacing) to both apps
- Transfer logo and brand assets
- Maintain existing tRPC data fetching, auth, and business logic
- Document any implied logic from the demo that needs separate implementation

Out of scope (future phase):
- New business logic implied by the demo UI
- New API endpoints or data models

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 17. Demo UI Transfer | 6/6 | ✓ Complete | 2026-02-10 |
| 18. Add Campaigns Concept | 4/4 | ✓ Complete | 2026-02-10 |
| 19. Analytics & Card UI Refinements | 5/5 | ✓ Complete | 2026-02-10 |
| 20. Mobile Responsive UI | 3/3 | ✓ Complete | 2026-02-12 |
| 21. Event Window Datetime Range Selector | 3/3 | ✓ Complete | 2026-02-12 |
| 22. Toggleable Schedule Mode | 2/2 | ✓ Complete | 2026-02-12 |
| 23. Granular Event Locations | 5/5 | ✓ Complete | 2026-02-14 |
| 24. Event Band Management Tab | 3/3 | ✓ Complete | 2026-02-14 |
| 25. Band Activity Tab | 3/3 | ✓ Complete | 2026-02-16 |
| 26. Load Tests & Testing Suite | 3/3 | ✓ Complete | 2026-02-23 |
| 27. Dead Code Cleanup | 1/1 | Complete    | 2026-02-24 |

### Phase 18: Add campaigns concept — campaigns contain many events, campaign list tab, event-campaign association, retroactive assignment on event create/edit, campaign creation with new/existing events

**Goal:** Introduce a Campaign entity that groups events. Includes Prisma schema (Campaign model, FK on Event), campaigns tRPC router with full CRUD, campaign list/detail UI in both admin and customer apps, event-campaign association via dropdown on event forms, campaign filter on events list, and campaign info on event cards/detail pages.
**Depends on:** Phase 17
**Plans:** 4 plans

Plans:
- [x] 18-01-PLAN.md — Campaign model, tRPC router, sidebar navigation
- [x] 18-02-PLAN.md — Admin campaign list, detail pages, and creation dialog
- [x] 18-03-PLAN.md — Admin events integration (campaign dropdown, filter, subtitles, links)
- [x] 18-04-PLAN.md — Customer app campaigns and events integration

### Phase 19: Analytics & card UI refinements — engagement percentages, location display on campaign/event cards, event overview location selection, URL manager tab refactor

**Goal:** Refine existing UI to match sparkmotion-components reference: add engagement percentages and location display to event/campaign cards, add location field to Event model with city-level autocomplete on event forms, restyle the URL manager tab to card-based layout with amber fallback section, and add campaign aggregate analytics tab with engagement metrics.
**Depends on:** Phase 18
**Plans:** 5 plans

Plans:
- [x] 19-01-PLAN.md — Schema (Event.location) + tRPC engagement/location data on events and campaigns routers
- [x] 19-02-PLAN.md — Event and campaign cards with engagement % and location display (admin + customer)
- [x] 19-03-PLAN.md — City autocomplete component and location field on event create/edit forms (admin + customer)
- [x] 19-04-PLAN.md — URL manager tab restyling to card-based layout with amber fallback (admin + customer)
- [x] 19-05-PLAN.md — Campaign analytics tab and event analytics engagement rate card (admin + customer)

### Phase 20: Mobile responsive UI — sidebar hamburger toggle, grid/flex column layouts for lists, Tailwind-focused responsive updates preserving desktop implementation

**Goal:** Make admin and customer apps usable on mobile and tablet screens. Add sidebar hamburger drawer (phone), icon-rail sidebar (tablet), responsive grid layouts, table-to-card conversion for mobile, and FAB pattern for create actions. Desktop layout must remain unchanged.
**Depends on:** Phase 19
**Plans:** 3 plans

Plans:
- [x] 20-01-PLAN.md — Admin responsive sidebar (Sheet drawer, icon-rail, mobile header, layout)
- [x] 20-02-PLAN.md — Customer responsive sidebar (Sheet drawer, icon-rail, mobile header, layout)
- [x] 20-03-PLAN.md — Dashboard responsive grids, table-to-card, FAB create actions (both apps)

### Phase 21: Event window datetime range selector with timezone support — UNIX timestamps, non-overlapping validation, admin timezone preference in settings, timezone-aware rendering in both apps

**Goal:** Add datetime range selection to event windows with calendar picker, non-overlapping validation (client + server), explicit event timezone field, per-user timezone preference in settings, and timezone-aware rendering (event timezone primary, user timezone on hover) across both admin and customer apps.
**Depends on:** Phase 20
**Plans:** 3 plans

Plans:
- [x] 21-01-PLAN.md — Schema (Event.timezone, User.timezone), API overlap validation, shared DateTimeDisplay + TimezoneSelector components
- [x] 21-02-PLAN.md — Window form overhaul with calendar range picker, overlap prevention, timezone-aware windows list
- [x] 21-03-PLAN.md — Event timezone field on forms, settings page timezone preference (both apps)

### Phase 22: Toggleable schedule mode for event windows — automatic time-based activation via window datetime ranges and timezone, manual toggle fallback when schedule mode off, one live window per event constraint, admin and customer apps

**Goal:** Add schedule mode toggle to events with automatic window activation/deactivation based on datetime ranges and timezone (cron every minute), manual toggle fallback when schedule mode is off, one-live-window-per-event constraint enforced at all times, and visual feedback (LIVE badge, green dot on event cards, gap state messaging) in both admin and customer apps.
**Depends on:** Phase 21
**Plans:** 2 plans

Plans:
- [x] 22-01-PLAN.md — Schema (Event.scheduleMode), API mutations (toggleScheduleMode, updated window toggle), timezone-aware cron scheduler
- [x] 22-02-PLAN.md — Schedule mode toggle UI, disabled manual switches, LIVE badge, event card live dot (both apps)

### Phase 23: Granular event locations (venue/address), IP-based band-to-event auto-assignment for unassigned bands

**Goal:** Upgrade event locations from city-level strings to full venue/address with coordinates via Google Places API. Implement IP-based band-to-event auto-assignment using MaxMind GeoIP2 and PostgreSQL earthdistance for unknown bands scanned at org subdomains. Add Organization.websiteUrl as fallback redirect. Update all event UI to show formatted addresses and auto-assigned band indicators.
**Depends on:** Phase 22
**Plans:** 5 plans

Plans:
- [x] 23-01-PLAN.md — Schema migration (Event location fields, Band.autoAssigned, Org.websiteUrl, PostgreSQL extensions) + tRPC API updates
- [x] 23-02-PLAN.md — Google Places autocomplete component + event form replacement (both apps)
- [x] 23-03-PLAN.md — GeoIP package + hub redirect route auto-assignment logic
- [x] 23-04-PLAN.md — UI polish: formatted address on cards/detail, auto-assigned badge, websiteUrl on org forms/settings
- [x] 23-05-PLAN.md — Verification checkpoint

### Phase 24: Event band management tab — bands table in event detail, CSV upload for bulk band assignment, band-event association for tap redirect routing

**Goal:** Move band management UI into a Bands tab on event detail pages, change Band schema from globally unique bandId to per-event compound unique [bandId, eventId], remove BandStatus concept entirely, and update hub redirect to route multi-event bands to nearest event via GeoIP earthdistance.
**Depends on:** Phase 23
**Plans:** 3 plans

Plans:
- [x] 24-01-PLAN.md — Schema migration (compound unique, remove BandStatus) + tRPC/Redis updates
- [x] 24-02-PLAN.md — Hub redirect multi-event band routing with GeoIP
- [x] 24-03-PLAN.md — Bands tab UI in event detail, remove status from columns/dialogs, delete standalone bands route

### Phase 25: Band Activity Tab — live scan tracking, time-based filters, band reassignment, NFC scan-to-register dialog, organizer metadata tags

**Goal:** Add band activity feed with live scan tracking and time-based filters, wire up missing backend procedures (listAll, bulkReassign), implement tag system (BandTag model, admin CRUD, colored badges), NFC scan-to-register dialog with manual fallback, and press-and-hold reassignment confirmation — all in both admin and customer apps.
**Depends on:** Phase 24
**Plans:** 3/3 plans complete

Plans:
- [x] 25-01-PLAN.md — Schema (BandTag model, Band name/email/tagId) + tags CRUD router + bands router additions (listAll, bulkReassign, activityFeed, register)
- [x] 25-02-PLAN.md — Activity feed UI with time filters and polling, tag badges, tabbed /bands page (both apps)
- [x] 25-03-PLAN.md — NFC scan-to-register dialog, admin tag management UI, press-and-hold reassign confirmation (both apps)

### Phase 26: Update load tests and add core functionality testing suite

**Goal:** Consolidate k6 load tests for 5K RPS with arrival-rate executors, bootstrap Vitest unit test suite for all 9 tRPC routers (happy-path CRUD + auth enforcement), and add GitHub Actions CI workflow.
**Depends on:** Phase 25
**Plans:** 3/3 plans complete

Plans:
- [x] 26-01-PLAN.md — k6 load test consolidation + Vitest infrastructure setup (config, test-utils, turbo pipeline)
- [x] 26-02-PLAN.md — Router tests: events, bands, campaigns, organizations
- [x] 26-03-PLAN.md — Router tests: analytics, windows, tags, infrastructure, users + GitHub Actions CI

### Phase 27: Dead Code Cleanup

**Goal:** Remove all orphaned components, procedures, and packages identified in the v1.4 milestone audit. Delete dead `ActivityFeed` component (both apps), orphaned `bands.register` procedure, orphaned `tags.create/update/delete` procedures, dead `CityAutocomplete` components (both apps), and dead `packages/geoip` MaxMind package. Update planning docs to reflect post-phase removals from Phase 25.
**Depends on:** Phase 26
**Gap Closure:** Closes INT-001, INT-002, INT-003, FLOW-001, FLOW-002 from v1.4 audit
**Plans:** 1/1 plans complete

Plans:
- [ ] 27-01-PLAN.md — Delete dead components/procedures, update Phase 25 verification docs

### Phase 28: Seed prod admin account and password reset flow for admins and customers

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 27
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 28 to break down)

### Phase 29: Add user management page for creating/deleting Admins and Customers with email invitations

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 28
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 29 to break down)

### Phase 30: Add analytics tracking for fallback and org URL taps

**Goal:** Track and visualize ALL tap redirect destinations in analytics, not just event window taps. Fix hub route logging gaps for band-bearing redirect paths, add tRPC procedures to derive redirect category (FALLBACK/ORG/DEFAULT) from TapLog.redirectUrl at query time, rename charts to "Taps by Redirect Type" / "Tap Distribution", extend filter dropdown to "All Redirects", and add muted gray tones for non-window categories — across event and campaign analytics in both admin and customer apps.
**Requirements**: [HUB-LOGGING-GAPS, ANALYTICS-REDIRECT-TYPE-PROCEDURES, CHARTS-REDIRECT-TYPE-RENAME, FILTER-DROPDOWN-EXTENSION, MUTED-COLORS-NON-WINDOW, COMPONENT-DUPLICATION-ADMIN-CUSTOMER]
**Depends on:** Phase 29
**Plans:** 2/2 plans complete

Plans:
- [ ] 30-01-PLAN.md — Fix hub route logging gaps + tapsByRedirectType and campaignTapsByRedirectType tRPC procedures + tests
- [ ] 30-02-PLAN.md — Update all 4 analytics components (event+campaign x admin+customer) with renamed charts, extended filters, muted colors

### Phase 31: Comprehensive end-to-end load testing and max capacity assessment

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 30
**Plans:** 3/3 plans complete

Plans:
- [x] TBD (run /gsd:plan-phase 31 to break down) (completed 2026-02-28)

### Phase 32: SOC 2 backend compliance hardening

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 31
**Plans:** 4/4 plans complete

Plans:
- [x] TBD (run /gsd:plan-phase 32 to break down) (completed 2026-02-28)

### Phase 33: Build audit logging UI page for SOC2 compliance

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 32
**Plans:** 2/2 plans complete

Plans:
- [x] TBD (run /gsd:plan-phase 33 to break down) (completed 2026-02-28)

### Phase 34: Add soft delete capabilities for Campaigns/Events/Organizations/Bands with restore, SOC2-compliant cron cleanup, and trash UI

**Goal:** Add soft delete with restore UI across all 4 entity types. Backend complete (schema, procedures, cron). Remaining: admin trash UI (4 sheets) and customer trash UI (3 sheets).
**Requirements**: TBD
**Depends on:** Phase 33
**Plans:** 1/2 plans executed

Plans:
- [x] 34-01-PLAN.md — Schema + tRPC procedures + cron purge (COMPLETE — commit f609dc2)
- [ ] 34-02-PLAN.md — Admin trash UI (4 sheets: events/campaigns/orgs/bands + Trash2 badges + sonner toasts + restoreAll for campaigns/orgs)
- [ ] 34-03-PLAN.md — Customer trash UI (3 sheets: events/campaigns/bands — org-scoped, no orgs trash)

---

_For project context, see .planning/PROJECT.md_
