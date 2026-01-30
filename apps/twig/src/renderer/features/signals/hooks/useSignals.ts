import { useAuthenticatedMutation } from "@hooks/useAuthenticatedMutation";
import { useAuthenticatedQuery } from "@hooks/useAuthenticatedQuery";
import { useNavigationStore } from "@renderer/stores/navigationStore";
import type { Signal } from "@shared/types";
import { useQueryClient } from "@tanstack/react-query";

export const signalKeys = {
  all: ["signals"] as const,
  lists: () => [...signalKeys.all, "list"] as const,
  list: () => [...signalKeys.lists()] as const,
  details: () => [...signalKeys.all, "detail"] as const,
  detail: (id: string) => [...signalKeys.details(), id] as const,
  references: (id: string) => [...signalKeys.detail(id), "references"] as const,
};

export function useSignals(options?: { enabled?: boolean }) {
  return useAuthenticatedQuery(
    signalKeys.list(),
    (client) => client.getSignals() as Promise<Signal[]>,
    options,
  );
}

export function useSignal(signalId: string, options?: { enabled?: boolean }) {
  return useAuthenticatedQuery(
    signalKeys.detail(signalId),
    (client) => client.getSignal(signalId) as Promise<Signal>,
    { ...options, enabled: !!signalId && (options?.enabled ?? true) },
  );
}

export function useDeleteSignal() {
  const queryClient = useQueryClient();
  const { view, navigateToTaskInput } = useNavigationStore();

  return useAuthenticatedMutation(
    async (client, signalId: string) => {
      return client.deleteSignal(signalId);
    },
    {
      onMutate: async (signalId) => {
        await queryClient.cancelQueries({ queryKey: signalKeys.lists() });

        const previousSignals = queryClient.getQueryData<Signal[]>(
          signalKeys.list(),
        );

        queryClient.setQueryData<Signal[]>(signalKeys.list(), (old) =>
          old?.filter((signal) => signal.id !== signalId),
        );

        return { previousSignals };
      },
      onError: (_err, _signalId, context) => {
        const ctx = context as { previousSignals?: Signal[] } | undefined;
        if (ctx?.previousSignals) {
          queryClient.setQueryData(signalKeys.list(), ctx.previousSignals);
        }
      },
      onSettled: (_data, _error, signalId) => {
        queryClient.invalidateQueries({ queryKey: signalKeys.lists() });

        if (view.type === "signal-preview" && view.data?.id === signalId) {
          navigateToTaskInput();
        }
      },
    },
  );
}
