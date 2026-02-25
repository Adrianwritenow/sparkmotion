---
phase: 23-granular-event-locations
plan: 02
subsystem: ui-frontend
tags: [google-places, autocomplete, forms, coordinates, admin, customer]
dependency_graph:
  requires:
    - Event location fields (venueName, formattedAddress, latitude, longitude) from 23-01
  provides:
    - GooglePlacesAutocomplete component for venue search
    - Event forms with real-time Google Places integration
    - Coordinate capture on event creation/editing
  affects:
    - apps/admin/src/components/events/event-form.tsx
    - apps/admin/src/components/events/event-edit-form.tsx
    - apps/customer/src/components/events/event-form.tsx
    - apps/customer/src/components/events/event-edit-form.tsx
tech_stack:
  added:
    - use-places-autocomplete (React hook for Google Places API)
    - @types/google.maps (TypeScript definitions)
  patterns:
    - Manual script loading for Google Maps JavaScript API
    - Graceful degradation when API key not configured
    - Dual field population (new structured fields + legacy location field)
    - Form validation requiring location on create
key_files:
  created:
    - apps/admin/src/components/events/google-places-autocomplete.tsx
    - apps/customer/src/components/events/google-places-autocomplete.tsx
  modified:
    - apps/admin/src/components/events/event-form.tsx
    - apps/admin/src/components/events/event-edit-form.tsx
    - apps/customer/src/components/events/event-form.tsx
    - apps/customer/src/components/events/event-edit-form.tsx
decisions:
  - decision: Use manual script loading instead of @googlemaps/js-api-loader
    rationale: The Loader class API surface was inconsistent with documentation; manual script tag loading is simpler and more reliable
  - decision: Populate both new fields AND legacy location field
    rationale: Backwards compatibility ensures existing code reading event.location continues to work
  - decision: Show formattedAddress OR location as fallback in edit forms
    rationale: Events created before this plan have location but not formattedAddress
  - decision: Graceful degradation with disabled input when API key missing
    rationale: Prevents runtime errors and provides clear user feedback for configuration issues
  - decision: Keep CityAutocomplete component in codebase (not deleted)
    rationale: May be needed for fallback or other use cases; not actively imported so no harm
metrics:
  duration: 10
  tasks_completed: 2
  files_modified: 6
  completed_at: "2026-02-14"
---

# Phase 23 Plan 02: Google Places Autocomplete UI Integration Summary

Google Places autocomplete replaces static city selector on all event forms, enabling venue search with auto-populated coordinates for distance-based band assignment.

## Tasks Completed

### Task 1: Install Google Places dependencies and create GooglePlacesAutocomplete component
**Commit:** c6e3931

Installed Google Places libraries and built reusable autocomplete component for both apps:

**Dependencies added:**
- `use-places-autocomplete` - React hook providing Google Places Autocomplete service integration
- `@types/google.maps` - TypeScript definitions for Google Maps API

**GooglePlacesAutocomplete component features:**
- Manual script loading via createElement("script") for Google Maps JavaScript API
- `usePlacesAutocomplete` hook with debounce (300ms) and cache (1 day)
- Request options: `types: ["establishment", "geocode"]` for venues and addresses
- Dropdown suggestions with venue name (main_text) and secondary details
- Selection triggers geocoding to extract lat/lng coordinates
- Returns: `{ venueName, formattedAddress, latitude, longitude }`
- MapPin icon for visual consistency
- Graceful degradation: shows disabled input with warning when `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` not set
- Window type augmentation for `window.google` to satisfy TypeScript

**Implementation pattern:**
```typescript
// Load Google Maps API
const script = document.createElement("script");
script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=Function.prototype`;
document.head.appendChild(script);

// On place select
const results = await getGeocode({ address: suggestion.description });
const { lat, lng } = await getLatLng(results[0]);
onPlaceSelect({
  venueName: suggestion.structured_formatting.main_text,
  formattedAddress: results[0].formatted_address,
  latitude: lat,
  longitude: lng,
});
```

**Files created:**
- apps/admin/src/components/events/google-places-autocomplete.tsx (173 lines)
- apps/customer/src/components/events/google-places-autocomplete.tsx (173 lines)

**Verification:**
- Components compile with no TypeScript errors
- Imports `usePlacesAutocomplete`, `getGeocode`, `getLatLng` from use-places-autocomplete
- Manual script loading avoids @googlemaps/js-api-loader API inconsistencies

### Task 2: Update event create/edit forms to use GooglePlacesAutocomplete
**Commit:** 7454137

Replaced CityAutocomplete with Google Places in all four event forms (admin/customer create/edit):

**Schema changes (all forms):**
- Added `venueName: z.string().optional()`
- Added `formattedAddress: z.string().min(1, "Location is required")` on **create forms**
- Added `formattedAddress: z.string().optional()` on **edit forms** (backwards compat)
- Added `latitude: z.number().optional()`
- Added `longitude: z.number().optional()`
- Kept legacy `location: z.string().optional()` for backwards compatibility

**Default values (edit forms):**
- `venueName: event.venueName ?? ""`
- `formattedAddress: event.formattedAddress ?? ""`
- `latitude: event.latitude ? Number(event.latitude) : undefined` (Decimal to number)
- `longitude: event.longitude ? Number(event.longitude) : undefined`
- `defaultValue={currentFormattedAddress || currentLocation || ""}` shows existing data

**Form field replacement:**
```tsx
// OLD: CityAutocomplete
<CityAutocomplete
  value={field.value}
  onChange={(city) => {
    field.onChange(city);
    const tz = getTimezoneForLocation(city);
    if (tz) form.setValue("timezone", tz);
  }}
