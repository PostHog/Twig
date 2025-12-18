import { MessageEditor } from "@features/message-editor/components/MessageEditor";
import { useMessageEditorStore } from "@features/message-editor/stores/messageEditorStore";
import type { Plan } from "@features/sessions/types";
import { Box, ContextMenu, Flex } from "@radix-ui/themes";
import {
  type AcpMessage,
  isJsonRpcNotification,
} from "@shared/types/session-events";
import { useCallback, useMemo, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import {
  useSessionViewActions,
  useShowRawLogs,
} from "../stores/sessionViewStore";
import { ConversationView } from "./ConversationView";
import { PlanStatusBar } from "./PlanStatusBar";
import { RawLogsView } from "./raw-logs/RawLogsView";

interface SessionViewProps {
  events: AcpMessage[];
  taskId?: string;
  isRunning: boolean;
  isPromptPending?: boolean;
  onSendPrompt: (text: string) => void;
  onBashCommand?: (command: string) => void;
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
  onBashCommand,
  onCancelPrompt,
  repoPath,
  isCloud = false,
}: SessionViewProps) {
  const showRawLogs = useShowRawLogs();
  const { setShowRawLogs } = useSessionViewActions();

  const sessionId = taskId ?? "default";
  const setContext = useMessageEditorStore((s) => s.actions.setContext);
  setContext(sessionId, {
    taskId,
    repoPath,
    disabled: !isRunning,
    isLoading: isPromptPending,
    isCloud,
  });

  useHotkeys("escape", onCancelPrompt, { enabled: isPromptPending }, [
    onCancelPrompt,
  ]);

  const latestPlan = useMemo((): Plan | null => {
    for (let i = events.length - 1; i >= 0; i--) {
      const msg = events[i].message;
      if (isJsonRpcNotification(msg) && msg.method === "session/update") {
        const update = (msg.params as { update?: { sessionUpdate?: string } })
          ?.update;
        if (update?.sessionUpdate === "plan") {
          return update as Plan;
        }
      }
    }
    return null;
  }, [events]);

  const handleSubmit = useCallback(
    (text: string) => {
      if (text.trim()) {
        onSendPrompt(text);
      }
    },
    [onSendPrompt],
  );

  const [isBashMode, setIsBashMode] = useState(false);

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger>
        <Flex direction="column" height="100%" className="bg-gray-1">
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

          <PlanStatusBar plan={latestPlan} />

          <Box
            className={
              isBashMode
                ? "border border-accent-9 p-2"
                : "border-gray-4 border-t p-2"
            }
          >
            <MessageEditor
              sessionId={sessionId}
              placeholder="Type a message... @ to mention files, ! for bash mode"
              onSubmit={handleSubmit}
              onBashCommand={onBashCommand}
              onBashModeChange={setIsBashMode}
              onCancel={onCancelPrompt}
            />
          </Box>
        </Flex>
      </ContextMenu.Trigger>
      <ContextMenu.Content size="1">
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
