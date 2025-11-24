import { create } from "zustand";
import { persist } from "zustand/middleware";

interface TerminalState {
  serializedState: string | null;
  sessionId: string | null;
}

interface TerminalStoreState {
  terminalStates: Record<string, TerminalState>;
  getTerminalState: (key: string) => TerminalState | undefined;
  setSerializedState: (key: string, state: string) => void;
  setSessionId: (key: string, sessionId: string) => void;
  clearTerminalState: (key: string) => void;
}

const DEFAULT_TERMINAL_STATE: TerminalState = {
  serializedState: null,
  sessionId: null,
};

export const useTerminalStore = create<TerminalStoreState>()(
  persist(
    (set, get) => ({
      terminalStates: {},

      getTerminalState: (key: string) => {
        return get().terminalStates[key] || DEFAULT_TERMINAL_STATE;
      },

      setSerializedState: (key: string, state: string) => {
        set((prev) => ({
          terminalStates: {
            ...prev.terminalStates,
            [key]: {
              ...prev.terminalStates[key],
              serializedState: state,
            },
          },
        }));
      },

      setSessionId: (key: string, sessionId: string) => {
        set((prev) => ({
          terminalStates: {
            ...prev.terminalStates,
            [key]: {
              ...prev.terminalStates[key],
              sessionId,
            },
          },
        }));
      },

      clearTerminalState: (key: string) => {
        set((prev) => {
          const newStates = { ...prev.terminalStates };
          delete newStates[key];
          return { terminalStates: newStates };
        });
      },
    }),
    {
      name: "terminal-store",
      partialize: (state) => ({
        terminalStates: state.terminalStates,
      }),
    },
  ),
);
