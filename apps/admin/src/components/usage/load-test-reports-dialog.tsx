"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ReportDetail } from "./report-detail";

interface LoadTestReportsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LoadTestReportsDialog({
  open,
  onOpenChange,
}: LoadTestReportsDialogProps) {
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadTestType, setUploadTestType] = useState("redirect");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [parsedJson, setParsedJson] = useState<Record<string, any> | null>(null);

  const utils = trpc.useUtils();
  const { data: reports, isLoading } = trpc.loadTestReports.list.useQuery(undefined, {
    enabled: open,
  });

  const importMutation = trpc.loadTestReports.import.useMutation({
    onSuccess: () => {
      toast.success("Report imported");
      setUploadName("");
      setUploadTestType("redirect");
      setParsedJson(null);
      setUploadError(null);
      setShowUpload(false);
      utils.loadTestReports.list.invalidate();
    },
    onError: (error) => {
      toast.error("Failed to import report");
      console.error("Import error:", error);
    },
  });

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset state on close
      setSelectedReportId(null);
      setShowUpload(false);
      setUploadName("");
      setUploadTestType("redirect");
      setUploadError(null);
      setParsedJson(null);
    }
    onOpenChange(newOpen);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setParsedJson(null);
      setUploadError(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);

        // Validate basic k6 structure
        if (!json.metrics || !json.root_group) {
          setUploadError("Invalid k6 summary JSON: missing 'metrics' or 'root_group' keys");
          setParsedJson(null);
          return;
        }

        setParsedJson(json);
        setUploadError(null);
      } catch (error) {
        setUploadError("Failed to parse JSON file");
        setParsedJson(null);
      }
    };
    reader.readAsText(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsedJson || !uploadName.trim()) {
      return;
    }

    importMutation.mutate({
      name: uploadName.trim(),
      testType: uploadTestType.trim() || "redirect",
      summaryJson: parsedJson,
    });
  };

  const calculatePassFail = (summaryJson: Record<string, any>): "pass" | "fail" => {
    const metrics = summaryJson.metrics || {};

    for (const metricKey of Object.keys(metrics)) {
      const metric = metrics[metricKey];
      if (metric.thresholds) {
        for (const thresholdKey of Object.keys(metric.thresholds)) {
          const threshold = metric.thresholds[thresholdKey];
          if (threshold.ok === false) {
            return "fail";
          }
        }
      }
    }

    return "pass";
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Load Test Reports</DialogTitle>
        </DialogHeader>

        {/* Detail View */}
        {selectedReportId && (
          <div>
            <Button
              variant="ghost"
              onClick={() => setSelectedReportId(null)}
              className="mb-4"
            >
              ← Back to list
            </Button>
            <ReportDetail reportId={selectedReportId} />
          </div>
        )}

        {/* Upload View */}
        {!selectedReportId && showUpload && (
          <div>
            <Button
              variant="ghost"
              onClick={() => setShowUpload(false)}
              className="mb-4"
            >
              ← Back to list
            </Button>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="reportName" className="block text-sm font-medium mb-1">
                  Report Name
                </label>
                <Input
                  id="reportName"
                  type="text"
                  placeholder="e.g., Redirect Load - Feb 6"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label htmlFor="testType" className="block text-sm font-medium mb-1">
                  Test Type
                </label>
                <Input
                  id="testType"
                  type="text"
                  placeholder="e.g., redirect, upstash-pipeline"
                  value={uploadTestType}
                  onChange={(e) => setUploadTestType(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="jsonFile" className="block text-sm font-medium mb-1">
                  k6 Summary JSON
                </label>
                <Input
                  id="jsonFile"
                  type="file"
                  accept=".json"
                  onChange={handleFileSelect}
                  required
                />
              </div>

              {uploadError && (
                <p className="text-sm text-destructive">{uploadError}</p>
              )}

              <Button
                type="submit"
                disabled={!parsedJson || !uploadName.trim() || importMutation.isPending}
              >
                {importMutation.isPending ? "Importing..." : "Import Report"}
              </Button>
            </form>
          </div>
        )}

        {/* List View */}
        {!selectedReportId && !showUpload && (
          <div>
            <Button onClick={() => setShowUpload(true)} className="mb-4">
              Import Report
            </Button>

            {isLoading && <Skeleton className="h-64 w-full" />}

            {!isLoading && (!reports || reports.length === 0) && (
              <p className="text-sm text-muted-foreground">
                No load test reports yet. Import a k6 summary JSON to get started.
              </p>
            )}

            {!isLoading && reports && reports.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Test Type</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.map((report) => {
                    const status = calculatePassFail(report.summaryJson as Record<string, any>);
                    return (
                      <TableRow
                        key={report.id}
                        onClick={() => setSelectedReportId(report.id)}
                        className="cursor-pointer hover:bg-muted"
                      >
                        <TableCell className="font-medium">{report.name}</TableCell>
                        <TableCell>{report.testType}</TableCell>
                        <TableCell>
                          {new Date(report.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant={status === "pass" ? "default" : "destructive"}>
                            {status.toUpperCase()}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
