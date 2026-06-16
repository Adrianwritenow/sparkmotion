"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { trpc } from "./trpc";

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    // networkMode "always": run queries/mutations regardless of navigator.onLine.
    // Some browsers (notably macOS/Chrome after VPN or sleep) falsely report
    // onLine === false, which pauses every query and freezes data-fetching pages.
    // This app is always server-backed, so the online gate adds no value.
    defaultOptions: {
      queries: { refetchOnWindowFocus: false, networkMode: "always" },
      mutations: { networkMode: "always" },
    },
  }));
  const [trpcClient] = useState(() =>
    trpc.createClient({
      transformer: superjson,
      links: [
        httpBatchLink({
          url: "/api/trpc",
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
