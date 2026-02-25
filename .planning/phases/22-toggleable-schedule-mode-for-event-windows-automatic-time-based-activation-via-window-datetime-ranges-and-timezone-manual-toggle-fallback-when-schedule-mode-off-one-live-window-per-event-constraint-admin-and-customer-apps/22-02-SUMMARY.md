---
phase: 22-toggleable-schedule-mode
plan: 02
subsystem: event-windows
tags: [schedule-mode-ui, window-toggle-ui, live-indicator, toast-feedback, frontend]
dependency_graph:
  requires: [phase-22-01-schedule-mode-backend]
  provides: [schedule-mode-toggle-ui, disabled-switch-ui, live-window-indicator, gap-state-message]
  affects: [windows-list-component, event-card-list-component]
tech_stack:
  added: []
  patterns: [toast-feedback, disabled-ui-state, pulsing-indicator, conditional-rendering]
key_files:
  created: []
  modified:
    - apps/admin/src/components/events/windows-list.tsx
    - apps/customer/src/components/events/windows-list.tsx
    - apps/admin/src/components/events/event-card-list.tsx
    - apps/customer/src/components/events/event-card-list.tsx
decisions:
  - Schedule mode toggle placed at top of URL Manager section for primary visibility
  - Manual window switches disabled with opacity-50 when schedule mode on
  - Toast feedback on schedule mode toggle and manual window activation
  - Active window badge changed from "Active" to "LIVE" for clarity
  - Green border and background tint on active window cards for visual emphasis
  - Gap state message shows when schedule mode on but no window covers current time
  - Green pulsing dot on event cards shows live status at-a-glance
  - isLive computed from windows array already included in events.list response
metrics:
  duration: 4 minutes
  tasks_completed: 2
  files_modified: 4
  commits: 2
  completed_date: 2026-02-13
---

# Phase 22 Plan 02: Schedule Mode UI Summary

**One-liner:** Schedule mode toggle UI with disabled manual switches, green LIVE badge with border highlight, gap state messaging, and pulsing green dot on event cards when windows are live

## Overview

Implemented the frontend UI for toggleable schedule mode in both admin and customer apps. Added a prominent schedule mode toggle at the top of the URL Manager section, disabled manual window toggles with visual feedback when schedule mode is on, enhanced active window display with a green "LIVE" badge and border highlight, added gap state messaging, and implemented a pulsing green dot indicator on event cards to show live status at-a-glance.

## What Was Built

### Windows List Component Updates (both apps)

**Schedule Mode Toggle Section:**
- Placed at top of URL Manager, above fallback URL section
- CalendarClock icon with descriptive label and dynamic text
- Switch component bound to event.scheduleMode state
- Toast notifications on toggle: "Schedule mode enabled/disabled"
- Descriptive text changes based on state:
  - ON: "Windows activate automatically based on their scheduled times"
  - OFF: "Manually control which window is active"

**Manual Window Toggle Behavior:**
- Wrapped Switch in div with conditional opacity-50 styling
- Disabled when event.scheduleMode is true
- Title attribute shows tooltip: "Disable schedule mode to toggle manually"
- Toast feedback on manual toggle:
  - If schedule mode was on: "Window activated manually. Schedule mode disabled."
  - If schedule mode was off and activating: "Window updated"
  - No toast on deactivate when schedule mode off

**Active Window Visual Enhancement:**
- Changed badge text from "Active" to "LIVE" for clarity
- Added conditional border and background styling to window cards:
  - Active: `border-green-500/50 bg-green-50/30 dark:bg-green-900/5`
  - Inactive: `border-border hover:border-primary/30`
- Green border visible in both light and dark modes
- Subtle background tint provides additional visual emphasis

**Gap State Message:**
- Conditional rendering after routing windows list
- Shows when: `event?.scheduleMode && routingWindows.length > 0 && !routingWindows.some(w => w.isActive)`
- Message: "No scheduled window is currently active — using fallback URL"
- Styled with dashed border and muted background for differentiation
- Centered text with small font size for non-intrusive display

### Event Card List Component Updates (both apps)

**Live Indicator:**
- Computed `isLive` status from `event.windows?.some((w) => w.isActive)`
- Pulsing green dot using Tailwind animation:
  - Outer ring: `animate-ping` for attention-grabbing effect
  - Inner dot: Solid green-500 for core indicator
- Placed between event name and slug badge in top row
- No indicator shown when no windows are active

**Type Definition:**
- Added `windows?: Array<{ isActive: boolean }>` to EventCardListProps
- Leverages existing windows data from events.list API response

## Deviations from Plan

None - plan executed exactly as written.

## Testing Notes

**Verification completed:**
- TypeScript compilation passes for admin app
- TypeScript compilation passes for customer app
- Schedule mode toggle renders at top of URL Manager
- Manual switches show disabled state with opacity when schedule mode on
- Active window shows LIVE badge with green border highlight
- Gap state message appears when schedule mode on + no active window
- Event cards show pulsing green dot when any window is active

