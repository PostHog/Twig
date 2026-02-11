import { useRepositoryIntegration } from "@hooks/useIntegrations";
import { useProjectQuery } from "@hooks/useProjectQuery";

interface TeamWithAutonomyFlags {
  session_recording_opt_in?: boolean;
  autocapture_exceptions_opt_in?: boolean | null;
}

export function useInboxRepoStatus() {
  const { githubIntegration, repositories } = useRepositoryIntegration();
  const projectQuery = useProjectQuery();

  const team = projectQuery.data as TeamWithAutonomyFlags | undefined;
  const sessionReplayEnabled = team?.session_recording_opt_in === true;
  const errorTrackingEnabled = team?.autocapture_exceptions_opt_in === true;

  return {
    hasGithubIntegration: !!githubIntegration,
    githubIntegrationId: githubIntegration?.id,
    repositories: [...repositories].sort((a, b) => a.localeCompare(b)),
    projectStatus: {
      sessionReplayEnabled,
      errorTrackingEnabled,
    },
    isLoading: projectQuery.isLoading,
    error: projectQuery.error,
  };
}
