# Plan: Fix Timezone Handling in Analytics

## Problem

Three stacking timezone bugs cause hourly charts to show UTC times instead of event-local times, making "Today" views miss/misplace taps:

1. **`useTz` skips hourly/minute** — `tzExpr()` and `buildSeriesSql()` skip `AT TIME ZONE` for hourly granularity, so SQL buckets taps in UTC
2. **`formatGranularLabel` hardcodes `timeZone: "UTC"`** — even daily buckets that ARE shifted in SQL get their labels rendered in UTC (currently works by accident since the shifted timestamp is stored as-if-UTC)
3. **Campaigns have no timezone control** — `tzExpr()` uses `e."timezone"` per-event, but campaigns span multiple timezones with no way for users to pick a display timezone

## Changes

### 1. Backend — `packages/api/src/routers/analytics.ts`

#### a) Always apply timezone in SQL (remove `useTz` guard)

For **event-level** queries (`engagementByHour`, `registrationGrowth`, `engagementByWindow`, `uniqueTapsTimeline`):
- Remove `const useTz = granularity !== "hourly" && granularity !== "minute"`
- Always apply `AT TIME ZONE 'UTC' AT TIME ZONE ${tz}` in `truncExpr`
- Always apply timezone in `seriesStart`/`seriesEnd`
- Keep `::date` cast only for daily+ granularities (not hourly/minute)

SQL for hourly becomes:
```sql
DATE_TRUNC('hour', "tappedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')
-- returns timestamp without tz in event's local time
```

#### b) `tzExpr()` — accept explicit timezone string

Current: uses `e."timezone"` from Event JOIN (only works when Event is joined).
New: accept optional `tz` string parameter. When provided, use it directly instead of `e."timezone"`.

```typescript
function tzExpr(col: string, g: Granularity, tz?: string): Prisma.Sql {
  const tzRef = tz ? `'${tz}'` : `e."timezone"`;
  return Prisma.raw(`${col} AT TIME ZONE 'UTC' AT TIME ZONE ${tzRef}`);
}
```

Remove the hourly/minute skip — always convert.

#### c) `buildSeriesSql()` — accept timezone string

Add `tz?: string` parameter. Apply `AT TIME ZONE` for all granularities.
Keep `::date` cast only for daily+ (non-hourly/minute).

#### d) Campaign queries — accept `timezone` input

Add `timezone: z.string().optional()` to `campaignAnalyticsFilterInput`.

In `campaignEngagementByHour`, `campaignRegistrationGrowth`, `campaignUniqueTapsTimeline`:
- Pass `input.timezone` to `tzExpr()` and `buildSeriesSql()`
- If no timezone provided, default to `"UTC"`

#### e) `formatGranularLabel` — no change needed

The label uses `timeZone: "UTC"` which is correct: after `AT TIME ZONE` conversion, Postgres returns a `timestamp without time zone` that the JS driver reads as UTC. The value IS already in event-local time, just stored as-if-UTC. So `timeZone: "UTC"` correctly renders it.

### 2. Frontend — Campaign timezone selector

#### a) `campaign-analytics.tsx` — add timezone `Select` dropdown

- New prop: `eventTimezones: Array<{ id: string; name: string; timezone: string }>`
- State: `const [displayTimezone, setDisplayTimezone] = useState(browserTz)`
- Deduplicate timezones from event list, show as Select options with friendly labels
- Default to browser timezone (via `Intl.DateTimeFormat().resolvedOptions().timeZone`)
- Pass `timezone: displayTimezone` to all campaign tRPC queries
- Place Select next to the existing event filter dropdown

#### b) Pass event timezones from page → component

**Admin** `campaign-detail-tabs.tsx` (line 104):
```typescript
eventNames={(campaign.events ?? [])
  .filter(e => e.status === "ACTIVE" || e.status === "COMPLETED")
  .map(e => ({ id: e.id, name: e.name, timezone: e.timezone }))}
```

**Customer** `campaign-detail-tabs.tsx` — same change.

The `timezone` field is already included in the Prisma query (full `include` on events).

#### c) `date-range-filter.tsx` — accept optional timezone

Add optional `timezone?: string` prop. When provided, compute "Today" and other presets relative to that timezone instead of browser local time. Use `@date-fns/tz` `TZDate` for timezone-aware date construction.

### 3. Event-level — pass timezone to DateRangeFilter

`events-analytics.tsx` already receives `eventTimezone`. Pass it to `DateRangeFilter` so "Today" = today in the event's timezone.

## Files to Modify

1. `packages/api/src/routers/analytics.ts` — timezone SQL fixes + campaign timezone input
2. `packages/ui/src/components/campaigns/campaign-analytics.tsx` — timezone selector + pass to queries
3. `packages/ui/src/components/events/events-analytics.tsx` — pass eventTimezone to DateRangeFilter
4. `packages/ui/src/components/date-range-filter.tsx` — timezone-aware presets
5. `apps/admin/src/components/campaigns/campaign-detail-tabs.tsx` — pass event timezones
6. `apps/customer/src/components/campaigns/campaign-detail-tabs.tsx` — pass event timezones

## Verification

1. Event "Today" view — hours should show in event's local timezone, LIVE taps visible
2. Event "All time" — daily labels should match event-local dates
3. Campaign with timezone selector — switching timezone shifts hourly labels
4. Campaign default — shows data in browser timezone
5. "Today" preset in event context — midnight-to-midnight in event timezone
