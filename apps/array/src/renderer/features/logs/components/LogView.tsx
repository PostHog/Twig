import type { SessionNotification } from "@agentclientprotocol/sdk";
import type { SessionEvent } from "@features/sessions/stores/sessionStore";
import { useAutoScroll } from "@hooks/useAutoScroll";
import {
  Code as CodeIcon,
  Copy as CopyIcon,
  PaperPlaneRight as SendIcon,
  Stop as StopIcon,
} from "@phosphor-icons/react";
import {
  Box,
  Button,
  Code,
  Flex,
  Heading,
  IconButton,
  Text,
  TextArea,
  Tooltip,
} from "@radix-ui/themes";
import { useCallback, useRef, useState } from "react";

interface LogViewProps {
  events: SessionEvent[];
  sessionId: string | null;
  isRunning: boolean;
  onSendPrompt?: (text: string) => Promise<void>;
  onCancelSession?: () => void;
  onStartSession?: () => void;
}

function renderNotification(notification: SessionNotification): string {
  const update = notification.update;
  switch (update.sessionUpdate) {
    case "user_message_chunk":
      return update.content.type === "text"
        ? `You: ${update.content.text}`
        : `You: [${update.content.type}]`;
    case "agent_message_chunk":
      return update.content.type === "text"
        ? update.content.text
        : `[${update.content.type}]`;
    case "tool_call":
      return `\n🔧 ${update.title} (${update.status})`;
    case "tool_call_update":
      return `   └─ ${update.status}`;
    case "agent_thought_chunk":
      return update.content.type === "text" ? `💭 ${update.content.text}` : "";
    case "plan":
      return `📋 Plan: ${JSON.stringify(update)}`;
    case "available_commands_update":
      return "";
    default:
      return `[session_update: ${update.sessionUpdate}]`;
  }
}

export function LogView({
  events,
  sessionId,
  isRunning,
  onSendPrompt,
  onCancelSession,
  onStartSession,
}: LogViewProps) {
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showRawLogs, setShowRawLogs] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { scrollRef } = useAutoScroll({
    contentLength: events.length,
    viewMode: showRawLogs ? "raw" : "pretty",
  });

  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || !onSendPrompt || isSending) return;

    setIsSending(true);
    setInputValue("");

    try {
      await onSendPrompt(text);
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  }, [inputValue, onSendPrompt, isSending]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleCopyLogs = () => {
    const logsText = events
      .map((event) => {
        if (event.type === "session_update") {
          return renderNotification(event.notification);
        }
        if (event.type === "acp_message") {
          return `[${event.direction}] ${JSON.stringify(event.message)}`;
        }
        return JSON.stringify(event);
      })
      .join("\n");
    navigator.clipboard.writeText(logsText);
  };

  // Build rendered output from events (filter out raw acp_message unless showRawLogs is true)
  const renderedOutput: Array<{
    key: string;
    text: string;
    isUserMessage?: boolean;
    isRaw?: boolean;
    rawDirection?: "client" | "agent";
  }> = [];

  for (let idx = 0; idx < events.length; idx++) {
    const event = events[idx];

    if (event.type === "acp_message") {
      if (showRawLogs) {
        renderedOutput.push({
          key: `${event.ts}-${idx}`,
          text: `[${event.direction}] ${JSON.stringify(event.message)}`,
          isRaw: true,
          rawDirection: event.direction,
        });
      }
      continue;
    }

    if (event.type === "session_update") {
      renderedOutput.push({
        key: `${event.ts}-${idx}`,
        text: renderNotification(event.notification),
        isUserMessage:
          event.notification.update.sessionUpdate === "user_message_chunk",
      });
    }
  }

  // Show start session prompt when no session
  if (!sessionId && !isRunning) {
    return (
      <Flex
        direction="column"
        align="center"
        justify="center"
        height="100%"
        p="8"
      >
        <Flex direction="column" align="center" gap="4">
          <Text color="gray">No active session</Text>
          {onStartSession && (
            <Button size="2" onClick={onStartSession}>
              Start Agent Session
            </Button>
          )}
        </Flex>
      </Flex>
    );
  }

  return (
    <Flex direction="column" height="100%">
      {/* Header */}
      <Box p="4" className="border-gray-6 border-b">
        <Flex align="center" justify="between">
          <Heading size="3">Agent Chat</Heading>
          <Flex align="center" gap="3">
            <Tooltip
              content={showRawLogs ? "Show pretty view" : "Show raw ACP logs"}
            >
              <IconButton
                size="2"
                variant={showRawLogs ? "solid" : "ghost"}
                color="gray"
                onClick={() => setShowRawLogs(!showRawLogs)}
              >
                <CodeIcon size={16} />
              </IconButton>
            </Tooltip>

            <Tooltip content="Copy logs">
              <IconButton
                size="2"
                variant="ghost"
                color="gray"
                onClick={handleCopyLogs}
              >
                <CopyIcon size={16} />
              </IconButton>
            </Tooltip>

            {isRunning && onCancelSession && (
              <Tooltip content="Cancel session">
                <Button size="2" color="red" onClick={onCancelSession}>
                  <StopIcon size={16} weight="fill" />
                  Cancel
                </Button>
              </Tooltip>
            )}

            {isRunning ? (
              <Flex align="center" gap="2">
                <Box
                  width="8px"
                  height="8px"
                  className="animate-pulse rounded-full bg-green-9"
                />
                <Text size="2" color="gray">
                  Running
                </Text>
              </Flex>
            ) : (
              events.length > 0 && (
                <Flex align="center" gap="2">
                  <Box
                    width="8px"
                    height="8px"
                    className="rounded-full bg-accent-9"
                  />
                  <Text size="2" color="gray">
                    Idle
                  </Text>
                </Flex>
              )
            )}
          </Flex>
        </Flex>
      </Box>

      {/* Chat output */}
      <Box ref={scrollRef} flexGrow="1" overflowY="auto" p="4">
        <Box className="space-y-1 font-mono text-sm">
          {renderedOutput.map((item) => (
            <Code
              key={item.key}
              size="2"
              variant="ghost"
              className={`block whitespace-pre-wrap ${
                item.rawDirection === "client"
                  ? "text-cyan-11"
                  : item.rawDirection === "agent"
                    ? "text-orange-11"
                    : item.isUserMessage
                      ? "text-blue-11"
                      : ""
              }`}
            >
              {item.text}
            </Code>
          ))}
          {isSending && (
            <Code size="2" variant="ghost" className="block text-gray-9">
              Thinking...
            </Code>
          )}
        </Box>
      </Box>

      {/* Input area */}
      {sessionId && (
        <Box p="4" className="border-gray-6 border-t">
          <Flex gap="2" align="end">
            <Box flexGrow="1">
              <TextArea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                disabled={isSending || !isRunning}
                rows={2}
                style={{ resize: "none" }}
              />
            </Box>
            <Tooltip content="Send message (Enter)">
              <IconButton
                size="3"
                onClick={handleSend}
                disabled={!inputValue.trim() || isSending || !isRunning}
              >
                <SendIcon size={20} />
              </IconButton>
            </Tooltip>
          </Flex>
        </Box>
      )}
    </Flex>
  );
}
