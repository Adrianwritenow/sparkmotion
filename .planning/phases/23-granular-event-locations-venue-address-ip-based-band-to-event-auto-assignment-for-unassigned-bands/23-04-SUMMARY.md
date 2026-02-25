---
phase: 23-granular-event-locations
plan: 04
subsystem: ui-frontend
tags: [ui, event-cards, event-detail, organizations, settings, websiteUrl]
dependency_graph:
  requires:
    - 23-01 (Event location fields, Band.autoAssigned, Organization.websiteUrl)
    - 23-02 (Google Places autocomplete on event forms)
    - 23-03 (GeoIP package, hub auto-assignment)
  provides:
    - Event cards displaying formatted address with venue name
    - Auto-assigned badge on bands list
    - Organization websiteUrl editor (admin creation, admin settings, customer settings)
    - Organization websiteUrl display in org overview
  affects:
    - apps/admin/src/components/events/event-card-list.tsx
    - apps/customer/src/components/events/event-card-list.tsx
    - apps/admin/src/components/bands/bands-columns.tsx
    - apps/customer/src/components/bands/bands-columns.tsx
    - apps/admin/src/components/organizations/add-org-dialog.tsx
    - apps/admin/src/app/(dashboard)/organizations/[id]/page.tsx
    - apps/customer/src/app/(dashboard)/settings/page.tsx
    - packages/api/src/routers/organizations.ts
tech_stack:
  added: []
  patterns:
    - Backwards compatibility pattern (formattedAddress || location)
    - Badge component for auto-assigned indicator
    - Crosshair icon for auto-assignment visual
    - Client component forms for websiteUrl editing
    - Protected mutation with org ownership check for customers
key_files:
  created:
    - apps/admin/src/components/organizations/org-settings-form.tsx
    - apps/customer/src/components/settings/org-website-url-form.tsx
  modified:
    - apps/admin/src/components/events/event-card-list.tsx
    - apps/customer/src/components/events/event-card-list.tsx
    - apps/admin/src/components/bands/bands-columns.tsx
    - apps/customer/src/components/bands/bands-columns.tsx
    - apps/admin/src/components/organizations/add-org-dialog.tsx
    - apps/admin/src/app/(dashboard)/organizations/[id]/page.tsx
    - apps/customer/src/app/(dashboard)/settings/page.tsx
    - packages/api/src/routers/organizations.ts
decisions:
  - decision: Use formattedAddress || location fallback pattern
    rationale: Backwards compatibility with events created before Phase 23-02
  - decision: Show venue name with dash separator when both exist
    rationale: Clear visual hierarchy - venue name is more important than full address
  - decision: Use Crosshair icon for auto-assigned badge
    rationale: Visual metaphor for precision/targeting, distinct from other status indicators
  - decision: Create separate updateWebsiteUrl mutation for customer access
    rationale: Safer than opening full update mutation; enforces org ownership check
  - decision: Display websiteUrl in org overview contact info
    rationale: Immediate visibility for admins verifying fallback redirect configuration
metrics:
  duration: 372
  tasks_completed: 2
  files_modified: 10
  completed_at: "2026-02-14"
---

# Phase 23 Plan 04: UI Components for Location Display and Organization WebsiteUrl Summary

Event cards and detail pages display structured location data (venue name + formatted address), bands list shows auto-assigned indicator badge, organization websiteUrl editable in admin and customer apps.

## Tasks Completed

### Task 1: Update event cards and detail pages to show formatted address + auto-assigned badge on bands
**Commit:** e3ebd25

Updated event cards and bands list to display new Phase 23 data fields:

**Event cards (admin and customer):**
- Display `formattedAddress` instead of legacy `location` string
- Show `venueName` with dash separator when available: "Bridgestone Arena - 501 Broadway, Nashville, TN 37203, USA"
- Fallback to `location` for events created before Phase 23-02
- Clean conditional rendering: only show location section if data exists
- MapPin icon aligned with text using `items-start` and `mt-0.5`

**Interface updates:**
```typescript
interface EventCardListProps {
  events: Array<{
    // ... existing fields
    venueName?: string | null;
    formattedAddress?: string | null;
  }>;
}
```

**Display pattern:**
```tsx
{(event.formattedAddress || event.location) && (
  <div className="flex items-start gap-1.5">
    <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
    <div className="text-sm">
      {event.venueName && <span className="font-medium">{event.venueName}</span>}
      {event.venueName && <span className="mx-1">-</span>}
      <span>{event.formattedAddress || event.location || "No location set"}</span>
    </div>
  </div>
)}
```

