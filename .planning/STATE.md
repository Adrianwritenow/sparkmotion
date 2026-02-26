# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-04)

**Core value:** NFC wristband taps must redirect in <50ms with correct mode-based URL
**Current focus:** v1.4 milestone — UI Overhaul: Demo Component Transfer — In Progress

## Current Position

Phase: 30 — Add analytics tracking for fallback and org URL taps
Plan: 01 (COMPLETE) — hub route logging gaps fixed, tapsByRedirectType and campaignTapsByRedirectType procedures added
Status: Phase 30 IN PROGRESS — plan 01 executed; 2 new logTapAsync calls in hub route, 2 new tRPC procedures, 98 tests pass
Last activity: 2026-02-26 — Phase 30-01 executed: fixed hub route logging gaps (band-no-event + band-no-redirectUrl paths), added tapsByRedirectType and campaignTapsByRedirectType analytics procedures with full test coverage

Progress: (1 plan complete — Phase 30 Plan 01 COMPLETE)

## Performance Metrics

**Velocity:**
- Total plans completed: 51
- v1.0: 7 plans (Phases 1-4)
- v1.1: 6 plans (Phases 5-7)
- v1.2: 7 plans (Phases 8-12)
- v1.3: 4 plans (Phase 14-01, 14-02, 15-01, 15-02) — COMPLETE
- v1.4: 6 plans (Phase 17-01 through 17-06) — COMPLETE
- v1.5: 4 plans (Phase 18-01 through 18-04) — COMPLETE
- v1.6: 5 plans (Phase 19-01 through 19-05) — COMPLETE
- v1.7: 3 plans (Phase 20-01, 20-02, 20-03) — COMPLETE
- v1.8: 3 plans (Phase 21-01, 21-02, 21-03) — COMPLETE
- v1.9: 2 plans (Phase 22-01, 22-02) — COMPLETE
- v2.0: 4 plans (Phase 23-01, 23-02, 23-03, 23-04) — COMPLETE
- v2.1: 3 plans (Phase 24-01, 24-02, 24-03) — COMPLETE

## Accumulated Context

### Decisions

All decisions logged in PROJECT.md Key Decisions table (43 entries).

**Phase 30-01:**
- IS NOT NULL guard required before NULL equality in SQL CASE expressions — NULL=NULL is NULL not TRUE, causing incorrect DEFAULT classification when fallbackUrl/websiteUrl is NULL
- LEFT JOIN EventWindow (not INNER) in redirect type SQL ensures windowId=NULL tap rows are included and classified by URL comparison branches
- logTapAsync only called when band is truthy in no-event path — TapLog.bandId is NOT NULL FK, bandless paths cannot log
- mode logged as activeWindow.windowType.toLowerCase() or "pre" fallback on no-redirectUrl path to reflect actual window state

**Phase 26-03:**
- adminProcedure uses single isAdmin middleware — throws FORBIDDEN for both unauthenticated and non-ADMIN callers (no separate UNAUTHORIZED guard)
- CI uses pnpm/action-setup@v4 without explicit version — reads packageManager: pnpm@9.15.0 from root package.json
- Analytics tests scoped per RESEARCH.md Pitfall 3 — auth enforcement + 2 happy paths only, not exhaustive SQL variant testing
- vi.mock redis shape must match what each router actually imports (infrastructure uses redis.get directly; analytics uses named functions)

**Phase 26-01:**
- ramping-arrival-rate executor replaces ramping-vus in k6 local scenario — guarantees 5K RPS vs ramping-vus which is implicit/fragile
- SCENARIO env var selects local (ramping-arrival-rate, 5K RPS) vs cloud (constant-arrival-rate, 100 RPS) k6 test profile
- vitest run --passWithNoTests used so pnpm test passes before any test files exist (Vitest 4.x exits code 1 with no tests by default)
- prismaMock exported from test-utils.ts but each test file must vi.mock('@sparkmotion/database') because routers import db at module scope, not from ctx
- Factory functions match actual Prisma schema — BandTag has title (not name), no color/orgId; EventWindow has no name; Campaign has no slug/description

