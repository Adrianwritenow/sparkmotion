'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface LiveKpiCardsProps {
  data: {
    totalTaps: number;
    uniqueTaps: number;
    mode: string;
  } | null;
  isStale: boolean;
}

export function LiveKpiCards({ data, isStale }: LiveKpiCardsProps) {
  if (!data) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const getModeBadgeClasses = (mode: string) => {
    const modeUpper = mode.toUpperCase();
    if (modeUpper === 'PRE') {
      return 'bg-blue-100 text-blue-800 border-blue-200';
    }
    if (modeUpper === 'LIVE') {
      return 'bg-green-100 text-green-800 border-green-200';
    }
    if (modeUpper === 'POST') {
      return 'bg-gray-100 text-gray-800 border-gray-200';
    }
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Taps
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${isStale ? 'opacity-50' : ''}`}>
            {data.totalTaps.toLocaleString()}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Unique Bands
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${isStale ? 'opacity-50' : ''}`}>
            {data.uniqueTaps.toLocaleString()}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Current Mode
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className={isStale ? 'opacity-50' : ''}>
            <Badge
              className={getModeBadgeClasses(data.mode)}
              variant="outline"
            >
              {data.mode.toUpperCase()}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
