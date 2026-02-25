'use client';
import { trpc } from "@/lib/trpc";

type ConnectionState = 'connecting' | 'connected' | 'disconnected';

export function useEventStream(eventId: string | null) {
  const { data, isLoading, isError, refetch } = trpc.analytics.live.useQuery(
    { eventId: eventId! },
    {
      enabled: !!eventId,
      refetchInterval: 5000,
    }
  );

  const connectionState: ConnectionState = !eventId ? 'disconnected'
    : isLoading ? 'connecting'
    : isError ? 'disconnected'
    : 'connected';

  return {
    connectionState,
    data: data ?? null,
    lastUpdated: data ? new Date() : null,
    retry: refetch,
  };
}
