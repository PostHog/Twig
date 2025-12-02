import { Terminal } from "@features/terminal/components/Terminal";
import { Box, Flex, Text } from "@radix-ui/themes";
import { useThemeStore } from "@stores/themeStore";
import { useCallback } from "react";
import { useWorkspaceTerminalStore } from "../stores/workspaceTerminalStore";

interface WorkspaceTerminalPanelProps {
  sessionId: string;
  command: string;
  scriptType: "init" | "start";
}

export function WorkspaceTerminalPanel({
  sessionId,
  command,
  scriptType,
}: WorkspaceTerminalPanelProps) {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const updateTerminalStatus = useWorkspaceTerminalStore(
    (s) => s.updateTerminalStatus,
  );

  const handleExit = useCallback(() => {
    updateTerminalStatus(sessionId, "completed");
  }, [sessionId, updateTerminalStatus]);

  return (
    <Box height="100%" style={{ display: "flex", flexDirection: "column" }}>
      <Flex
        px="3"
        py="2"
        align="center"
        gap="2"
        style={{
          borderBottom: "1px solid var(--gray-a5)",
          backgroundColor: isDarkMode ? "var(--gray-a2)" : "var(--gray-a1)",
        }}
      >
        <Text size="1" color="gray" weight="medium">
          {scriptType === "init" ? "Init" : "Start"}:
        </Text>
        <Text
          size="1"
          style={{
            fontFamily: "monospace",
            opacity: 0.8,
          }}
        >
          {command}
        </Text>
      </Flex>
      <Box style={{ flex: 1 }}>
        <Terminal
          sessionId={sessionId}
          persistenceKey={sessionId}
          onExit={handleExit}
        />
      </Box>
    </Box>
  );
}
