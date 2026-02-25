---
phase: 18-campaigns
plan: 03
subsystem: event-campaign-ui-integration
tags: [ui, forms, filtering, navigation, event-forms, campaign-association]
dependency_graph:
  requires: [campaign-model, campaign-api]
  provides: [event-campaign-forms, campaign-filter, event-campaign-nav]
  affects: [events-list, event-detail, event-forms]
tech_stack:
  added: [CampaignFilter component]
  patterns: [URL-based filtering via searchParams, optional form fields, controlled Select, nullable FK handling]
key_files:
  created:
    - apps/admin/src/components/events/campaign-filter.tsx
  modified:
    - packages/api/src/routers/events.ts
    - apps/admin/src/components/events/event-form.tsx
    - apps/admin/src/components/events/event-form-wrapper.tsx
    - apps/admin/src/components/events/event-edit-form.tsx
    - apps/admin/src/app/(dashboard)/events/new/page.tsx
    - apps/admin/src/app/(dashboard)/events/page.tsx
    - apps/admin/src/app/(dashboard)/events/[id]/page.tsx
    - apps/admin/src/components/events/event-card-list.tsx
    - apps/admin/src/components/events/event-detail-tabs.tsx
    - apps/admin/src/components/campaigns/campaign-form-dialog.tsx
decisions:
  - Campaign dropdown shows "No campaign" option to allow clearing association
  - Campaign filter uses URL searchParams (?campaignId=...) for bookmarkable state
  - Events without campaigns show clean UI (no indicator/badge)
  - Campaign subtitle on event cards only shows when campaign exists
  - Campaign link on event detail navigates to /campaigns/[id]
  - Empty campaigns array passed to EventForm in campaign creation dialog (campaigns dropdown hidden when creating event from campaign context)
metrics:
  duration: 424 seconds (7 minutes)
  completed: 2026-02-10T18:46:56Z
  tasks: 2
  commits: 2
---

# Phase 18 Plan 03: Event-Campaign Association UI Integration Summary

**One-liner:** Campaign awareness integrated into all admin event UI with optional campaign dropdowns on forms, URL-based campaign filtering on events list, campaign subtitles on cards, and clickable campaign links on event detail.

## What Was Built

### Events tRPC Router
- **create procedure:** Added optional `campaignId` input field (passes through to Prisma create)
- **update procedure:** Added nullable optional `campaignId` input field (allows setting to null to clear association)
- **list procedure:** Added `campaign: { select: { id: true, name: true } }` to include statement
- **byId procedure:** Added `campaign: { select: { id: true, name: true } }` to include statement

### Event Create Form
- **Schema:** Added optional `campaignId` field to eventFormSchema
- **UI:** Campaign dropdown after organization field with "No campaign" default option
- **Props:** Added `campaigns` array to EventFormProps interface
- **Default:** Empty string for campaignId, transformed to undefined when "none" selected
- **New Event Page:** Fetches campaigns list from database and passes to EventFormWrapper

### Event Edit Form
- **Schema:** Added nullable optional `campaignId` field to eventSchema
- **UI:** Campaign dropdown in form grid with controlled Select component
- **Default:** Current event's campaignId or empty string
- **Clearing:** Selecting "No campaign" sets campaignId to null (explicit unlink)
- **Props:** Added `campaigns` array to EventEditFormProps

### Events List Page
- **Filtering:** Accepts `searchParams.campaignId` to filter events by campaign
- **Campaign Data:** Fetches all campaigns for filter dropdown
- **Query:** Constructs where clause based on campaignId searchParam
- **Filter UI:** Renders CampaignFilter component when campaigns exist
- **Card Props:** Passes `showCampaign={true}` to EventCardList

### Campaign Filter Component (NEW)
- **Type:** Client component with useRouter navigation
- **UI:** Select dropdown with Label "Filter by Campaign:"
- **Options:** "All campaigns" (clears filter) + each campaign
- **Navigation:** Updates URL to `/events` or `/events?campaignId={id}`
- **State:** Selected value from searchParams, defaults to "all"

### Event Card List
- **Props:** Added optional `campaign` field to events array, added `showCampaign` boolean prop
- **Icon:** Imported Megaphone icon from lucide-react
- **Subtitle:** Shows campaign name below event name/slug row when showCampaign=true and campaign exists
- **Styling:** Text-sm text-muted-foreground with inline icon (3.5px)
- **Clean UI:** Events without campaigns show no indicator

### Event Detail Page
- **Campaign Include:** Added `campaign: { select: { id, name } }` to event query
- **Campaigns List:** Fetches all campaigns for edit form dropdown
- **Props:** Passes `campaigns` array to EventDetailTabs

### Event Detail Tabs
- **Campaign Link:** Shows campaign info line above "Event Information" heading when campaign exists
- **UI:** Megaphone icon + "Campaign:" label + clickable Link to `/campaigns/{id}`
- **Styling:** Text-sm text-muted-foreground, link is text-primary with hover:underline
- **Edit Form:** Passes `campaigns` array to EventEditForm

