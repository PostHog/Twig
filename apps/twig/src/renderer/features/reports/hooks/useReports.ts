import { useAuthenticatedQuery } from "@hooks/useAuthenticatedQuery";
import type {
  SignalReportArtefactsResponse,
  SignalReportsResponse,
} from "@shared/types";

const reportKeys = {
  all: ["signal-reports"] as const,
  list: () => [...reportKeys.all, "list"] as const,
  artefacts: (reportId: string) =>
    [...reportKeys.all, reportId, "artefacts"] as const,
};

export function useReports(options?: { enabled?: boolean }) {
  return useAuthenticatedQuery<SignalReportsResponse>(
    reportKeys.list(),
    (client) => client.getSignalReports(),
    options,
  );
}

export function useReportArtefacts(reportId: string) {
  return useAuthenticatedQuery<SignalReportArtefactsResponse>(
    reportKeys.artefacts(reportId),
    (client) => client.getSignalReportArtefacts(reportId),
    { enabled: !!reportId },
  );
}
