import { trpcReact } from "@renderer/trpc";
import { useEffect } from "react";

/**
 * Hook to manage the daemon process.
 * Automatically ensures the daemon is running on mount.
 */
export function useDaemon() {
  const utils = trpcReact.useUtils();

  const { data: status, isLoading } = trpcReact.arr.daemonStatus.useQuery(
    undefined,
    { staleTime: 10000, refetchInterval: 30000 },
  );

  const startMutation = trpcReact.arr.daemonStart.useMutation({
    onSuccess: () => {
      utils.arr.daemonStatus.invalidate();
    },
  });

  const stopMutation = trpcReact.arr.daemonStop.useMutation({
    onSuccess: () => {
      utils.arr.daemonStatus.invalidate();
    },
  });

  const ensureMutation = trpcReact.arr.ensureDaemon.useMutation({
    onSuccess: () => {
      utils.arr.daemonStatus.invalidate();
    },
  });

  // Auto-start daemon on mount if not running
  useEffect(() => {
    if (!isLoading && status && !status.running) {
      ensureMutation.mutate();
    }
  }, [isLoading, status?.running, ensureMutation.mutate, status]);

  return {
    status,
    isLoading,
    isRunning: status?.running ?? false,
    start: () => startMutation.mutate(),
    stop: () => stopMutation.mutate(),
    ensure: () => ensureMutation.mutate(),
    isStarting: startMutation.isPending || ensureMutation.isPending,
    isStopping: stopMutation.isPending,
  };
}
