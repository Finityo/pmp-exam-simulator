import { QueryClient } from "@tanstack/react-query";

// The app's one shared QueryClient. The standalone build keeps the same
// observable caching behavior the hosted version had: query data stays
// fresh for 30 seconds and does not refetch on window focus. The ported
// local actions in ./local/actions.ts call invalidateQueries() on this
// client after writes, mirroring the invalidation the server version
// used to request after each mutation.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});
