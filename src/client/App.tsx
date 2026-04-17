import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      // Disable automatic background refetches to conserve free-tier quota.
      // Data is still fetched on first mount and after invalidateQueries().
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      // refetchOnMount: true,  // keep — first mount should fetch fresh data
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
