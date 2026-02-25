"use client";

import { useState, useCallback } from "react";
import Papa from "papaparse";
import { z } from "zod";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const bandIdSchema = z.string().min(1).regex(/^[A-Za-z0-9-]+$/);

type Step = "select" | "preview" | "result";

interface ParsedRow {
  row: number;
  bandId: string;
  status: "valid" | "error" | "duplicate";
  message?: string;
}

export function BandCsvUpload({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("select");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [result, setResult] = useState<{ created: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const uploadBatch = trpc.bands.uploadBatch.useMutation();

  const downloadTemplate = () => {
    const csv = "bandId\nBAND-001\nBAND-002\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "band-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        if (!results.meta.fields?.includes("bandId")) {
          setError("CSV must have a 'bandId' column header.");
          return;
        }

        const seen = new Set<string>();
        const parsed: ParsedRow[] = (results.data as Record<string, string>[]).map(
          (row, i) => {
            const bandId = (row.bandId ?? "").trim();
            const validation = bandIdSchema.safeParse(bandId);

            if (!validation.success) {
              return { row: i + 1, bandId, status: "error" as const, message: "Invalid band ID (alphanumeric and hyphens only)" };
            }
            if (seen.has(bandId)) {
              return { row: i + 1, bandId, status: "duplicate" as const, message: "Duplicate in file" };
            }
            seen.add(bandId);
            return { row: i + 1, bandId, status: "valid" as const };
          }
        );

        setRows(parsed);
        setStep("preview");
      },
    });

    e.target.value = "";
  }, []);

  const validRows = rows.filter((r) => r.status === "valid");
  const errorRows = rows.filter((r) => r.status !== "valid");

  const handleConfirm = async () => {
    const bandIds = validRows.map((r) => r.bandId);
    const res = await uploadBatch.mutateAsync({ eventId, bandIds });
    setResult({ created: res.created, total: bandIds.length });
    setStep("result");
    utils.bands.list.invalidate();
  };

  const reset = () => {
    setStep("select");
    setRows([]);
    setResult(null);
    setError(null);
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      reset();
    }
  };

  const selectContent = (
    <div className="space-y-4">
      <div>
        <input
          type="file"
          accept=".csv"
          onChange={handleFile}
          className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-foreground hover:file:bg-primary/90"
        />
      </div>
      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <Button variant="outline" onClick={downloadTemplate}>
        Download Template
      </Button>
    </div>
  );

  const previewContent = (
    <div className="space-y-4">
      <div className="flex gap-4 text-sm">
        <span className="font-medium">{validRows.length} valid</span>
        {errorRows.length > 0 && (
          <span className="font-medium text-destructive">{errorRows.length} errors</span>
        )}
      </div>

      <div className="max-h-96 overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Row</TableHead>
              <TableHead>Band ID</TableHead>
              <TableHead className="w-40">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.row}>
                <TableCell>{r.row}</TableCell>
                <TableCell className="font-mono text-sm">{r.bandId}</TableCell>
                <TableCell>
                  {r.status === "valid" ? (
                    <Badge variant="default">Valid</Badge>
                  ) : (
                    <Badge variant="destructive">
                      {r.message}
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex gap-2">
        <Button onClick={handleConfirm} disabled={validRows.length === 0 || uploadBatch.isPending}>
          {uploadBatch.isPending ? "Importing..." : `Confirm Import (${validRows.length} bands)`}
        </Button>
        <Button variant="outline" onClick={reset}>
          Cancel
        </Button>
      </div>
    </div>
  );

  const resultContent = (
    <div className="space-y-4">
      <div className="text-sm">
        <p><strong>{result?.created}</strong> bands created</p>
        {result && result.total - result.created > 0 && (
          <p className="text-muted-foreground">
            {result.total - result.created} skipped (already existed)
          </p>
        )}
      </div>
      <Button variant="outline" onClick={reset}>
        Upload Another
      </Button>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="default">
          <Upload className="w-4 h-4 mr-2" />
          Upload CSV
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {step === "select" && "Upload Bands CSV"}
            {step === "preview" && "Preview Import"}
            {step === "result" && "Import Complete"}
          </DialogTitle>
        </DialogHeader>
        {step === "select" && selectContent}
        {step === "preview" && previewContent}
        {step === "result" && resultContent}
      </DialogContent>
    </Dialog>
  );
}
