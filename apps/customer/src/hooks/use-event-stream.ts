'use client';
import { useState, useEffect, useRef, useCallback } from 'react';

type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

interface TapUpdate {
  totalTaps: number;
  uniqueTaps: number;
  mode: string;
}

interface EventStreamState {
  connectionState: ConnectionState;
  data: TapUpdate | null;
  lastUpdated: Date | null;
}

export function useEventStream(eventId: string | null): EventStreamState & { retry: () => void } {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [data, setData] = useState<TapUpdate | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const retryCountRef = useRef(0);
  const mountedRef = useRef(true);

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!eventId) {
      setConnectionState('disconnected');
      return;
    }

    cleanup();
    setConnectionState(retryCountRef.current > 0 ? 'reconnecting' : 'connecting');

    const eventSource = new EventSource(`/api/sse/events?eventId=${eventId}`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      if (!mountedRef.current) return;
      setConnectionState('connected');
      retryCountRef.current = 0;
    };

    eventSource.addEventListener('tap-update', (event) => {
      if (!mountedRef.current) return;
      try {
        const update = JSON.parse(event.data) as TapUpdate;
        setData(update);
        setLastUpdated(new Date());
      } catch (error) {
        console.error('Failed to parse tap update:', error);
      }
    });

    eventSource.onerror = () => {
      if (!mountedRef.current) return;

      if (retryCountRef.current < 5) {
        setConnectionState('reconnecting');
        retryCountRef.current += 1;
        // EventSource auto-reconnects (browser default ~3s)
      } else {
        cleanup();
        setConnectionState('disconnected');
      }
    };
  }, [eventId, cleanup]);

  const retry = useCallback(() => {
    retryCountRef.current = 0;
    connect();
  }, [connect]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [connect, cleanup]);

  return {
    connectionState,
    data,
    lastUpdated,
    retry,
  };
}
