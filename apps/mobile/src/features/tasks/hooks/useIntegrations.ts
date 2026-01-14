import { useCallback, useEffect, useRef, useState } from "react";
import { getGithubRepositories, getIntegrations } from "../api";
import type { Integration } from "../types";

interface UseIntegrationsResult {
  hasGithubIntegration: boolean | null; // null = not yet checked
  githubIntegration: Integration | null;
  repositories: string[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useIntegrations(): UseIntegrationsResult {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [repositories, setRepositories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isFetching = useRef(false);

  const fetchIntegrations = useCallback(async () => {
    if (isFetching.current) return;
    isFetching.current = true;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getIntegrations();
      const githubIntegrations = data.filter((i) => i.kind === "github");
      setIntegrations(githubIntegrations);

      if (githubIntegrations.length > 0) {
        const allRepos: string[] = [];
        for (const integration of githubIntegrations) {
          const repos = await getGithubRepositories(integration.id);
          allRepos.push(...repos);
        }
        setRepositories(allRepos.sort());
      } else {
        setRepositories([]);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch integrations",
      );
    } finally {
      setIsLoading(false);
      setHasFetched(true);
      isFetching.current = false;
    }
  }, []);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  const githubIntegration =
    integrations.find((i) => i.kind === "github") ?? null;

  return {
    hasGithubIntegration: hasFetched ? integrations.length > 0 : null,
    githubIntegration,
    repositories,
    isLoading,
    error,
    refetch: fetchIntegrations,
  };
}