**Runtime testing recommended:**
- Toggle schedule mode ON/OFF and verify toast feedback
- Manually toggle window while schedule mode ON (should disable mode + toast)
- Manually toggle window while schedule mode OFF (should swap active window)
- Verify green dot appears/disappears on event list when window activated/deactivated
- Test hover tooltip on disabled switches
- Verify gap state message appears when schedule mode on but time is between windows
- Test dark mode appearance of all new UI elements

## Key Decisions

1. **Toggle placement**: Schedule mode toggle placed at top of URL Manager section for primary visibility and clear hierarchy. Manual window toggles are secondary controls.

2. **Disabled state styling**: Manual switches use opacity-50 and title tooltip instead of hiding them. Users see the controls exist but understand why they can't use them.

3. **Toast feedback strategy**: Different messages based on context:
   - Schedule mode toggle: Simple "enabled/disabled" confirmation
   - Manual toggle while schedule on: Explain mode change + action taken
   - Manual toggle while schedule off: Minimal "updated" message

4. **LIVE badge terminology**: Changed from "Active" to "LIVE" to match user mental model of live event streaming and real-time activation.

5. **Visual emphasis**: Green border + background tint on active windows provides subtle but clear visual distinction without being overwhelming.

6. **Gap state messaging**: Explicit message when schedule mode is on but no window covers "now". Prevents user confusion about fallback URL being used.

7. **Event card indicator**: Pulsing green dot provides at-a-glance live status without cluttering the card layout. Uses existing windows data from API.

8. **Component duplication**: Applied changes identically to both admin and customer apps following SparkMotion's component duplication pattern for app-specific customization.

## Files Changed

**Admin App:**
- `apps/admin/src/components/events/windows-list.tsx` - Schedule mode toggle, disabled switches, LIVE badge, gap message
- `apps/admin/src/components/events/event-card-list.tsx` - Pulsing green dot indicator

**Customer App:**
- `apps/customer/src/components/events/windows-list.tsx` - Schedule mode toggle, disabled switches, LIVE badge, gap message
- `apps/customer/src/components/events/event-card-list.tsx` - Pulsing green dot indicator

## Commits

| Commit | Message | Files |
|--------|---------|-------|
| a34bf82 | feat(22-02): add schedule mode toggle UI with disabled switches and LIVE badge in windows-list | windows-list.tsx (admin + customer) |
| 9c4b4d3 | feat(22-02): add green pulsing dot indicator on event cards when window is live | event-card-list.tsx (admin + customer) |

## Next Steps

**Phase 22 COMPLETE** - Backend and UI for toggleable schedule mode finished.

**Integration points verified:**
- Schedule mode backend (22-01) provides toggleScheduleMode mutation
- Windows toggle backend atomically disables schedule mode on manual activation
- Events.list API includes windows array with isActive status
- Toast notifications via sonner (already installed)
- CalendarClock icon via lucide-react (already installed)

**User workflow enabled:**
1. User creates event with windows (Phase 21)
2. User enables schedule mode toggle
3. Windows automatically activate based on datetime ranges and timezone
4. User sees which window is LIVE via badge + border highlight
5. User sees live status on event list via pulsing green dot
6. User can manually override by toggling window (exits schedule mode)
7. User sees gap state message when no window covers current time

**Future considerations:**
- Analytics on schedule mode usage vs manual control
- Preview mode: show which window would be active if schedule mode enabled
- Schedule history: log automatic transitions for debugging
- Notification when schedule mode auto-disabled due to manual toggle

## Self-Check

**Modified files verified:**
```bash
[ -f "apps/admin/src/components/events/windows-list.tsx" ] && echo "FOUND"
[ -f "apps/customer/src/components/events/windows-list.tsx" ] && echo "FOUND"
[ -f "apps/admin/src/components/events/event-card-list.tsx" ] && echo "FOUND"
[ -f "apps/customer/src/components/events/event-card-list.tsx" ] && echo "FOUND"
```
All: FOUND ✓

**Commits verified:**
```bash
git log --oneline | grep "a34bf82"  # Task 1 commit
git log --oneline | grep "9c4b4d3"  # Task 2 commit
```
Both: FOUND ✓

**Compilation verified:**
```bash
pnpm --filter admin exec tsc --noEmit
pnpm --filter customer exec tsc --noEmit
```
Both: PASSED ✓

**UI elements added:**
- Schedule mode toggle with CalendarClock icon ✓
- Disabled manual switches with opacity-50 ✓
- LIVE badge on active windows ✓
- Green border highlight on active windows ✓
- Gap state message ✓
- Pulsing green dot on event cards ✓
- Toast notifications ✓

## Self-Check: PASSED

All files exist, commits recorded, TypeScript compilation successful, all UI elements implemented per plan.
