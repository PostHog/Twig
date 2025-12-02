import { useCallback, useMemo, useRef } from "react";
import { secureRandomString } from "@/renderer/utils/random";
import { useTerminalStore } from "../stores/terminalStore";
import { Terminal } from "./Terminal";

interface ShellTerminalProps {
  cwd?: string;
  stateKey?: string;
}

export function ShellTerminal({ cwd, stateKey }: ShellTerminalProps) {
  const persistenceKey = stateKey || cwd || "default";
  const renderCount = useRef(0);
  renderCount.current++;

  const savedState = useTerminalStore(
    (state) => state.terminalStates[persistenceKey],
  );

  const sessionId = useMemo(() => {
    if (savedState?.sessionId) {
      return savedState.sessionId;
    }
    const newId = `shell-${Date.now()}-${secureRandomString(7)}`;
    useTerminalStore.getState().setSessionId(persistenceKey, newId);
    return newId;
  }, [savedState?.sessionId, persistenceKey]);

  const handleStateChange = useCallback(
    (serializedState: string) => {
      useTerminalStore
        .getState()
        .setSerializedState(persistenceKey, serializedState);
    },
    [persistenceKey],
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
