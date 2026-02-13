import { useAuthenticatedMutation } from "@hooks/useAuthenticatedMutation";
import { useAuthenticatedQuery } from "@hooks/useAuthenticatedQuery";
import { useAuthStore } from "@renderer/features/auth/stores/authStore";
import type { RepoAutonomyStatus } from "@shared/types";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  buildReadyRepoCacheKey,
  useInboxReadinessCacheStore,
} from "../stores/inboxReadinessCacheStore";

const READYNESS_STALE_TIME_MS = 10 * 60 * 1000;
const READYNESS_GC_TIME_MS = 30 * 60 * 1000;

const readinessKeys = {
  all: ["inbox", "setup", "repo-readiness"] as const,
  repo: (projectId: number, repository: string, windowDays: number) =>
    [
      ...readinessKeys.all,
      projectId,
      repository.toLowerCase(),
      windowDays,
    ] as const,
};

export function useInboxRepoReadiness(
  repository: string,
  options?: { windowDays?: number },
) {
  const projectId = useAuthStore((state) => state.projectId);
  const queryClient = useQueryClient();
  const normalizedRepository = repository.toLowerCase();
  const windowDays = options?.windowDays ?? 7;
  const [activeRequest, setActiveRequest] = useState<
    "evaluate" | "refresh" | null
  >(null);

  const cacheKey =
    projectId === null
      ? null
      : buildReadyRepoCacheKey(projectId, normalizedRepository, windowDays);

  const readyCacheEntry = useInboxReadinessCacheStore((state) =>
    cacheKey ? state.readyByKey[cacheKey] : undefined,
  );
  const setReadyStatus = useInboxReadinessCacheStore(
    (state) => state.setReadyStatus,
  );
  const clearReadyStatus = useInboxReadinessCacheStore(
    (state) => state.clearReadyStatus,
  );

  const query = useAuthenticatedQuery<RepoAutonomyStatus>(
    readinessKeys.repo(projectId ?? -1, normalizedRepository, windowDays),
    (client) =>
      client.getRepositoryReadiness(normalizedRepository, {
        windowDays,
      }) as Promise<RepoAutonomyStatus>,
    {
      enabled: false,
      staleTime: READYNESS_STALE_TIME_MS,
      gcTime: READYNESS_GC_TIME_MS,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  );

  useEffect(() => {
    if (!projectId || !query.data) return;
    if (query.data.overall === "ready") {
      setReadyStatus(projectId, normalizedRepository, windowDays, query.data);
    } else {
      clearReadyStatus(projectId, normalizedRepository, windowDays);
    }
  }, [
    projectId,
    query.data,
    normalizedRepository,
    windowDays,
    setReadyStatus,
    clearReadyStatus,
  ]);

  const requestMutation = useAuthenticatedMutation(
    (client, variables: { refresh: boolean }) =>
      client.getRepositoryReadiness(normalizedRepository, {
        windowDays,
        refresh: variables.refresh,
      }) as Promise<RepoAutonomyStatus>,
    {
      onSuccess: (status) => {
        if (!projectId) return;
        queryClient.setQueryData(
          readinessKeys.repo(projectId, normalizedRepository, windowDays),
          status,
        );
        if (status.overall === "ready") {
          setReadyStatus(projectId, normalizedRepository, windowDays, status);
        } else {
          clearReadyStatus(projectId, normalizedRepository, windowDays);
        }
      },
    },
  );

  const evaluate = async (): Promise<RepoAutonomyStatus | undefined> => {
    if (!projectId) return undefined;
    if (readyCacheEntry) return readyCacheEntry.status;

    const existing = queryClient.getQueryData<RepoAutonomyStatus>(
      readinessKeys.repo(projectId, normalizedRepository, windowDays),
    );
    if (existing) return existing;

    setActiveRequest("evaluate");
    try {
      return await requestMutation.mutateAsync({ refresh: false });
    } finally {
      setActiveRequest(null);
    }
  };

  const refresh = async (): Promise<RepoAutonomyStatus | undefined> => {
    if (!projectId) return undefined;
    clearReadyStatus(projectId, normalizedRepository, windowDays);
    setActiveRequest("refresh");
    try {
      return await requestMutation.mutateAsync({ refresh: true });
    } finally {
      setActiveRequest(null);
    }
  };

  return {
    status: readyCacheEntry?.status ?? query.data,
    isReadyFromCache: !!readyCacheEntry,
    isLoading: activeRequest === "evaluate" && requestMutation.isPending,
    isFetching: requestMutation.isPending,
    isEvaluating: activeRequest === "evaluate" && requestMutation.isPending,
    isRefreshing: activeRequest === "refresh" && requestMutation.isPending,
    error: query.error ?? requestMutation.error,
    evaluate,
    refresh,
  };
}
