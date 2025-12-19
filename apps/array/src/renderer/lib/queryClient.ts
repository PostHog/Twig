import { MutationCache, QueryClient } from "@tanstack/react-query";
import { toast } from "@utils/toast";

export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "An error occurred";
      toast.error("Operation failed", { description: message });
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
    },
  },
});
