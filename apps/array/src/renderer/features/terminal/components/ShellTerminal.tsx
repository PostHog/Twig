import { useCallback, useMemo } from "react";
import { secureRandomString } from "@/renderer/utils/random";
import { useTerminalStore } from "../stores/terminalStore";
import { Terminal } from "./Terminal";

interface ShellTerminalProps {
  cwd?: string;
  stateKey?: string;
}

export function ShellTerminal({ cwd, stateKey }: ShellTerminalProps) {
  const terminalStore = useTerminalStore();
  const persistenceKey = stateKey || cwd || "default";

  const savedState = terminalStore.getTerminalState(persistenceKey);

  const sessionId = useMemo(() => {
    if (savedState?.sessionId) {
      return savedState.sessionId;
    }
    const newId = `shell-${Date.now()}-${secureRandomString(7)}`;
    terminalStore.setSessionId(persistenceKey, newId);
    return newId;
  }, [savedState?.sessionId, persistenceKey, terminalStore]);

  const handleStateChange = useCallback(
    (serializedState: string) => {
      terminalStore.setSerializedState(persistenceKey, serializedState);
    },
    [persistenceKey, terminalStore],
  );

  return (
    <Terminal
      sessionId={sessionId}
      cwd={cwd}
      createSession
      persistState
      initialState={savedState?.serializedState ?? undefined}
      onStateChange={handleStateChange}
    />
  );
}
