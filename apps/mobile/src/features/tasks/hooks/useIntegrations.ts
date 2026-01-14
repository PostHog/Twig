import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/features/auth";
import { getGithubRepositories, getIntegrations } from "../api";

export const integrationKeys = {
  all: ["integrations"] as const,
  lists: () => [...integrationKeys.all, "list"] as const,
  github: () => [...integrationKeys.all, "github"] as const,
  repos: (integrationId: number) =>
    [...integrationKeys.all, "repos", integrationId] as const,
};

export function useIntegrations() {
  const { projectId, oauthAccessToken } = useAuthStore();

  const integrationsQuery = useQuery({
    queryKey: integrationKeys.github(),
    queryFn: async () => {
      const data = await getIntegrations();
      return data.filter((i) => i.kind === "github");
    },
    enabled: !!projectId && !!oauthAccessToken,
  });

  const githubIntegrations = integrationsQuery.data ?? [];

  const repositoriesQuery = useQuery({
    queryKey: [
      ...integrationKeys.all,
      "repos",
      githubIntegrations.map((i) => i.id),
    ],
    queryFn: async () => {
      const allRepos: string[] = [];
      for (const integration of githubIntegrations) {
        const repos = await getGithubRepositories(integration.id);
        allRepos.push(...repos);
      }
      return allRepos.sort();
    },
    enabled: githubIntegrations.length > 0,
  });

  const refetch = async () => {
    await integrationsQuery.refetch();
    await repositoriesQuery.refetch();
  };

  return {
    hasGithubIntegration: integrationsQuery.isFetched
      ? githubIntegrations.length > 0
      : null,
    githubIntegrations,
    repositories: repositoriesQuery.data ?? [],
    isLoading: integrationsQuery.isLoading || repositoriesQuery.isLoading,
    error:
      integrationsQuery.error?.message ??
      repositoriesQuery.error?.message ??
      null,
    refetch,
  };
}
