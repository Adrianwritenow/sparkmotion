"use client";

import { trpc } from "@/lib/trpc";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

interface ReportDetailProps {
  reportId: string;
}

export function ReportDetail({ reportId }: ReportDetailProps) {
  const { data: report, isLoading, error } = trpc.loadTestReports.get.useQuery({ id: reportId });

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (error || !report) {
    return <p className="text-sm text-destructive">Failed to load report</p>;
  }

  const summaryJson = report.summaryJson as Record<string, any>;
  const metrics = summaryJson.metrics || {};
  const state = summaryJson.state || {};
  const rootGroup = summaryJson.root_group || {};

  // Find latency metric (custom trend or http_req_duration)
  let latencyMetric = null;
  let latencyMetricName = "";

  // Look for custom trend with "time" in contains
  for (const [key, metric] of Object.entries(metrics)) {
    const m = metric as any;
    if (m.type === "trend" && m.contains === "time") {
      latencyMetric = m;
      latencyMetricName = key;
      break;
    }
  }

  // Fallback to http_req_duration
  if (!latencyMetric && metrics.http_req_duration) {
    latencyMetric = metrics.http_req_duration;
    latencyMetricName = "http_req_duration";
  }

  // Summary stats
  const totalRequests = metrics.http_reqs?.values?.count || 0;
  const errorRate = metrics.error_rate?.values?.rate || 0;
  const errorRatePercent = (errorRate * 100).toFixed(2);
  const testDurationMs = state.testRunDurationMs || 0;
  const durationMinutes = (testDurationMs / 1000 / 60).toFixed(1);

  // Error rate thresholds
  const errorRateThresholds = metrics.error_rate?.thresholds || {};

  // Latency chart data
  let chartData: { name: string; value: number; threshold?: number }[] = [];
  if (latencyMetric) {
    const values = latencyMetric.values || {};
    chartData = [
      { name: "p50", value: values.med || values.p50 || 0, threshold: 20 },
      { name: "p95", value: values["p(95)"] || 0, threshold: 50 },
      { name: "p99", value: values["p(99)"] || 0, threshold: 100 },
    ];
  }

  const latencyThresholds = latencyMetric?.thresholds || {};

  // Checks
  const checks = rootGroup.checks || [];
  const hasChecks = Array.isArray(checks) && checks.length > 0;

  return (
    <div className="space-y-6">
      {/* Summary Stats Row */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {totalRequests > 0 ? totalRequests.toLocaleString() : "N/A"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Error Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-2xl font-bold">{errorRatePercent}%</p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(errorRateThresholds).map(([key, threshold]: [string, any]) => (
                  <Badge
                    key={key}
                    variant={threshold.ok ? "default" : "destructive"}
                  >
                    {threshold.ok ? "PASS" : "FAIL"}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Duration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{durationMinutes}m</p>
          </CardContent>
        </Card>
      </div>

      {/* Latency Chart */}
      {latencyMetric && chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              Latency Percentiles - {latencyMetricName}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis label={{ value: "Latency (ms)", angle: -90, position: "insideLeft" }} />
                <Tooltip />
                <ReferenceLine
                  y={50}
                  stroke="red"
                  strokeDasharray="3 3"
                  label="p95 SLA"
                />
                <Bar dataKey="value" fill="hsl(221, 83%, 53%)" />
              </BarChart>
            </ResponsiveContainer>

            {/* Threshold badges */}
            <div className="mt-4 flex flex-wrap gap-2">
              {Object.entries(latencyThresholds).map(([key, threshold]: [string, any]) => (
                <Badge
                  key={key}
                  variant={threshold.ok ? "default" : "destructive"}
                >
                  {key}: {threshold.ok ? "PASS" : "FAIL"}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Checks Section */}
      {hasChecks && (
        <Card>
          <CardHeader>
            <CardTitle>Checks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {checks.map((check: any, index: number) => (
                <div key={index} className="flex items-center justify-between text-sm">
                  <span>{check.name}</span>
                  <div className="flex gap-2">
                    <span className="text-green-600 font-medium">
                      {check.passes} passed
                    </span>
                    {check.fails > 0 && (
                      <span className="text-red-600 font-medium">
                        {check.fails} failed
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