**Phase 25-03:**
- NFC dialog eventId optional — shows event-select step first when not provided, skips it when provided (activity feed passes eventId)
- Press-and-hold uses 3s timer for reassign (vs 5s for delete) — reassign is significant but bands remain in system
- activityFeed.invalidate() added to reassign onSuccess — tap logs deleted on reassign so feed must refresh
- TagsManagement rendered as third tab in admin bands page — admin-only, no tag management in customer app

**Phase 25-02:**
- windows.list gated by enabled guard (requires eventId + this-window preset active) to prevent unnecessary fetches
- events.list returns array directly (not { events: [] }) — no .events accessor in activity feed
- Customer ActivityFeed omits orgId param — backend auto-scopes via CUSTOMER role check
- Component duplication (admin/customer) per established Phase 8 KISS pattern

**Phase 25-01:**
- BandTag model uses onDelete: SetNull so deleting a tag un-tags all bands automatically
- bulkReassign pre-deletes conflicting bands in target event before updateMany to prevent P2002 compound unique violation
- activityFeed from/to use ISO datetime strings (z.string().datetime) not z.date() for correct tRPC superjson transport
- tags.list is protectedProcedure (not adminProcedure) so customers can assign tags in scan-to-register dialog
- register mutation allows empty string email (or(z.literal(''))) converted to null before saving

**Recent (Phase 24-03):**
- Converted BandCsvUpload from Card-based to Dialog-based component for integration into event detail tab header
- Placed Bands tab between Overview and URL Manager (logical flow: info → bands → URLs → analytics → settings)
- Removed status column and field from all band UI components to match schema changes from 24-01

**Phase 24-02:**
- Only cache single-event bands, not multi-event bands to ensure correct routing based on user location
- Fallback to oldest event by createdAt when GeoIP unavailable for predictable behavior
- Use Vercel geo headers for tapper location (consistent with Phase 23 auto-assignment pattern)

**Phase 24-01:**
- Compound unique constraint [bandId, eventId] replaces global bandId uniqueness for multi-event support
- BandStatus enum removed entirely (ACTIVE/DISABLED/LOST no longer needed)
- Hub route changed from findUnique to findFirst as temporary bridge until Plan 02 multi-event routing
- uploadBatch mutation now returns existingInOtherEvents count for informational purposes
- db push used instead of migrate dev due to missing migration history (established pattern from Phase 23-01)

**Phase 23-04:**
- Use formattedAddress || location fallback pattern for backwards compatibility with pre-23-02 events
- Show venue name with dash separator when both venueName and formattedAddress exist for clear visual hierarchy
- Crosshair icon chosen for auto-assigned badge as visual metaphor for precision/targeting
- Separate updateWebsiteUrl mutation created for customer access with org ownership enforcement
- Display websiteUrl in org overview contact info for immediate admin visibility

**Phase 23-03:**
- Singleton pattern for MaxMind reader avoids expensive re-initialization (~100ms per process)
- Graceful degradation when GeoIP database missing allows development without 70MB file
- Tiebreaker uses earliest upcoming window start when events equidistant from tapper
- Race condition handling via P2002 error code for concurrent band creation on first tap
- Fallback to org.websiteUrl when no events exist provides meaningful redirect target

**Phase 23-02:**
- Manual script loading for Google Maps API (createElement approach) instead of @googlemaps/js-api-loader due to API inconsistencies
- Populate both new structured fields AND legacy location field for backwards compatibility
- Show formattedAddress OR location as fallback in edit forms for events created before this plan
- Graceful degradation with disabled input when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not configured
- CityAutocomplete component kept in codebase (not deleted) for potential fallback use cases

