import { useAuthenticatedQuery } from "@hooks/useAuthenticatedQuery";
import type { SignalReferencesResponse } from "@shared/types";
import { signalKeys } from "./useSignals";

export function useSignalReferences(
  signalId: string,
  options?: { enabled?: boolean },
) {
  return useAuthenticatedQuery(
    signalKeys.references(signalId),
    (client) =>
      client.getSignalReferences(signalId) as Promise<SignalReferencesResponse>,
    { ...options, enabled: !!signalId && (options?.enabled ?? true) },
  );
}
