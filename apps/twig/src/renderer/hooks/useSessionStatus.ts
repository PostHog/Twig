import type {
  SessionCapabilities,
  SessionStatus,
} from "@main/services/agent/schemas";
import { trpcReact } from "@/renderer/trpc";

export function useSessionStatus(taskRunId: string | undefined) {
  return trpcReact.agent.getSessionStatus.useQuery(
    { sessionId: taskRunId ?? "" },
    { enabled: !!taskRunId },
  ) as ReturnType<typeof trpcReact.agent.getSessionStatus.useQuery> & {
    data: SessionStatus | null | undefined;
  };
}

export function useSessionCapabilities(taskRunId: string | undefined): {
  data: SessionCapabilities | undefined;
  isLoading: boolean;
  isError: boolean;
} {
  const { data: status, isLoading, isError } = useSessionStatus(taskRunId);
  return {
    data: status?.capabilities,
    isLoading,
    isError,
  };
}

export function useExecutionEnvironment(taskRunId: string | undefined): {
  data: SessionStatus["executionEnvironment"] | undefined;
  isTransitioning: boolean | undefined;
  isLoading: boolean;
  isError: boolean;
} {
  const { data: status, isLoading, isError } = useSessionStatus(taskRunId);
  return {
    data: status?.executionEnvironment,
    isTransitioning: status?.isTransitioning,
    isLoading,
    isError,
  };
}