**Phase 23-01:**
- Prisma Decimal(9,6) for latitude/longitude provides ~0.1m accuracy without floating point issues
- All new location fields nullable for backwards compatibility with existing events
- Composite index on [latitude, longitude] enables efficient earthdistance queries
- Band reassign mutation sets autoAssigned=false since manual reassignment overrides auto-assignment
- Used db push instead of migrate dev due to missing migration history on dev database
- PostgreSQL cube extension required before earthdistance (dependency chain)

**Phase 22-02:**
- Schedule mode toggle placed at top of URL Manager section for primary visibility
- Manual window switches disabled with opacity-50 when schedule mode on
- Toast feedback on schedule mode toggle and manual window activation
- Active window badge changed from "Active" to "LIVE" for clarity
- Green border and background tint on active window cards for visual emphasis
- Gap state message shows when schedule mode on but no window covers current time
- Green pulsing dot on event cards shows live status at-a-glance
- isLive computed from windows array already included in events.list response

**Phase 22-01:**
- Cron only processes events with scheduleMode: true (explicit opt-in for automatic scheduling)
- Manual window toggle atomically disables schedule mode (user takes control)
- One-live-window constraint enforced via sibling deactivation on activate
- TZDate + isWithinInterval pattern for timezone-aware datetime comparison
- First-created window wins if overlap exists (createdAt ordering)
- Gap state (no window covers now) results in all windows inactive
- Disabling schedule mode keeps current window states unchanged

**Phase 21-03:**
- Event timezone defaults to browser timezone on create/edit forms
- Timezone field placed after Location field in form layout
- Settings page remains server component, renders client TimezoneSelector
- Timezone preference section separated from disabled notification toggles with border

**Phase 21-02:**
- Calendar range picker uses two-month view (numberOfMonths={2}) for better UX
- Time inputs use HTML5 <input type='time'> for native minute granularity and picker
- Disabled ranges calculated from existing windows (excluding self when editing)
- Legend below calendar shows blocked windows instead of inline labels on calendar days
- Browser timezone fallback: Intl.DateTimeFormat().resolvedOptions().timeZone when user.timezone null

**Phase 21-01:**
- Event.timezone defaults to UTC, User.timezone nullable for browser detection fallback
- Overlap validation uses lte/gte boundaries to prevent adjacent windows (gap required between windows)
- Primary display in event timezone, secondary (user preference) in tooltip on hover
- date-fns v4 with @date-fns/tz using tz() function and in option (not formatInTimeZone from older versions)
- Nullable fields in Prisma update handled by filtering undefined values (null is valid for nullable fields)

**Phase 20-03:**
- Stat cards stack in single column on both phone AND tablet (<1024px), preventing cramped two-column layout on tablets
- Tables convert to card lists on both phone and tablet (<1024px), showing as tables only on desktop (1024px+)
- FAB only appears on phone (<768px), header buttons remain on tablet/desktop to preserve existing UI
- Conditional rendering pattern (hidden lg:block / lg:hidden) instead of CSS display changes for cleaner DOM and better performance

**Phase 20-02:**
- Customer responsive sidebar mirrors admin pattern with org-scoped navigation
- Sheet drawer, mobile header, tablet icon-rail applied to customer app

**Phase 20-01:**
- Use shadcn Sheet component for mobile drawer instead of custom implementation
- Auto-close drawer on navigation using usePathname + useEffect pattern
- Three responsive modes: phone drawer (<768px), tablet icon-rail (768-1024px), desktop full sidebar (1024px+)
- isMobile prop on Sidebar instead of separate component to reduce duplication
- Fixed mobile header with centered logo and hamburger on left for thumb reach
- Preserve desktop sidebar collapse/expand toggle functionality unchanged

**Phase 19:**
- Event.location field is nullable to support existing events without location data
- Engagement calculation uses Redis analytics (uniqueTaps / totalBands * 100)
- Campaign engagement aggregates across all child events using parallel Promise.all
- tapCount added to events API to replace missing field that cards already reference
- Location field accepted on create/update but remains optional in database
- CityAutocomplete uses Command + Popover pattern (~150 US cities)
- Location required on event creation, optional on edit
- URL manager restyled to card-based layout with amber fallback section
- Campaign analytics tab shows 4 stat cards + event breakdown
- Event/campaign cards show engagement % and location

