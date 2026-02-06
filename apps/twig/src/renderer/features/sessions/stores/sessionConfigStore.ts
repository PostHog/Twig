import type { SessionConfigOption } from "@agentclientprotocol/sdk";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { electronStorage } from "@/renderer/lib/electronStorage";

interface SessionConfigState {
  configsByRunId: Record<string, SessionConfigOption[]>;
  setConfigOptions: (taskRunId: string, options: SessionConfigOption[]) => void;
  getConfigOptions: (taskRunId: string) => SessionConfigOption[] | undefined;
  removeConfigOptions: (taskRunId: string) => void;
}

export const useSessionConfigStore = create<SessionConfigState>()(
  persist(
    (set, get) => ({
      configsByRunId: {},
      setConfigOptions: (taskRunId, options) =>
        set((state) => ({
          configsByRunId: { ...state.configsByRunId, [taskRunId]: options },
        })),
      getConfigOptions: (taskRunId) => get().configsByRunId[taskRunId],
      removeConfigOptions: (taskRunId) =>
        set((state) => {
          const { [taskRunId]: _removed, ...rest } = state.configsByRunId;
          return { configsByRunId: rest };
        }),
    }),
    {
      name: "session-config-storage",
      storage: electronStorage,
      partialize: (state) => ({ configsByRunId: state.configsByRunId }),
    },
  ),
);
