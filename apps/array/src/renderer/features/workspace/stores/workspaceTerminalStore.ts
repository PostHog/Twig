import type { WorkspaceTerminalInfo } from "@shared/types";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { omitKey } from "@/renderer/utils/object";

interface WorkspaceTerminalState {
  workspaceTerminals: Record<string, string[]>;
  terminalInfo: Record<string, WorkspaceTerminalInfo>;

  registerTerminal: (
    taskId: string,
    terminalInfo: WorkspaceTerminalInfo,
  ) => void;
  updateTerminalStatus: (
    sessionId: string,
    status: "running" | "completed" | "failed",
    exitCode?: number,
  ) => void;
  clearWorkspaceTerminals: (taskId: string) => void;
  getTerminalsForTask: (taskId: string) => WorkspaceTerminalInfo[];
  areTerminalsRunning: (taskId: string) => boolean;
}

export const useWorkspaceTerminalStore = create<WorkspaceTerminalState>()(
  persist(
    (set, get) => ({
      workspaceTerminals: {},
      terminalInfo: {},

      registerTerminal: (taskId: string, info: WorkspaceTerminalInfo) => {
        set((state) => {
          const existingSessions = state.workspaceTerminals[taskId] || [];
          return {
            workspaceTerminals: {
              ...state.workspaceTerminals,
              [taskId]: [...existingSessions, info.sessionId],
            },
            terminalInfo: {
              ...state.terminalInfo,
              [info.sessionId]: info,
            },
          };
        });
      },

      updateTerminalStatus: (
        sessionId: string,
        status: "running" | "completed" | "failed",
        exitCode?: number,
      ) => {
        set((state) => {
          const existing = state.terminalInfo[sessionId];
          if (!existing) return state;

          return {
            terminalInfo: {
              ...state.terminalInfo,
              [sessionId]: {
                ...existing,
                status,
                exitCode,
              },
            },
          };
        });
      },

      clearWorkspaceTerminals: (taskId: string) => {
        set((state) => {
          const sessionsToRemove = state.workspaceTerminals[taskId] || [];
          let newTerminalInfo = state.terminalInfo;
          for (const sessionId of sessionsToRemove) {
            newTerminalInfo = omitKey(newTerminalInfo, sessionId);
          }

          return {
            workspaceTerminals: omitKey(state.workspaceTerminals, taskId),
            terminalInfo: newTerminalInfo,
          };
        });
      },

      getTerminalsForTask: (taskId: string) => {
        const state = get();
        const sessionIds = state.workspaceTerminals[taskId] || [];
        return sessionIds
          .map((id) => state.terminalInfo[id])
          .filter((info): info is WorkspaceTerminalInfo => !!info);
      },

      areTerminalsRunning: (taskId: string) => {
        const terminals = get().getTerminalsForTask(taskId);
        return terminals.some((t) => t.status === "running");
      },
    }),
    {
      name: "workspace-terminal-store",
      partialize: (state) => ({
        workspaceTerminals: state.workspaceTerminals,
        terminalInfo: state.terminalInfo,
      }),
    },
  ),
);
