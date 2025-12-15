import { Box, ContextMenu, Flex } from "@radix-ui/themes";
import type { AcpMessage } from "@shared/types/session-events";
import { useCallback } from "react";
import { useKeyboardShortcut } from "../hooks/useKeyboardShortcut";
import {
  useSessionViewActions,
  useShowRawLogs,
} from "../stores/sessionViewStore";
import { ConversationView } from "./ConversationView";
import { MessageEditor } from "./MessageEditor";
import { RawLogsView } from "./raw-logs/RawLogsView";

interface SessionViewProps {
  events: AcpMessage[];
  taskId?: string;
  isRunning: boolean;
  isPromptPending?: boolean;
  onSendPrompt: (text: string) => void;
  onCancelPrompt: () => void;
  repoPath?: string | null;
  isCloud?: boolean;
}

export function SessionView({
  events,
  taskId,
  isRunning,
  isPromptPending = false,
  onSendPrompt,
  onCancelPrompt,
  repoPath,
  isCloud = false,
}: SessionViewProps) {
  const showRawLogs = useShowRawLogs();
  const { setShowRawLogs } = useSessionViewActions();

  useKeyboardShortcut("Escape", onCancelPrompt, { enabled: isPromptPending });

  const handleSubmit = useCallback(
    (text: string) => {
      if (text.trim()) {
        onSendPrompt(text);
      }
    },
    [onSendPrompt],
  );

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger>
        <Flex direction="column" height="100%">
          {showRawLogs ? (
            <RawLogsView events={events} />
          ) : (
            <ConversationView
              events={events}
              isPromptPending={isPromptPending}
              repoPath={repoPath}
              isCloud={isCloud}
            />
          )}

          <Box className="border-gray-6 border-t p-3">
            <MessageEditor
              sessionId={taskId ?? "default"}
              taskId={taskId}
              placeholder="Type a message... @ to mention files"
              repoPath={repoPath}
              disabled={!isRunning}
              isLoading={isPromptPending}
              onSubmit={handleSubmit}
              onCancel={onCancelPrompt}
            />
          </Box>
        </Flex>
      </ContextMenu.Trigger>
      <ContextMenu.Content>
        <ContextMenu.CheckboxItem
          checked={showRawLogs}
          onCheckedChange={setShowRawLogs}
        >
          Show raw logs
        </ContextMenu.CheckboxItem>
      </ContextMenu.Content>
    </ContextMenu.Root>
  );
}
