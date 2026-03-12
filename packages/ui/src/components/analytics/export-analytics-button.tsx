"use client";

import { useState, type RefObject } from "react";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Download, FileSpreadsheet, FileText, FileArchive, ChevronDown } from "lucide-react";
import { format } from "date-fns";

interface SummaryData {
  bandCount: number;
  tapCount: number;
  uniqueBands: number;
  eventCount?: number;
  breakdown?: Array<{
    eventId: string;
    name: string;
    location: string | null;
    bandCount: number;
    tapCount: number;
    engagementPercent: number;
  }>;
}

interface OverviewSummaryData {
  bandCount: number;
  tapCount: number;
  uniqueBands: number;
  repeatBands?: number;
  engagementPercent?: number;
  eventCount?: number;
}

interface PerEventData {
  events: Array<{
    eventId: string;
    name: string;
    location: string | null;
    bandCount: number;
    tapCount: number;
    engagementPercent: number;
  }>;
  engagement: Array<{ date: string; eventId: string; interactions: number }>;
  registration: Array<{ date: string; eventId: string; count: number }>;
  uniqueTaps: Array<{ date: string; eventId: string; uniqueCount: number }>;
}

interface ExportAnalyticsButtonProps {
  entityName: string;
  orgName: string;
  summary: SummaryData | null | undefined;
  engagement: Array<{ date: string; interactions: number }> | null | undefined;
  windowTaps: Array<{ name: string; count: number }> | null | undefined;
  redirectTypes?: Array<{ category: string; count: number }> | null;
  registrationGrowth?: Array<{ date: string; count: number }> | null;
  uniqueTaps?: Array<{ date: string; uniqueCount: number }> | null;
  reEngagedCount?: number | null;
  overviewSummary?: OverviewSummaryData | null;
  dateRangeLabel?: string;
  perEventData?: PerEventData | null;
  captureRef?: RefObject<HTMLElement | null>;
}

/**
 * Aggregate rows that share the same date label by summing the value key.
 * Fixes duplicate dates from hourly granularity (e.g. multiple "Feb 24" entries).
 */
function aggregateByDate<T extends Record<string, unknown>>(
  rows: T[],
  dateKey: string,
  valueKey: string,
): Array<{ date: string; value: number }> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const d = String(row[dateKey]);
    map.set(d, (map.get(d) ?? 0) + (Number(row[valueKey]) || 0));
  }
  return Array.from(map.entries()).map(([date, value]) => ({ date, value }));
}

/**
 * Collapse runs of 3+ consecutive zero-value rows into a single summary row.
 */
function collapseZeroRuns(
  rows: Array<{ date: string; value: number }>,
): Array<{ date: string; value: number; skippedDays?: number }> {
  const result: Array<{ date: string; value: number; skippedDays?: number }> = [];
  let i = 0;

  while (i < rows.length) {
    const row = rows[i]!;
    if (row.value !== 0) {
      result.push(row);
      i++;
      continue;
    }

    const runStart = i;
    while (i < rows.length && rows[i]!.value === 0) {
      i++;
    }
    const runLen = i - runStart;

    if (runLen >= 3) {
      const startDate = rows[runStart]!.date;
      const endDate = rows[i - 1]!.date;
      result.push({
        date: `${startDate} – ${endDate}`,
        value: 0,
        skippedDays: runLen,
      });
    } else {
      for (let j = runStart; j < i; j++) {
        result.push(rows[j]!);
      }
    }
  }

  return result;
}

/**
 * Write a date-series as 2 horizontal CSV rows (dates header + values row).
 */
function writeHorizontalSection(
  lines: string[],
  title: string,
  valueLabel: string,
  rawRows: Array<Record<string, unknown>>,
  dateKey: string,
  valueKey: string,
): void {
  if (!rawRows || rawRows.length === 0) return;

  const aggregated = aggregateByDate(rawRows, dateKey, valueKey);
  const collapsed = collapseZeroRuns(aggregated);

  if (collapsed.length === 0) return;

  const total = aggregated.reduce((sum, r) => sum + r.value, 0);

  lines.push("");
  lines.push("");
  lines.push(`"${title.toUpperCase()}"`);

  const dateHeaders = collapsed.map((r) => `"${r.date}"`);
  lines.push(`"",${dateHeaders.join(",")},"TOTAL"`);

  const values = collapsed.map((r) =>
    r.skippedDays ? `"0 (${r.skippedDays} days)"` : `"${r.value}"`,
  );
  lines.push(`"${valueLabel}",${values.join(",")},"${total}"`);
}