**Bands list (admin and customer):**
- Added auto-assigned badge to bandId column
- Uses `Badge` component with `variant="secondary"`
- Crosshair icon from lucide-react for visual distinction
- Small text size (`text-xs`) to avoid overwhelming primary data

**Badge implementation:**
```tsx
{
  accessorKey: "bandId",
  header: "Band ID",
  cell: ({ row }) => (
    <div className="flex items-center gap-2">
      <span className="font-mono text-sm">{row.original.bandId}</span>
      {row.original.autoAssigned && (
        <Badge variant="secondary" className="text-xs">
          <Crosshair className="w-3 h-3 mr-1" />
          Auto
        </Badge>
      )}
    </div>
  ),
}
```

**Files modified:**
- apps/admin/src/components/events/event-card-list.tsx
- apps/customer/src/components/events/event-card-list.tsx
- apps/admin/src/components/bands/bands-columns.tsx
- apps/customer/src/components/bands/bands-columns.tsx

**Verification:**
- TypeScript compilation passed for both apps
- Backwards compatible: events without formattedAddress display location string
- Auto-assigned bands show "Auto" badge with Crosshair icon
- Non-auto-assigned bands show no badge (clean display)

### Task 2: Add websiteUrl to organization creation, detail settings, and customer settings
**Commit:** cea9f45

Added websiteUrl field to organization forms and settings across admin and customer apps:

**Admin org creation dialog:**
- Added websiteUrl input field below organization name
- Input type="url" with placeholder "https://compassion.com"
- Helper text: "Fallback redirect URL when no events exist for this organization"
- Optional field (not required)
- Clears on dialog close
- Passes to `organizations.create` mutation only if non-empty

**State management:**
```typescript
const [websiteUrl, setWebsiteUrl] = useState("");

createOrg.mutate({
  name: name.trim(),
  ...(websiteUrl.trim() && { websiteUrl: websiteUrl.trim() }),
});
```

**Admin org detail page:**
- Added websiteUrl display in Contact Info sidebar (overview tab)
- Shows as clickable link with `target="_blank" rel="noopener noreferrer"`
- Link2 icon for visual consistency
- "Not configured" fallback when null
- Replaced settings tab placeholder with functional `OrgSettingsForm` component

**OrgSettingsForm component (new):**
- Client component using `trpc.organizations.update.useMutation()`
- Shows websiteUrl input with save button
- Disabled state when not dirty or pending
- Success/error feedback messages
- Auto-clears success message after 3 seconds
- Invalidates `organizations.byId` query on success

**Customer settings page:**
- Added "Organization" section above "Preferences"
- Fetches org data via server component: `db.orgUser.findFirst` with org include
- Shows read-only org name field
- Renders `OrgWebsiteUrlForm` client component for editing

**OrgWebsiteUrlForm component (new):**
- Client component using `trpc.organizations.updateWebsiteUrl.useMutation()`
- Same UI pattern as admin settings form
- Helper text: "Redirect URL for NFC taps when your organization has no active events"
- Uses customer-accessible mutation with org ownership enforcement

**API changes:**
- Added `updateWebsiteUrl` mutation to `packages/api/src/routers/organizations.ts`
- Uses `protectedProcedure` (not `adminProcedure`) for customer access
- Enforces org ownership: `ctx.user.role === "CUSTOMER" && ctx.user.orgId !== input.orgId` → FORBIDDEN
- Accepts `orgId` and `websiteUrl` (nullable)
- Updates only websiteUrl field

**Mutation implementation:**
```typescript
updateWebsiteUrl: protectedProcedure
  .input(z.object({
    orgId: z.string(),
    websiteUrl: z.string().url().nullable(),
  }))
  .mutation(async ({ ctx, input }) => {
    // Customer can only update their own org
    if (ctx.user.role === "CUSTOMER" && ctx.user.orgId !== input.orgId) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return db.organization.update({
      where: { id: input.orgId },
      data: { websiteUrl: input.websiteUrl },
    });
  }),
```

**Files modified:**
- apps/admin/src/components/organizations/add-org-dialog.tsx
- apps/admin/src/app/(dashboard)/organizations/[id]/page.tsx
- apps/customer/src/app/(dashboard)/settings/page.tsx
- packages/api/src/routers/organizations.ts