/>

// NEW: GooglePlacesAutocomplete
<GooglePlacesAutocomplete
  defaultValue={field.value}
  onPlaceSelect={(place) => {
    form.setValue("venueName", place.venueName);
    form.setValue("formattedAddress", place.formattedAddress);
    form.setValue("latitude", place.latitude);
    form.setValue("longitude", place.longitude);
    form.setValue("location", place.formattedAddress); // Legacy field
  }}
/>
```

**Removed imports:**
- `import { CityAutocomplete } from "./city-autocomplete"`
- `import { getTimezoneForLocation } from "@/lib/us-timezones"`

**Timezone behavior:**
- No longer auto-detects timezone from city name (YAGNI)
- Defaults to "America/Chicago" or browser timezone (existing Phase 21 pattern)

**Mutation updates (onSubmit):**
All forms now pass new fields to tRPC:
```typescript
{
  venueName: data.venueName || undefined,
  formattedAddress: data.formattedAddress || undefined,
  latitude: data.latitude,
  longitude: data.longitude,
  location: data.location || undefined, // Legacy
}
```

**Files modified:**
- apps/admin/src/components/events/event-form.tsx (create)
- apps/admin/src/components/events/event-edit-form.tsx (edit)
- apps/customer/src/components/events/event-form.tsx (create)
- apps/customer/src/components/events/event-edit-form.tsx (edit)

**Verification:**
- No imports of CityAutocomplete in event forms (`grep` confirms zero matches)
- All 4 forms import and render GooglePlacesAutocomplete
- Create forms require formattedAddress (validation enforced)
- Edit forms show existing venue data or fallback to location string
- TypeScript compilation passes for both apps
- Legacy location field populated for backwards compatibility

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- Google Places autocomplete components exist in both admin and customer apps
- All event forms (create/edit in both apps) use GooglePlacesAutocomplete
- CityAutocomplete no longer imported in event forms
- Location required on event creation (formattedAddress validation)
- Edit forms show existing venue and allow changing via Google Places
- TypeScript compilation passes: `pnpm tsc --noEmit` for both apps
- Coordinates captured: venueName, formattedAddress, latitude, longitude submitted to API

## Integration Complete

This plan provides the UI foundation for Phase 23 auto-assignment feature:

**Enabled workflows:**
1. User searches "Bridgestone Arena Nashville" → selects from dropdown
2. Form auto-populates: venueName="Bridgestone Arena", formattedAddress="501 Broadway, Nashville, TN 37203, USA", lat=36.159..., lng=-86.778...
3. Event creation submits coordinates to database
4. **Plan 03 (next):** Hub auto-assignment uses coordinates for distance calculation

**User experience:**
- Real-time venue search with live suggestions
- No typing full addresses manually
- Precise coordinates captured automatically
- Backwards compatible with existing events (location field preserved)

**Configuration required:**
- Set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in Vercel environment variables
- Enable "Maps JavaScript API" and "Places API" in Google Cloud Console
- Restrict API key to application domains (security best practice)

## Self-Check: PASSED

**Created files exist:**
```
FOUND: apps/admin/src/components/events/google-places-autocomplete.tsx
FOUND: apps/customer/src/components/events/google-places-autocomplete.tsx
```

**Modified files exist:**
```
FOUND: apps/admin/src/components/events/event-form.tsx
FOUND: apps/admin/src/components/events/event-edit-form.tsx
FOUND: apps/customer/src/components/events/event-form.tsx
FOUND: apps/customer/src/components/events/event-edit-form.tsx
```

**Commits exist:**
```
FOUND: c6e3931
FOUND: 7454137
```

**Component imports verified:**
- GooglePlacesAutocomplete used in all 4 event forms
- CityAutocomplete removed from all event forms
- use-places-autocomplete, getGeocode, getLatLng imported in both autocomplete components