interface TimeSeriesInput {
  label: string;
  rows: Array<Record<string, unknown>>;
  dateKey: string;
  valueKey: string;
}

/**
 * Merge multiple date-series into a single table with one shared date header.
 * Dates are unioned across all series; zero-runs are collapsed only when ALL
 * series are zero for those consecutive dates.
 */
function writeUnifiedTimeSeries(
  lines: string[],
  title: string,
  series: TimeSeriesInput[],
): void {
  const validSeries = series.filter((s) => s.rows && s.rows.length > 0);
  if (validSeries.length === 0) return;

  // Aggregate each series independently
  const aggregatedSeries = validSeries.map((s) =>
    aggregateByDate(s.rows, s.dateKey, s.valueKey),
  );

  // Union all dates in order (preserve insertion order from first appearance)
  const allDates: string[] = [];
  const seen = new Set<string>();
  for (const agg of aggregatedSeries) {
    for (const row of agg) {
      if (!seen.has(row.date)) {
        seen.add(row.date);
        allDates.push(row.date);
      }
    }
  }

  if (allDates.length === 0) return;

  // Build value maps for each series
  const valueMaps = aggregatedSeries.map((agg) => {
    const m = new Map<string, number>();
    for (const r of agg) m.set(r.date, r.value);
    return m;
  });

  // Collapse zero-runs only when ALL series are zero for those dates
  type UnifiedCol = { date: string; skippedDays?: number };
  const columns: UnifiedCol[] = [];
  let i = 0;
  while (i < allDates.length) {
    const allZero = valueMaps.every((m) => (m.get(allDates[i]!) ?? 0) === 0);
    if (!allZero) {
      columns.push({ date: allDates[i]! });
      i++;
      continue;
    }
    const runStart = i;
    while (
      i < allDates.length &&
      valueMaps.every((m) => (m.get(allDates[i]!) ?? 0) === 0)
    ) {
      i++;
    }
    const runLen = i - runStart;
    if (runLen >= 3) {
      columns.push({
        date: `${allDates[runStart]!} – ${allDates[i - 1]!}`,
        skippedDays: runLen,
      });
    } else {
      for (let j = runStart; j < i; j++) {
        columns.push({ date: allDates[j]! });
      }
    }
  }

  // Write section
  lines.push("");
  lines.push("");
  lines.push(`"${title}"`);

  const dateHeaders = columns.map((c) => `"${c.date}"`);
  lines.push(`"",${dateHeaders.join(",")},"TOTAL"`);

  for (let s = 0; s < validSeries.length; s++) {
    const total = aggregatedSeries[s]!.reduce((sum, r) => sum + r.value, 0);
    const vals = columns.map((col) => {
      if (col.skippedDays) return `"0 (${col.skippedDays} days)"`;
      return `"${valueMaps[s]!.get(col.date) ?? 0}"`;
    });
    lines.push(`"${validSeries[s]!.label}",${vals.join(",")},"${total}"`);
  }
}

function writeSummarySection(
  lines: string[],
  data: OverviewSummaryData | SummaryData,
  reEngagedCount?: number | null,
): void {
  const rate = data.bandCount > 0
    ? Math.round((data.uniqueBands / data.bandCount) * 100)
    : 0;
  const hasEvents = "eventCount" in data && data.eventCount !== undefined;
  const hasReEng = reEngagedCount != null && data.uniqueBands > 0;
  const reEngRate = hasReEng
    ? Math.round((reEngagedCount / data.uniqueBands) * 100)
    : 0;
  const avgTaps = data.bandCount > 0
    ? (data.tapCount / data.bandCount).toFixed(1)
    : "0.0";

  lines.push("");
  lines.push('"SUMMARY"');

  // Header row
  const headers: string[] = [];
  if (hasEvents) headers.push('"Events"');
  headers.push('"Registrations"', '"Interactions"', '"Unique Bands"', '"Engagement Rate"');
  if (hasReEng) headers.push('"Re-engagement"');
  headers.push('"Avg Taps/Band"');
  lines.push(headers.join(","));

  // Values row
  const values: string[] = [];
  if (hasEvents) values.push(`"${(data as OverviewSummaryData).eventCount}"`);
  values.push(`"${data.bandCount}"`, `"${data.tapCount}"`, `"${data.uniqueBands}"`, `"${rate}%"`);
  if (hasReEng) values.push(`"${reEngRate}%"`);
  values.push(`"${avgTaps}"`);
  lines.push(values.join(","));
}