**Files created:**
- apps/admin/src/components/organizations/org-settings-form.tsx
- apps/customer/src/components/settings/org-website-url-form.tsx

**Verification:**
- TypeScript compilation passed for admin, customer, and API packages
- Admin can create org with websiteUrl
- Admin can edit org websiteUrl in settings tab
- Customer can edit own org websiteUrl in settings page
- Customer cannot edit other org's websiteUrl (FORBIDDEN error)
- Org overview displays websiteUrl as clickable link

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

**Event cards:**
- Display formattedAddress when available
- Display venueName with dash separator when both exist
- Fallback to legacy location field works
- Clean UI when no location data exists

**Bands list:**
- Auto-assigned bands show "Auto" badge with Crosshair icon
- Non-auto-assigned bands show no badge
- Badge uses secondary variant (not primary)
- Icon and text properly aligned

**Organization forms:**
- Admin creation dialog accepts websiteUrl
- Customer settings page shows org websiteUrl editor
- Admin org settings tab has functional editor
- Org overview displays websiteUrl in contact info

**Authorization:**
- Customer can only update own org's websiteUrl
- FORBIDDEN error when customer tries to update different org
- Admin can update any org's websiteUrl via update mutation

**TypeScript:**
- No compilation errors in admin, customer, or API packages
- All new components type-safe

## Phase 23 UI Layer Complete

This plan completes the UI integration for Phase 23's structured location and auto-assignment features:

**Phase 23-01 provided:** Event location schema, Band.autoAssigned, Organization.websiteUrl
**Phase 23-02 provided:** Google Places autocomplete on event forms
**Phase 23-03 provided:** GeoIP package, hub auto-assignment logic
**Phase 23-04 provides:** UI components for displaying location data and configuring websiteUrl

**User-facing workflows now operational:**

1. **Admin creates event with location:**
   - Uses Google Places autocomplete to search "Bridgestone Arena Nashville"
   - Event saved with: venueName="Bridgestone Arena", formattedAddress="501 Broadway, Nashville, TN 37203, USA", lat=36.159, lng=-86.778
   - Event card displays: "Bridgestone Arena - 501 Broadway, Nashville, TN 37203, USA"

2. **Unknown band tapped at event:**
   - Hub uses GeoIP to locate tapper
   - Hub assigns band to nearest event
   - Band created with autoAssigned=true
   - Admin views bands list, sees "Auto" badge with Crosshair icon

3. **Organization configures fallback:**
   - Admin creates org with websiteUrl="https://compassion.com"
   - Or edits existing org in settings tab
   - Customer updates own org websiteUrl in settings page
   - When no events exist, NFC tap redirects to org.websiteUrl

**Remaining Phase 23 work:**
- Phase 23-05: End-to-end testing and documentation (if planned)

**Backwards compatibility:**
- Events without formattedAddress show location string
- Events without venueName show only formatted address
- Events without location data show "No location set"
- Bands without autoAssigned field treated as manual (no badge)
- Organizations without websiteUrl show "Not configured"

## Self-Check: PASSED

**Created files exist:**
```
FOUND: apps/admin/src/components/organizations/org-settings-form.tsx
FOUND: apps/customer/src/components/settings/org-website-url-form.tsx
```

**Modified files exist:**
```
FOUND: apps/admin/src/components/events/event-card-list.tsx
FOUND: apps/customer/src/components/events/event-card-list.tsx
FOUND: apps/admin/src/components/bands/bands-columns.tsx
FOUND: apps/customer/src/components/bands/bands-columns.tsx
FOUND: apps/admin/src/components/organizations/add-org-dialog.tsx
FOUND: apps/admin/src/app/(dashboard)/organizations/[id]/page.tsx
FOUND: apps/customer/src/app/(dashboard)/settings/page.tsx
FOUND: packages/api/src/routers/organizations.ts
```

**Commits exist:**
```
FOUND: e3ebd25 (Task 1 - event cards and auto-assigned badge)
FOUND: cea9f45 (Task 2 - websiteUrl forms and settings)
```

**Component verification:**
```
Event cards display formattedAddress: FOUND
Event cards show venueName: FOUND
Bands columns show autoAssigned badge: FOUND
Org creation dialog has websiteUrl: FOUND
Org settings form exists: FOUND
Customer org websiteUrl form exists: FOUND
updateWebsiteUrl mutation exists: FOUND
```

**TypeScript compilation:**
```
Admin app: PASSED (no errors)
Customer app: PASSED (no errors)
API package: PASSED (no errors)
```