**Phase 18-04:**
- Customer campaign pages mirror admin without org selector
- All campaign data auto-scoped via session.user.orgId
- Campaign form has no orgId field (injected by dialog from session)
- Event forms have campaign dropdown (create + edit)
- Campaign filter on events list uses URL searchParams
- Event cards show campaign subtitle when showCampaign=true
- Event detail shows campaign link in overview tab
- Ownership validation on campaign detail page (notFound if wrong org)

**Phase 18-02:**
- Campaign creation via dialog instead of dedicated page route
- EventMultiSelect uses Command + Popover pattern with dismissible badges
- Nested event creation dialog (sibling Dialog, not nested content)
- Server component for page with client CampaignPageActions wrapper
- Events tab shows associated events using existing EventCardList component
- Empty state shown when no campaigns exist with inline Create button
- not-found.tsx added to fix pre-existing build blocker

**Phase 18-03:**
- Campaign dropdown shows "No campaign" option to allow clearing association
- Campaign filter uses URL searchParams (?campaignId=...) for bookmarkable state
- Events without campaigns show clean UI (no indicator/badge)
- Campaign subtitle on event cards only shows when campaign exists
- Campaign link on event detail navigates to /campaigns/[id]
- Empty campaigns array passed to EventForm in campaign creation dialog

**Phase 18-01:**
- Event.campaignId is nullable with onDelete:SetNull (events survive campaign deletion)
- Campaign.slug has global uniqueness constraint (not org-scoped)
- Campaign creation supports transaction-based event association via eventIds array
- CUSTOMER role enforces org ownership checks on campaign update/delete
- Megaphone icon chosen for campaigns navigation

**Phase 17-05:**
- Placeholder pages use coming-soon banners and disabled inputs instead of hiding entirely
- Tab navigation uses URL query params (?tab=overview) for state management
- Member avatars replaced with count in production (no avatar data in DB)
- All placeholder pages show session user data where applicable

**Phase 17-03:**
- Dashboard components copied between admin/customer apps instead of shared package
- Customer recent events table omits org column (redundant in org-scoped context)
- DRAFT status mapped to "Upcoming" display value for better UX
- Admin dashboard implemented in earlier commit (a6c410d) ahead of plan execution

**Phase 17-04:**
- Card-based event list replaces TanStack table for better visual hierarchy
- Tab navigation via URL query params for bookmarkable state
- Component duplication pattern (admin/customer) for app-specific customization

**Phase 17-01:**
- Use :root[class~='dark'] selector instead of .dark for next-themes compatibility
- Copy logo SVGs to both packages/ui/src/assets (source) and app public/ directories (runtime serving)
- Export asset paths as strings from shared package for Next.js static file serving
- Warm brown-black dark mode background (HSL 20, 14.3%, 4.1%) instead of pure black

**Phase 15-02:**
- Client-side JSON parsing for k6 summary files — validates structure before import
- Generic latency metric detection — supports custom trends and fallback to http_req_duration
- Dialog-based UI pattern — three views (list, upload, detail) with state reset on close
- k6 JSON key handling — uses p(95), p(99) with parentheses, and med for median/p50

**Phase 15-01:**
- JSONB for summaryJson field to enable PostgreSQL JSON queries
- testType as flexible string instead of enum to support future test types
- k6 handleSummary exports both JSON and text summary for dual usage

**Phase 14-02:**
- Cost projection uses actual window count per event instead of hardcoded 3 taps/attendee
- ECS Not Configured badge shown gracefully when env vars not set
- Removed tap count from CurrentActivityCard — events.list only includes _count.bands

