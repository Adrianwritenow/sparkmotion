# Phase 25 Context — Band Activity Tab

## Scan Activity Display

- **Scope:** Event-wide activity feed (not per-band timeline)
- **Authorization:** Admin sees all orgs; customer sees their org — filterable by org/event
- **Refresh:** Periodic auto-refresh (10–30s polling)
- **Row data:** Band ID, event, timestamp, mode, plus organizer metadata tag
- **Time filters:** Quick presets (Last hour, Today, This window, All time) + custom date range picker

## Band Reassignment Flow

- Repurpose existing `/bands` page into Band Activity page (the activity feed)
- Wire up missing `bands.listAll` and `bands.bulkReassign` backend procedures
- On reassignment: remove tap history (TapLogs) from original event
- Full reset on reassign: tapCount=0, clear firstTapAt/lastTapAt — band starts fresh
- Confirmation: press-and-hold pattern (similar to existing delete confirmation)

## NFC Scan-to-Register

- Registration desk workflow for staff/VIP bands
- NFC scan as primary input + manual entry fallback
- Dialog launched from both Bands tab and Activity tab
- Scan bands back-to-back into a bucket/list
- Batch select and tag from system-wide tag list
- Inline edit for optional details (name, email)
- Tag + basic info (name, email) per band — all optional

## Organizer Metadata Tags

- System-wide predefined tag list (not per-event, not free-form)
- Admin-only tag management (create/edit/delete)
- One tag per band (single assignment, not multi-tag)
- Colored badge display in activity feed and bands tables
- Filterable/sortable by tag