function writeWindowTapsHorizontal(
  lines: string[],
  windowTaps: Array<{ name: string; count: number }>,
): void {
  if (!windowTaps || windowTaps.length === 0) return;
  const total = windowTaps.reduce((sum, w) => sum + w.count, 0);
  lines.push("");
  lines.push("");
  lines.push('"TAPS BY WINDOW"');
  const headers = windowTaps.map((w) => `"${w.name}"`);
  lines.push(`"",${headers.join(",")},"TOTAL"`);
  const values = windowTaps.map((w) => `"${w.count}"`);
  lines.push(`"Taps",${values.join(",")},"${total}"`);
}

function writeRedirectTypesHorizontal(
  lines: string[],
  redirectTypes: Array<{ category: string; count: number }>,
): void {
  if (!redirectTypes || redirectTypes.length === 0) return;
  const total = redirectTypes.reduce((sum, r) => sum + r.count, 0);
  lines.push("");
  lines.push("");
  lines.push('"TAPS BY REDIRECT TYPE"');
  const headers = redirectTypes.map((r) => `"${r.category}"`);
  lines.push(`"",${headers.join(",")},"TOTAL"`);
  const values = redirectTypes.map((r) => `"${r.count}"`);
  lines.push(`"Count",${values.join(",")},"${total}"`);
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportAnalyticsButton({
  entityName,
  orgName,
  summary,
  engagement,
  windowTaps,
  redirectTypes,
  registrationGrowth,
  uniqueTaps,
  reEngagedCount,
  overviewSummary,
  dateRangeLabel,
  perEventData,
  captureRef,
}: ExportAnalyticsButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const hasDateFilter = !!dateRangeLabel;
  const overviewData = overviewSummary ?? summary;

  const buildCsvLines = (): string[] => {
    const lines: string[] = [];

    // Header
    lines.push('"SPARKMOTION ANALYTICS REPORT"');
    lines.push("");
    lines.push(`"Report","${entityName}"`);
    lines.push(`"Organization","${orgName}"`);
    lines.push(`"Generated","${format(new Date(), "MMMM d, yyyy")}"`);

    if (hasDateFilter && overviewData) {
      lines.push("");
      lines.push("");
      lines.push('"--- OVERVIEW (ALL TIME) ---"');
      writeSummarySection(lines, overviewData, reEngagedCount);

      if (windowTaps) writeWindowTapsHorizontal(lines, windowTaps);
      if (redirectTypes) writeRedirectTypesHorizontal(lines, redirectTypes);

      lines.push("");
      lines.push("");
      lines.push(`"--- FILTERED VIEW (${dateRangeLabel}) ---"`);

      const filteredSeries: TimeSeriesInput[] = [];
      if (engagement) filteredSeries.push({ label: "Interactions", rows: engagement, dateKey: "date", valueKey: "interactions" });
      if (registrationGrowth) filteredSeries.push({ label: "New Registrations", rows: registrationGrowth, dateKey: "date", valueKey: "count" });
      if (uniqueTaps) filteredSeries.push({ label: "Unique Taps", rows: uniqueTaps, dateKey: "date", valueKey: "uniqueCount" });
      writeUnifiedTimeSeries(lines, "DAILY ACTIVITY", filteredSeries);
    } else {
      if (summary) {
        lines.push("");
        writeSummarySection(lines, summary, reEngagedCount);
      }

      if (windowTaps) writeWindowTapsHorizontal(lines, windowTaps);
      if (redirectTypes) writeRedirectTypesHorizontal(lines, redirectTypes);

      const allSeries: TimeSeriesInput[] = [];
      if (engagement) allSeries.push({ label: "Interactions", rows: engagement, dateKey: "date", valueKey: "interactions" });
      if (registrationGrowth) allSeries.push({ label: "New Registrations", rows: registrationGrowth, dateKey: "date", valueKey: "count" });
      if (uniqueTaps) allSeries.push({ label: "Unique Taps", rows: uniqueTaps, dateKey: "date", valueKey: "uniqueCount" });
      writeUnifiedTimeSeries(lines, "DAILY ACTIVITY", allSeries);
    }

    // Event Breakdown (campaigns only)
    if (summary?.breakdown && summary.breakdown.length > 0) {
      const totalBands = summary.breakdown.reduce((s, e) => s + e.bandCount, 0);
      const totalTaps = summary.breakdown.reduce((s, e) => s + e.tapCount, 0);
      lines.push("");
      lines.push("");
      lines.push('"EVENT BREAKDOWN"');
      lines.push('"Event","Location","Bands","Taps","Engagement %"');
      for (const event of summary.breakdown) {
        lines.push(
          `"${event.name}","${event.location ?? ""}","${event.bandCount}","${event.tapCount}","${event.engagementPercent}%"`,
        );
      }
      lines.push(`"","","TOTAL: ${totalBands}","TOTAL: ${totalTaps}",""`);
    }

    return lines;
  };

  const handleExportCsv = () => {
    const lines = buildCsvLines();
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const slug = slugify(entityName);
    const dateStr = format(new Date(), "yyyy-MM-dd");
    downloadBlob(blob, `${slug}-analytics-${dateStr}.csv`);
  };

  const handleExportZip = async () => {
    if (!perEventData) return;
    setIsExporting(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const slug = slugify(entityName);
      const dateStr = format(new Date(), "yyyy-MM-dd");

      // Campaign overview CSV
      const overviewLines = buildCsvLines();
      zip.file(`${slug}-overview.csv`, overviewLines.join("\n"));

      // Per-event CSVs
      for (const ev of perEventData.events) {
        const evLines: string[] = [];
        const evSlug = slugify(ev.name);

        evLines.push('"SPARKMOTION ANALYTICS REPORT"');
        evLines.push("");
        evLines.push(`"Report","${ev.name}"`);
        evLines.push(`"Campaign","${entityName}"`);
        evLines.push(`"Organization","${orgName}"`);
        evLines.push(`"Generated","${format(new Date(), "MMMM d, yyyy")}"`);

        // Event summary as horizontal KPI table
        const evAvgTaps = ev.bandCount > 0
          ? (ev.tapCount / ev.bandCount).toFixed(1)
          : "0.0";
        evLines.push("");
        evLines.push('"SUMMARY"');
        const evHeaders = ['"Registrations"', '"Interactions"', '"Engagement Rate"', '"Avg Taps/Band"'];
        const evValues = [`"${ev.bandCount}"`, `"${ev.tapCount}"`, `"${ev.engagementPercent}%"`, `"${evAvgTaps}"`];
        if (ev.location) {
          evHeaders.unshift('"Location"');
          evValues.unshift(`"${ev.location}"`);
        }
        evLines.push(evHeaders.join(","));
        evLines.push(evValues.join(","));

        const evEngagement = perEventData.engagement
          .filter((r) => r.eventId === ev.eventId)
          .map((r) => ({ date: r.date, interactions: r.interactions }));
        const evRegistration = perEventData.registration
          .filter((r) => r.eventId === ev.eventId)
          .map((r) => ({ date: r.date, count: r.count }));
        const evUniqueTaps = perEventData.uniqueTaps
          .filter((r) => r.eventId === ev.eventId)
          .map((r) => ({ date: r.date, uniqueCount: r.uniqueCount }));

        const evSeries: TimeSeriesInput[] = [];
        if (evEngagement.length > 0) evSeries.push({ label: "Interactions", rows: evEngagement, dateKey: "date", valueKey: "interactions" });
        if (evRegistration.length > 0) evSeries.push({ label: "New Registrations", rows: evRegistration, dateKey: "date", valueKey: "count" });
        if (evUniqueTaps.length > 0) evSeries.push({ label: "Unique Taps", rows: evUniqueTaps, dateKey: "date", valueKey: "uniqueCount" });
        writeUnifiedTimeSeries(evLines, "DAILY ACTIVITY", evSeries);

        zip.file(`${evSlug}.csv`, evLines.join("\n"));
      }

      const blob = await zip.generateAsync({ type: "blob" });
      downloadBlob(blob, `${slug}-analytics-${dateStr}.zip`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdf = async () => {
    const target = captureRef?.current;
    if (!target) return;

    setIsExporting(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");

      const canvas = await html2canvas(target, {
        scale: 2,
        useCORS: true,
        logging: false,
      });

      const imgData = canvas.toDataURL("image/png");
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;

      const orientation = imgWidth > imgHeight ? "l" : "p";
      const pdf = new jsPDF(orientation, "px", [imgWidth, imgHeight]);
      pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);

      const slug = slugify(entityName);
      const dateStr = format(new Date(), "yyyy-MM-dd");
      pdf.save(`${slug}-analytics-${dateStr}.pdf`);
    } finally {
      setIsExporting(false);
    }
  };

  const hasData = !!(summary || engagement || windowTaps);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={!hasData || isExporting}>
          <Download className="mr-2 h-4 w-4" />
          {isExporting ? "Exporting..." : "Export"}
          <ChevronDown className="ml-2 h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleExportCsv}>
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Export as CSV
        </DropdownMenuItem>
        {perEventData && (
          <DropdownMenuItem onClick={handleExportZip}>
            <FileArchive className="mr-2 h-4 w-4" />
            Export as ZIP
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={handleExportPdf} disabled={!captureRef}>
          <FileText className="mr-2 h-4 w-4" />
          Export as PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
