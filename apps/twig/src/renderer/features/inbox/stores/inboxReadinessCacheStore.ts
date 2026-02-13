import { electronStorage } from "@renderer/lib/electronStorage";
import type { RepoAutonomyStatus } from "@shared/types";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ReadyRepoCacheEntry {
  projectId: number;
  repository: string;
  windowDays: number;
  status: RepoAutonomyStatus;
  cachedAt: string;
}

interface InboxReadinessCacheState {
  readyByKey: Record<string, ReadyRepoCacheEntry>;
  setReadyStatus: (
    projectId: number,
    repository: string,
    windowDays: number,
    status: RepoAutonomyStatus,
  ) => void;
  clearReadyStatus: (
    projectId: number,
    repository: string,
    windowDays: number,
  ) => void;
  clearProjectReadyStatuses: (projectId: number) => void;
}

export function buildReadyRepoCacheKey(
  projectId: number,
  repository: string,
  windowDays: number,
): string {
  return `${projectId}:${repository.toLowerCase()}:${windowDays}`;
}

export const useInboxReadinessCacheStore = create<InboxReadinessCacheState>()(
  persist(
    (set) => ({
      readyByKey: {},
      setReadyStatus: (projectId, repository, windowDays, status) => {
        if (status.overall !== "ready") return;
        const key = buildReadyRepoCacheKey(projectId, repository, windowDays);
        set((state) => ({
          readyByKey: {
            ...state.readyByKey,
            [key]: {
              projectId,
              repository: repository.toLowerCase(),
              windowDays,
              status,
              cachedAt: new Date().toISOString(),
            },
          },
        }));
      },
      clearReadyStatus: (projectId, repository, windowDays) => {
        const key = buildReadyRepoCacheKey(projectId, repository, windowDays);
        set((state) => {
          const next = { ...state.readyByKey };
          delete next[key];
          return { readyByKey: next };
        });
      },
      clearProjectReadyStatuses: (projectId) =>
        set((state) => {
          const next: Record<string, ReadyRepoCacheEntry> = {};
          for (const [key, entry] of Object.entries(state.readyByKey)) {
            if (entry.projectId !== projectId) {
              next[key] = entry;
            }
          }
          return { readyByKey: next };
        }),
    }),
    {
      name: "inbox-readiness-ready-cache-v1",
      storage: electronStorage,
      partialize: (state) => ({ readyByKey: state.readyByKey }),
    },
  ),
);