**Phase 14-01:**
- ECS credentials optional in infrastructure router — falls back to IAM role
- Graceful degradation: getServiceStatus returns NOT_CONFIGURED when env vars missing
- Redis metadata key `redirect-map:meta` for tracking map freshness
- 5-minute stale threshold for redirect map
- Cost formula: Fargate $0.04048/vCPU-hour, Redis $0.20/1M commands, 1 tap/attendee/window, 8 hours/event day

**v1.3 re-scope:**
- Usage dashboard with ECS scaling controls, redirect map status, cost projection
- Dropped original Phase 13 (capacity planning dashboard) — redundant with auto-scaling + ECS pre-scaling
- [Phase 17-02]: Collapse state not persisted — resets on refresh per user discretion
- [Phase 17-02]: Theme switcher uses mounted guard to prevent hydration mismatch
- [Phase 26]: async vi.mock factory imports test-mocks.ts (not test-utils.ts) to avoid circular dependency — test-utils imports appRouter which causes deadlock
- [Phase 26]: lib/engagement.ts mocked per-test-file in events/campaigns tests because it calls db. directly
- [Phase 27]: Deleted ActivityFeed and CityAutocomplete components with no dangling imports (confirmed via grep before deletion)
- [Phase 27]: Phase 25 VERIFICATION.md status/score preserved - truths were accurate at verification time; post-phase commits documented separately in Post-Phase Corrections section

### Pending Todos

None.

### Roadmap Evolution

