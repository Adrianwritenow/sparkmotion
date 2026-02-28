"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

interface AuditExportButtonProps {
  from: string | undefined;
  to: string | undefined;
  userId: string | undefined;
  action: string | undefined;
  resource: string | undefined;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = row[h] ?? "";
          const str = String(val);
          return str.includes(",") || str.includes('"') || str.includes("\n")
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(",")
    ),
  ];
  return lines.join("\n");
}

export function AuditExportButton({
  from,
  to,
  userId,
  action,
  resource,
}: AuditExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const utils = trpc.useUtils();

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const data = await utils.auditLogs.export.fetch({
        from,
        to,
        userId,
        action,
        resource,
      });

      if (!data || data.length === 0) {
        toast.info("No audit log entries to export");
        return;
      }

      const csvRows = data.map((row) => ({
        Timestamp: row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt),
        "User Email": row.user?.email ?? "",
        "User Name": row.user?.name ?? "",
        Action: row.action,
        Resource: row.resource,
        "Resource ID": row.resourceId ?? "",
        "IP Address": row.ipAddress ?? "",
        "User Agent": row.userAgent ?? "",
      }));

      const csv = toCsv(csvRows as Record<string, unknown>[]);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success(`Exported ${data.length} audit log entries`);
    } catch {
      toast.error("Failed to export audit logs");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button variant="outline" onClick={handleExport} disabled={isExporting}>
      <Download className="mr-2 h-4 w-4" />
      {isExporting ? "Exporting..." : "Export CSV"}
    </Button>
  );
}
