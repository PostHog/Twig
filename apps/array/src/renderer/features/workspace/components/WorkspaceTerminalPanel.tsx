import { Terminal } from "@features/terminal/components/Terminal";
import { Box } from "@radix-ui/themes";
import { useCallback } from "react";
import { useWorkspaceTerminalStore } from "../stores/workspaceTerminalStore";

interface WorkspaceTerminalPanelProps {
  sessionId: string;
}

export function WorkspaceTerminalPanel({
  sessionId,
}: WorkspaceTerminalPanelProps) {
  const updateTerminalStatus = useWorkspaceTerminalStore(
    (s) => s.updateTerminalStatus,
  );

  const handleExit = useCallback(() => {
    updateTerminalStatus(sessionId, "completed");
  }, [sessionId, updateTerminalStatus]);

  return (
    <Box height="100%">
      <Terminal
        sessionId={sessionId}
        persistenceKey={sessionId}
        onExit={handleExit}
      />
    </Box>
  );
}