- Phase 30 added: Add analytics tracking for fallback and org URL taps
- Phase 29 added: Add user management page for creating/deleting Admins and Customers with email invitations
- Phase 28 added: Seed prod admin account and password reset flow for admins and customers
- Phase 26 added: Update load tests and add core functionality testing suite
- **Phase 25 COMPLETE** — Band Activity Tab — All 3 plans complete
- Phase 25-03 completed: NFC scan-to-register dialog (admin+customer), admin tag management with color palette, press-and-hold reassign with tap history deletion warning
- Phase 25-02 completed: ActivityFeed with 15s polling/time filters, TagBadge, tabbed bands pages, BandReviewTable tag column (admin+customer)
- Phase 25-01 completed: BandTag schema, tags CRUD router, bands listAll/bulkReassign/activityFeed/register procedures
- **Phase 24 COMPLETE** — Event band management tab — All 3 plans complete
- Phase 24-03 completed: Bands tab integration in event detail pages, CSV upload converted to dialog, status removed from UI layer
- Phase 24-02 completed: Multi-event band routing with GeoIP-based event selection, conditional caching for single-event bands
- Phase 24-01 completed: Band schema migration to compound unique [bandId, eventId], BandStatus enum removed, tRPC router and Redis cache updated
- Phase 24-02 completed: Hub multi-event band routing with GeoIP earthdistance selection, conditional caching for single-event bands only
- Phase 24-01 completed: Band schema migration to compound unique [bandId, eventId], BandStatus enum removed, tRPC router and Redis cache updated to remove status references
- **Phase 23 COMPLETE** — Granular event locations (venue/address), IP-based band-to-event auto-assignment for unassigned bands — All 5 plans complete
- Phase 23-05 completed: (if exists - marking Phase 23 as complete based on current state showing 4 of 5)
- Phase 23-04 completed: UI components for location display (event cards show formatted address), auto-assigned badge on bands list, organization websiteUrl forms (admin creation, admin settings, customer settings)
- Phase 23-03 completed: GeoIP package for IP geolocation, hub auto-assignment with earthdistance queries, subdomain-based org resolution
- Phase 23-02 completed: Google Places autocomplete on all event forms, venue search with auto-populated coordinates
- Phase 23-01 completed: Schema foundation with Event location fields, Band.autoAssigned, Organization.websiteUrl, PostgreSQL geospatial extensions
- **Phase 22 COMPLETE** — Toggleable schedule mode for event windows — All 2 plans complete
- Phase 22-02 completed: Schedule mode UI with toggle controls, disabled manual switches, LIVE badge, gap state message, event card live indicator
- Phase 22-01 completed: Schedule mode backend with Event.scheduleMode field, toggleScheduleMode mutation, timezone-aware cron scheduler
- **Phase 21 COMPLETE** — Event window datetime range selector with timezone support — All 3 plans complete
- Phase 21-03 completed: Event form timezone fields and settings integration
- Phase 21-02 completed: Calendar range picker, timezone-aware display in windows list
- Phase 21-01 completed: Schema foundation (Event.timezone, User.timezone), server-side overlap validation, timezone-aware display and selector components
- **Phase 20 COMPLETE** — Mobile responsive UI — All 3 plans complete
- Phase 20-03 completed: Dashboard responsive grids, table-to-card conversion, FAB pattern for create actions
- Phase 20-02 completed: Customer responsive sidebar with Sheet drawer, mobile header, tablet icon-rail
- Phase 20-01 completed: Admin responsive sidebar with Sheet drawer, mobile header, tablet icon-rail, responsive layout
- **Phase 19 COMPLETE** — Analytics & card UI refinements — All 5 plans complete
- Phase 19-05 completed: Campaign analytics tab with aggregate metrics and event breakdown
- Phase 19-04 completed: URL manager restyled to card-based layout with amber fallback
- Phase 19-03 completed: CityAutocomplete component and location field on event forms
- Phase 19-02 completed: Engagement % and location display on event/campaign cards
- Phase 19-01 completed: API foundation - events/campaigns routers return engagement % and location data
- **Phase 18 COMPLETE** — Campaigns Concept — All 4 plans complete (foundation + admin UI + customer UI + event integration)
- Phase 18-04 completed: Customer campaign pages (list, detail, creation) with org-scoped data, event integration mirroring admin
- Phase 18-03 completed: Campaign forms on events, campaign filter on events list, campaign subtitle on cards, campaign link on event detail
- Phase 18-02 completed: Admin campaign list and detail pages, dialog-based creation with event multi-select, tabbed detail view
- Phase 18-01 completed: Campaign model with nullable event FK, tRPC router with full CRUD, sidebar navigation in both apps
- **v1.4 Phase 17 COMPLETE** — UI Overhaul: Demo Component Transfer — all 6 plans complete, verified
- Phase 17-05 completed: Organizations pages, event form styling, placeholder pages (profile, settings, campaigns)
- Phase 17-04 completed: Card-based events list with status badges, tabbed event detail pages
- Phase 17-03 completed: Dashboard redesign with stat cards, recent events, org sidebar (admin/customer)
- Phase 17-02 completed: Collapsible sidebar with orange gradient navigation, theme switcher, user profile
- Phase 17-01 completed: Orange theme, dark mode, next-themes provider, logo assets
- **v1.3 COMPLETE** — Infrastructure Scaling & Operational Visibility milestone finished
- Phase 15 completed (15-01, 15-02): Full load test reporting system with k6 integration, JSON storage, and visualization UI
- Phase 14 completed (14-01, 14-02): Usage Dashboard with ECS scaling controls, redirect map status, cost projection, upcoming events
- Phase 13 dropped: Capacity planning dashboard (redundant with auto-scaling + pre-scaling)

### Blockers/Concerns

- Hub app pre-existing build failure (`/api/cron/update-windows` PageNotFoundError)
- TypeScript compilation warnings in API package (type augmentation monorepo issue)
- SSE connection limits on Vercel serverless — needs load testing at 100 concurrent
- CRON_SECRET env var must be set in Vercel for production deployment
- AWS account setup needed if not already configured (IAM, VPC, security groups)
- ECS env vars needed for infrastructure router: SPARKMOTION_ECS_CLUSTER, SPARKMOTION_ECS_SERVICE
- Disk space low on dev machine (ENOSPC during build)

## Session Continuity

Last session: 2026-02-26
Stopped at: Completed 30-01-PLAN.md — analytics tracking for fallback and org URL taps (hub route logging gaps + tapsByRedirectType/campaignTapsByRedirectType procedures)
Resume file: None
Next step: Phase 30 Plan 02 (if exists) or next planned phase
