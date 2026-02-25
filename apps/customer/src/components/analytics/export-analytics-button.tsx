"use client";

import { useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileSpreadsheet, FileImage, ChevronDown } from "lucide-react";
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

interface ExportAnalyticsButtonProps {
  entityName: string;
  orgName: string;
  summary: SummaryData | null | undefined;
  engagement: Array<{ date: string; interactions: number }> | null | undefined;
  windowTaps: Array<{ name: string; count: number }> | null | undefined;
  /** Ref to the DOM element to capture for PDF export */
  captureRef?: RefObject<HTMLElement | null>;
}

export function ExportAnalyticsButton({
  entityName,
  orgName,
  summary,
  engagement,
  windowTaps,
  captureRef,
}: ExportAnalyticsButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExportCsv = () => {
    const lines: string[] = [];

    // Header
    lines.push(`"Report","${entityName}"`);
    lines.push(`"Organization","${orgName}"`);
    lines.push(`"Generated","${format(new Date(), "MMMM d, yyyy")}"`);
    lines.push("");

    // Summary
    if (summary) {
      lines.push('"Summary"');
      if (summary.eventCount !== undefined) {
        lines.push(`"Total Events","${summary.eventCount}"`);
      }
      lines.push(`"Total Registrations","${summary.bandCount}"`);
      lines.push(`"Total Interactions","${summary.tapCount}"`);
      lines.push(`"Unique Bands Engaged","${summary.uniqueBands}"`);
      const rate = summary.bandCount > 0
        ? Math.round((summary.uniqueBands / summary.bandCount) * 100)
        : 0;
      lines.push(`"Engagement Rate","${rate}%"`);
      lines.push("");
    }

    // Engagement by Hour
    if (engagement && engagement.length > 0) {
      lines.push('"Engagement by Date"');
      lines.push('"Date","Interactions"');
      for (const row of engagement) {
        lines.push(`"${row.date}","${row.interactions}"`);
      }
      lines.push("");
    }

    // Taps by Window
    if (windowTaps && windowTaps.length > 0) {
      lines.push('"Taps by Window"');
      lines.push('"Window","Taps"');
      for (const row of windowTaps) {
        lines.push(`"${row.name}","${row.count}"`);
      }
      lines.push("");
    }

    // Event Breakdown (campaigns only)
    if (summary?.breakdown && summary.breakdown.length > 0) {
      lines.push('"Event Breakdown"');
      lines.push('"Event","Location","Bands","Taps","Engagement %"');
      for (const event of summary.breakdown) {
        lines.push(
          `"${event.name}","${event.location ?? ""}","${event.bandCount}","${event.tapCount}","${event.engagementPercent}%"`
        );
      }
      lines.push("");
    }

    // Download
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const slug = entityName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const dateStr = format(new Date(), "yyyy-MM-dd");
    a.href = url;
    a.download = `${slug}-analytics-${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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

      const slug = entityName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
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
        <DropdownMenuItem onClick={handleExportPdf} disabled={!captureRef}>
          <FileImage className="mr-2 h-4 w-4" />
          Export as PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