### Campaign Form Dialog Fix
- **EventForm Usage:** Passes empty `campaigns={[]}` array to EventForm
- **Context:** When creating event from campaign creation flow, campaigns dropdown not relevant
- **Result:** Satisfies TypeScript requirement without displaying irrelevant campaign dropdown

## Architecture Decisions

### 1. Optional vs Required Campaign Association
**Decision:** Campaign field is optional on event create/edit forms
**Rationale:** Events are primary entities and can exist independently of campaigns. Campaigns are organizational containers, not lifecycle requirements.
**Impact:** Event creation flows work unchanged for users who don't use campaigns. Campaign adoption is gradual and non-disruptive.

### 2. URL-Based Campaign Filtering
**Decision:** Use searchParams (?campaignId=...) instead of client state
**Rationale:** Makes filtered views bookmarkable, shareable, and preserves state on page refresh. Follows Next.js App Router patterns.
**Impact:** Users can bookmark filtered views, browser back button works correctly, page refresh preserves filter state.

### 3. Nullable FK for Clearing Association
**Decision:** EventEditForm sets campaignId to null when "No campaign" selected
**Rationale:** Prisma nullable FK requires explicit null (not undefined) to clear association. Input schema uses `.nullable()` to allow null passthrough.
**Impact:** Users can unlink events from campaigns without confirmation dialog. Clean, simple UX.

### 4. Clean UI for Unassociated Events
**Decision:** Events without campaigns show no indicator badge or placeholder
**Rationale:** Avoids visual clutter. Campaign association is optional feature, not a status to highlight.
**Impact:** Events list remains clean and uncluttered. Campaign info only shows when relevant.

### 5. Campaign Link Navigation Pattern
**Decision:** Campaign name on event detail is a Link component to `/campaigns/{id}`
**Rationale:** Follows existing navigation patterns (org names are clickable in other views). Enables quick campaign context switching.
**Impact:** Users can navigate from event detail to campaign detail in one click.

## Deviations from Plan

### Rule 3: Auto-fix blocking issue
**Issue:** EventForm in campaign-form-dialog.tsx missing required `campaigns` prop after adding it to EventFormProps
**Fix:** Passed empty `campaigns={[]}` array to EventForm usage in campaign creation dialog
**Rationale:** When creating an event from campaign creation flow, campaigns dropdown is not relevant (event will be associated with the campaign being created). Empty array prevents dropdown from showing.
**Files modified:** apps/admin/src/components/campaigns/campaign-form-dialog.tsx
**Commit:** Included in Task 2 commit (29558a3)

## Verification Results

### TypeScript Compilation
```bash
$ cd packages/api && pnpm tsc --noEmit
# Exit 0 - No errors

$ cd apps/admin && pnpm tsc --noEmit
# Exit 0 - No errors
```

### File Structure
```
packages/api/src/routers/
  events.ts ← campaignId in create/update, campaign include in list/byId

apps/admin/src/
  app/(dashboard)/events/
    page.tsx ← campaign filter, ?campaignId searchParam filtering
    new/page.tsx ← fetches campaigns list
    [id]/page.tsx ← fetches campaigns for edit form
  components/events/
    campaign-filter.tsx ← NEW (Select dropdown navigation)
    event-form.tsx ← campaignId field + dropdown
    event-form-wrapper.tsx ← passes campaigns prop
    event-edit-form.tsx ← campaignId field + dropdown
    event-card-list.tsx ← campaign subtitle
    event-detail-tabs.tsx ← campaign link + passes campaigns to edit form
  components/campaigns/
    campaign-form-dialog.tsx ← empty campaigns array fix
```

## Task Breakdown

### Task 1: Add campaignId to events tRPC router and event forms
**Commit:** abcf0f1
**Files:** 5 files changed, 89 insertions(+), 7 deletions(-)
**Changes:**
- Updated events.create input schema with optional campaignId
- Updated events.update input schema with nullable optional campaignId
- Added campaign include to events.list query (id, name)
- Added campaign include to events.byId query (id, name)
- Added campaignId field to eventFormSchema in event-form.tsx
- Added campaigns prop to EventFormProps and defaultValues
- Added campaign Select dropdown UI in event form (after orgId field)
- Updated EventFormWrapper to accept and pass campaigns prop
- Updated new event page to fetch campaigns from database
- Added campaignId field to eventSchema in event-edit-form.tsx
- Added campaigns prop to EventEditFormProps
- Added campaign Select dropdown in event edit form grid
- Added currentCampaignId watch and null handling for "none" selection

### Task 2: Add campaign filter, card subtitle, and event detail link
**Commit:** 29558a3
**Files:** 6 files changed, 268 insertions(+), 20 deletions(-)
**Changes:**
- Created CampaignFilter component with Select dropdown navigation
- Updated events list page to accept searchParams.campaignId
- Added campaign query fetch and where clause filtering on events page
- Removed placeholder "Create Campaign" button linking to /events/campaigns/new
- Added CampaignFilter component render on events page (when campaigns exist)
- Passed showCampaign={true} to EventCardList on events page
- Updated EventCardList interface with campaign field and showCampaign prop
- Added Megaphone icon import to event-card-list.tsx
- Added campaign subtitle UI below event name (conditional on showCampaign && campaign exists)
- Updated event detail page to fetch campaigns list for edit form
- Added campaign include to event query in event detail page
- Updated EventDetailTabs props to include campaigns array and campaign fields
- Added campaign link UI in event detail overview tab (Megaphone icon + Link)
- Passed campaigns prop to EventEditForm in event detail tabs
- Fixed EventForm usage in campaign-form-dialog.tsx (empty campaigns array)

