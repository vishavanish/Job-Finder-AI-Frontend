/**
 * Server state for F3+ screens (spec §4: TanStack Query). One client per app
 * instance; tests get a fresh one per render. Errors are shown by each screen.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

function makeQueryClient(): QueryClient {
  const testing = import.meta.env.MODE === "test";
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: testing ? false : 1,
        refetchOnWindowFocus: false,
        staleTime: 15_000,
      },
      mutations: { retry: false },
    },
  });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(makeQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
