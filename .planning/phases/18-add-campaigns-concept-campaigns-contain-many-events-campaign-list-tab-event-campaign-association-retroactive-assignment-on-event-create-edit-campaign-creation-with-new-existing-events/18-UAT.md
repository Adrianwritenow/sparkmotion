---
status: complete
phase: 18-campaigns
source: 18-01-SUMMARY.md, 18-02-SUMMARY.md, 18-03-SUMMARY.md, 18-04-SUMMARY.md
started: 2026-02-10T19:30:00Z
updated: 2026-02-10T19:58:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Campaigns sidebar navigation
expected: Both admin and customer sidebars show a "Campaigns" item with Megaphone icon, positioned after Events in the navigation.
result: pass

### 2. Admin campaigns list page (empty state)
expected: Navigating to /campaigns in the admin app shows a page with "Campaigns" header, "Manage and monitor all campaigns" subtitle, and a "Create Campaign" button. If no campaigns exist, shows an empty state with dashed border and "No campaigns yet" message.
result: pass

### 3. Admin create campaign dialog
expected: Clicking "Create Campaign" opens a dialog with fields: Organization select, Campaign name, Slug (auto-generated from name on blur), Status (defaults to Draft), Start date, End date. Below the form is an "Associated Events" section with a multi-select dropdown and a "Create New Event" button.
result: pass

### 4. Event multi-select in campaign dialog
expected: The event multi-select shows a searchable dropdown (type to filter). Clicking events toggles selection (check icon appears). Selected events appear as dismissible badges below the dropdown with X buttons to remove.
result: pass

### 5. Create campaign with event association
expected: Filling out the campaign form and selecting existing events, then submitting, creates a campaign and associates the selected events. The dialog closes and the campaigns list refreshes to show the new campaign card.
result: pass

### 6. Campaign card display
expected: Each campaign card shows: campaign name, slug (monospace), status badge (Draft=blue, Active=green, Completed=gray with colored dot), date range (if dates set), organization name, event count with Megaphone icon, and a "View Campaign Details" button.
result: pass

### 7. Admin campaign detail page
expected: Clicking "View Campaign Details" on a campaign card navigates to /campaigns/[id]. Shows a "Back to Campaigns" link, campaign name (large heading), slug badge, status badge, metadata row (org, dates, event count), and three tabs: Overview, Events, Settings.
result: pass

### 8. Campaign Overview tab (edit form)
expected: The Overview tab shows a form pre-filled with campaign data (name, slug, status, dates). Editing fields and saving updates the campaign. Changes are reflected on the page.
result: pass

### 9. Campaign Events tab
expected: The Events tab shows associated events in a card grid layout (using the same event card pattern). If no events are associated, shows "No events associated with this campaign yet."
result: pass

### 10. Admin event create form — campaign dropdown
expected: Creating a new event at /events/new shows an optional "Campaign" dropdown after the Organization field. Options include "No campaign" and all existing campaigns. Selecting a campaign associates the event on creation.
result: pass

### 11. Admin event edit form — campaign dropdown
expected: On the event detail page, the Overview tab's edit form includes a campaign dropdown showing the current campaign (or "No campaign"). Changing to a different campaign or "No campaign" and saving updates the association.
result: pass

### 12. Admin events list — campaign filter
expected: The events list page (/events) shows a "Filter by Campaign" dropdown. Selecting a campaign filters the event list to only show events from that campaign. The URL updates to /events?campaignId=... (bookmarkable). Selecting "All campaigns" clears the filter.
result: pass

### 13. Event cards — campaign subtitle
expected: On the events list, event cards that belong to a campaign show a campaign name subtitle below the event name (with Megaphone icon). Events without a campaign show no subtitle (clean UI).
result: pass

### 14. Event detail — campaign link
expected: On an event detail page, if the event belongs to a campaign, the Overview tab shows a "Campaign:" label with the campaign name as a clickable link. Clicking navigates to /campaigns/[id].
result: pass

### 15. Customer campaigns list page
expected: Customer app at /campaigns shows org-scoped campaigns only (no campaigns from other orgs). Shows card grid, "Create Campaign" button, or empty state. No organization selector visible.
result: pass

### 16. Customer create campaign (no org selector)
expected: Customer "Create Campaign" dialog has fields for name, slug, status, dates — but NO organization dropdown. Campaign is automatically scoped to the customer's organization.
result: pass

### 17. Customer campaign detail with org check
expected: Customer can view their org's campaign detail page with tabs (Overview, Events, Settings). Attempting to access a campaign from another org shows 404.
result: pass

### 18. Customer event forms — campaign dropdown
expected: Customer event create and edit forms both have an optional campaign dropdown listing only the customer's org's campaigns.
result: pass

### 19. Customer events list — campaign filter and subtitles
expected: Customer events list has campaign filter dropdown (org-scoped campaigns only). Event cards show campaign subtitle when associated. Campaign filter works via URL params.
result: pass

### 20. Customer event detail — campaign link
expected: Customer event detail shows clickable campaign link in overview tab when event has a campaign. Link navigates to /campaigns/[id].
result: pass

## Summary

total: 20
passed: 20
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