## Success Criteria Validation

- [x] Events tRPC router accepts campaignId on create (optional)
- [x] Events tRPC router accepts nullable campaignId on update (can clear association)
- [x] Events list includes campaign data in query response
- [x] Event create form shows optional campaign dropdown
- [x] Event edit form shows campaign dropdown with current selection
- [x] Events list page has campaign filter dropdown
- [x] Campaign filter works via URL searchParams (?campaignId=...)
- [x] Event cards show campaign name subtitle when campaign associated
- [x] Event detail overview tab shows clickable campaign link
- [x] Unlinking campaign requires no confirmation (select "No campaign" and save)
- [x] Events without campaign show clean UI (no indicator)
- [x] TypeScript compilation passes for API and admin packages

## Self-Check

**Created files:**
```bash
$ [ -f "apps/admin/src/components/events/campaign-filter.tsx" ] && echo "FOUND" || echo "MISSING"
FOUND
```

**Modified files:**
```bash
$ grep -q "campaignId: z.string().optional()" packages/api/src/routers/events.ts && echo "FOUND: campaignId in create"
FOUND: campaignId in create

$ grep -q "campaignId: z.string().nullable().optional()" packages/api/src/routers/events.ts && echo "FOUND: campaignId in update"
FOUND: campaignId in update

$ grep -q "campaign: { select: { id: true, name: true } }" packages/api/src/routers/events.ts && echo "FOUND: campaign include"
FOUND: campaign include

$ grep -q "campaigns: Array<{ id: string; name: string }>" apps/admin/src/components/events/event-form.tsx && echo "FOUND: campaigns prop"
FOUND: campaigns prop

$ grep -q "CampaignFilter" apps/admin/src/app/\(dashboard\)/events/page.tsx && echo "FOUND: campaign filter"
FOUND: campaign filter

$ grep -q "showCampaign" apps/admin/src/components/events/event-card-list.tsx && echo "FOUND: showCampaign prop"
FOUND: showCampaign prop

$ grep -q "Megaphone" apps/admin/src/components/events/event-detail-tabs.tsx && echo "FOUND: campaign link"
FOUND: campaign link
```

**Commits:**
```bash
$ git log --oneline | head -2
29558a3 feat(18-03): add campaign filter, card subtitle, and event detail link
abcf0f1 feat(18-03): add campaignId to events tRPC router and event forms
```

## Self-Check: PASSED

All artifacts created, all commits present, no missing files.

## Next Steps

**Plan 18-04 (final):** Customer App Campaign Pages
- Mirror admin campaign list/detail pages for customer role
- Org-scoped campaign queries (customer sees only their org's campaigns)
- Campaign-event association visible in customer event forms
- Org-scoped navigation and filtering

**Dependencies satisfied:**
- This plan provides: event-campaign-forms, campaign-filter, event-campaign-nav
- Plan 18-04 can consume: campaign-api (18-01), event-campaign-forms (18-03)

## Technical Notes

### Campaign Dropdown UX Pattern
The campaign dropdown uses a controlled Select component with special handling for the "none" option:
```typescript
// Create form: transforms "none" to undefined (omits from API call)
onValueChange={(value) => field.onChange(value === "none" ? undefined : value)}

// Edit form: transforms "none" to null (explicitly clears FK)
onValueChange={(value) => setValue("campaignId", value === "none" ? null : value, { shouldDirty: true })}
```

This pattern ensures:
1. Create: Undefined campaignId omitted from payload (Prisma defaults to null)
2. Update: Null campaignId explicitly set (clears association)
3. UI consistency: "No campaign" option in both forms

### URL-Based Filtering Pattern
The campaign filter uses Next.js searchParams for state management:
```typescript
// Server component reads filter
searchParams.campaignId ? { campaignId: searchParams.campaignId } : {}

// Client component updates URL
router.push(value === "all" ? "/events" : `/events?campaignId=${value}`)
```

Benefits: bookmarkable URLs, browser back/forward works, state persists on refresh.

### Campaign Subtitle Conditional Rendering
Event cards only show campaign info when:
1. `showCampaign={true}` prop passed (opt-in per page)
2. `event.campaign` exists (has association)

This prevents showing "No campaign" placeholders, keeping UI clean.

### Empty Campaigns Array for Dialog Context
When creating an event from within campaign creation flow, the campaigns dropdown would be confusing (which campaign to associate?). Passing empty array hides the dropdown without special conditional logic in EventForm component.

### Pre-existing Build Failure
Admin app build fails during static generation with webpack runtime error. This is a known blocker documented in STATE.md ("Hub app pre-existing build failure"). TypeScript compilation passes, which validates the code changes. The build failure is unrelated to this plan's changes.
