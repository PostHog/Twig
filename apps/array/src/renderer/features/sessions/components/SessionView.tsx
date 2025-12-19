import type { SessionNotification, ToolKind } from "@agentclientprotocol/sdk";
import { Divider } from "@components/Divider";
import { Copy, MagnifyingGlass } from "@phosphor-icons/react";
import {
  Box,
  Code,
  ContextMenu,
  Flex,
  IconButton,
  Text,
  TextField,
} from "@radix-ui/themes";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { SessionEvent } from "../stores/sessionStore";
import { useSessionViewStore } from "../stores/sessionViewStore";
import { AgentMessage } from "./AgentMessage";
import { ConsoleMessage } from "./ConsoleMessage";
import { formatDuration, GeneratingIndicator } from "./GeneratingIndicator";
import { MessageEditor } from "./MessageEditor";
import { ToolCallBlock } from "./ToolCallBlock";
import { TurnCollapsible } from "./TurnCollapsible";
import { UserMessage } from "./UserMessage";
import { VirtualizedList } from "./VirtualizedList";

function RawLogEntry({
  event,
  index,
  onCopy,
}: {
  event: SessionEvent;
  index: number;
  onCopy: (text: string) => void;
}) {
  const json = JSON.stringify(event, null, 2);
  return (
    <Box className="relative rounded p-2">
      <Flex justify="between" align="center" mb="1">
        <Text size="1" color="gray">
          Event #{index}
        </Text>
        <IconButton
          size="1"
          variant="ghost"
          color="gray"
          onClick={() => onCopy(json)}
        >
          <Copy size={12} />
        </IconButton>
      </Flex>
      <Code
        size="1"
        className="block overflow-x-auto whitespace-pre"
        style={{
          fontSize: "var(--font-size-1)",
          lineHeight: "var(--line-height-1)",
        }}
      >
        {json}
      </Code>
    </Box>
  );
}

interface SessionViewProps {
  events: SessionEvent[];
  sessionId: string | null;
  isRunning: boolean;
  isPromptPending?: boolean;
  onSendPrompt: (text: string) => void;
  onCancelPrompt: () => void;
  repoPath?: string | null;
}

interface ToolData {
  toolName: string;
  toolCallId: string;
  kind?: ToolKind;
  status: "pending" | "running" | "completed" | "error";
  args?: Record<string, unknown>;
  result?: unknown;
}

interface ConsoleData {
  level: "info" | "debug" | "warn" | "error";
  message: string;
  timestamp?: string;
}

interface ParsedMessage {
  id: string;
  type: "user" | "agent" | "tool" | "console";
  content: string;
  toolData?: ToolData;
  consoleData?: ConsoleData;
  eventIndex?: number;
}

type ParseResult =
  | { type: "user"; content: string }
  | { type: "agent"; content: string }
  | { type: "tool"; toolData: ToolData }
  | { type: "tool_update"; toolData: ToolData }
  | null;

function parseSessionNotification(
  notification: SessionNotification,
): ParseResult {
  const { update } = notification;
  if (!update?.sessionUpdate) {
    return null;
  }

  switch (update.sessionUpdate) {
    case "user_message_chunk":
    case "agent_message_chunk": {
      if (update.content.type === "text") {
        const content = update.content.text;
        // Filter out injected system reminders from display
        if (
          update.sessionUpdate === "user_message_chunk" &&
          content.startsWith("[System reminder:")
        ) {
          return null; // Skip the system reminder block entirely
        }
        return {
          type:
            update.sessionUpdate === "user_message_chunk" ? "user" : "agent",
          content,
        };
      }
      return null;
    }
    case "tool_call": {
      // Bypass TypeScript's discriminated union - access kind directly from raw object
      const rawUpdate = update as unknown as Record<string, unknown>;
      return {
        type: "tool",
        toolData: {
          toolName: update.title,
          toolCallId: update.toolCallId,
          kind: rawUpdate.kind as ToolKind | undefined,
          status: mapToolStatus(update.status),
          args: update.rawInput,
        },
      };
    }
    case "tool_call_update": {
      const rawUpdate = update as unknown as Record<string, unknown>;
      return {
        type: "tool_update",
        toolData: {
          toolName: update.title ?? "Unknown Tool",
          toolCallId: update.toolCallId,
          kind: rawUpdate.kind as ToolKind | undefined,
          status: mapToolStatus(update.status),
          args: update.rawInput ?? undefined,
          result: update.rawOutput,
        },
      };
    }
    default:
      return null;
  }
}

function mapToolStatus(
  status?: "pending" | "in_progress" | "completed" | "failed" | null,
): ToolData["status"] {
  switch (status) {
    case "pending":
      return "pending";
    case "in_progress":
      return "running";
    case "completed":
      return "completed";
    case "failed":
      return "error";
    default:
      return "pending";
  }
}

class MessageBuilder {
  private messages: ParsedMessage[] = [];
  private pendingAgentText = "";
  private agentStartIndex = 0;
  private agentMessageCount = 0;
  private toolMessages = new Map<string, ParsedMessage>();

  flushAgentText(): void {
    if (!this.pendingAgentText) return;
    this.messages.push({
      id: `agent-${this.agentMessageCount++}`,
      type: "agent",
      content: this.pendingAgentText,
      eventIndex: this.agentStartIndex,
    });
    this.pendingAgentText = "";
  }

  addUser(content: string, ts: number, eventIndex: number): void {
    this.flushAgentText();
    this.messages.push({
      id: `user-${ts}`,
      type: "user",
      content,
      eventIndex,
    });
  }

  addAgentChunk(content: string, eventIndex: number): void {
    if (!this.pendingAgentText) {
      this.agentStartIndex = eventIndex;
    }
    this.pendingAgentText += content;
  }

  addTool(toolData: ToolData, eventIndex: number): void {
    this.flushAgentText();
    const msg: ParsedMessage = {
      id: `tool-${toolData.toolCallId}`,
      type: "tool",
      content: "",
      toolData,
      eventIndex,
    };
    this.toolMessages.set(toolData.toolCallId, msg);
    this.messages.push(msg);
  }

  updateTool(toolData: ToolData): void {
    const existing = this.toolMessages.get(toolData.toolCallId);
    if (!existing?.toolData) return;
    existing.toolData.status = toolData.status;
    existing.toolData.result = toolData.result;
    if (toolData.kind) existing.toolData.kind = toolData.kind;
  }

  addConsole(consoleData: ConsoleData, _ts: number, eventIndex: number): void {
    this.flushAgentText();
    this.messages.push({
      id: `console-${eventIndex}`,
      type: "console",
      content: consoleData.message,
      consoleData,
      eventIndex,
    });
  }

  build(): ParsedMessage[] {
    this.flushAgentText();
    return this.messages;
  }
}

function tryParseConsoleMessage(
  event: SessionEvent,
): { level: ConsoleData["level"]; message: string } | null {
  if (event.type !== "acp_message") return null;
  const msg = event.message as {
    method?: string;
    params?: { level?: string; message?: string };
  };
  if (msg?.method !== "_posthog/console" || !msg.params?.message) return null;
  return {
    level: (msg.params.level ?? "info") as ConsoleData["level"],
    message: msg.params.message,
  };
}

function processEvents(events: SessionEvent[]): ParsedMessage[] {
  const builder = new MessageBuilder();

  for (let i = 0; i < events.length; i++) {
    const event = events[i];

    const consoleMsg = tryParseConsoleMessage(event);
    if (consoleMsg) {
      builder.addConsole(
        { ...consoleMsg, timestamp: new Date(event.ts).toISOString() },
        event.ts,
        i,
      );
      continue;
    }

    if (event.type !== "session_update") continue;

    const parsed = parseSessionNotification(event.notification);
    if (!parsed) continue;

    switch (parsed.type) {
      case "user":
        builder.addUser(parsed.content, event.ts, i);
        break;
      case "agent":
        builder.addAgentChunk(parsed.content, i);
        break;
      case "tool":
        builder.addTool(parsed.toolData, i);
        break;
      case "tool_update":
        builder.updateTool(parsed.toolData);
        break;
    }
  }

  return builder.build();
}

interface ConversationTurn {
  id: string;
  userMessage: ParsedMessage;
  agentResponses: ParsedMessage[];
  isComplete: boolean;
}

function groupMessagesIntoTurns(
  messages: ParsedMessage[],
  isPromptPending: boolean,
): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  let currentTurn: ConversationTurn | null = null;

  for (const message of messages) {
    if (message.type === "user") {
      if (currentTurn) {
        currentTurn.isComplete = true;
        turns.push(currentTurn);
      }
      currentTurn = {
        id: message.id,
        userMessage: message,
        agentResponses: [],
        isComplete: false,
      };
    } else if (currentTurn) {
      currentTurn.agentResponses.push(message);
    }
  }

  if (currentTurn) {
    currentTurn.isComplete = !isPromptPending;
    turns.push(currentTurn);
  }

  return turns;
}

export function SessionView({
  events,
  sessionId,
  isRunning,
  isPromptPending,
  onSendPrompt,
  onCancelPrompt,
  repoPath,
}: SessionViewProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  const {
    showRawLogs,
    setShowRawLogs,
    searchQuery,
    setSearchQuery,
    showSearch,
    openSearch,
    closeSearch,
    toggleSearch,
    lastGenerationDuration,
    startGeneration,
    endGeneration,
  } = useSessionViewStore();

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

  const filteredEvents = useMemo(() => {
    if (!searchQuery.trim()) {
      return events.map((event, index) => ({ event, originalIndex: index }));
    }
    const query = searchQuery.toLowerCase();
    return events
      .map((event, index) => ({ event, originalIndex: index }))
      .filter(({ event }) =>
        JSON.stringify(event).toLowerCase().includes(query),
      );
  }, [events, searchQuery]);

  const copyAllLogs = useCallback(() => {
    const logsToExport = filteredEvents.map(({ event }) => event);
    const allLogs = JSON.stringify(logsToExport, null, 2);
    navigator.clipboard.writeText(allLogs);
  }, [filteredEvents]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f" && showRawLogs) {
        e.preventDefault();
        openSearch();
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }
      if (e.key === "Escape") {
        if (showSearch) {
          closeSearch();
        } else if (isPromptPending) {
          onCancelPrompt();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    showRawLogs,
    showSearch,
    openSearch,
    closeSearch,
    isPromptPending,
    onCancelPrompt,
  ]);

  const messages = useMemo(() => processEvents(events), [events]);
  const turns = useMemo(
    () => groupMessagesIntoTurns(messages, isPromptPending ?? false),
    [messages, isPromptPending],
  );

  useEffect(() => {
    if (isPromptPending) {
      startGeneration();
    } else {
      endGeneration();
    }
  }, [isPromptPending, startGeneration, endGeneration]);

  const renderMessage = useCallback((message: ParsedMessage) => {
    switch (message.type) {
      case "agent":
        return <AgentMessage key={message.id} content={message.content} />;
      case "console":
        return message.consoleData ? (
          <ConsoleMessage
            key={message.id}
            level={message.consoleData.level}
            message={message.consoleData.message}
            timestamp={message.consoleData.timestamp}
          />
        ) : null;
      case "tool":
        return message.toolData ? (
          <ToolCallBlock
            key={message.id}
            toolName={message.toolData.toolName}
            kind={message.toolData.kind}
            status={message.toolData.status}
            args={message.toolData.args}
            result={message.toolData.result}
          />
        ) : null;
      default:
        return null;
    }
  }, []);

  const getLastAgentMessage = useCallback((responses: ParsedMessage[]) => {
    for (let i = responses.length - 1; i >= 0; i--) {
      if (responses[i].type === "agent") {
        return responses[i];
      }
    }
    return null;
  }, []);

  const renderTurn = useCallback(
    (turn: ConversationTurn) => {
      const lastAgentMessage = getLastAgentMessage(turn.agentResponses);
      const collapsibleMessages =
        turn.isComplete && lastAgentMessage
          ? turn.agentResponses.filter((m) => m.id !== lastAgentMessage.id)
          : [];
      const shouldCollapse = turn.isComplete && collapsibleMessages.length > 0;

      return (
        <Box className="flex flex-col gap-4">
          <UserMessage content={turn.userMessage.content} />
          {shouldCollapse ? (
            <>
              <TurnCollapsible messages={collapsibleMessages} />
              {lastAgentMessage && renderMessage(lastAgentMessage)}
            </>
          ) : (
            turn.agentResponses.map(renderMessage)
          )}
        </Box>
      );
    },
    [renderMessage, getLastAgentMessage],
  );

  const renderRawLogEntry = useCallback(
    (
      { event, originalIndex }: { event: SessionEvent; originalIndex: number },
      index: number,
    ) => (
      <Box>
        <RawLogEntry
          event={event}
          index={originalIndex}
          onCopy={copyToClipboard}
        />
        {index < filteredEvents.length - 1 && <Divider size="1" />}
      </Box>
    ),
    [copyToClipboard, filteredEvents.length],
  );

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
            <Flex direction="column" className="flex-1 overflow-hidden">
              <Box className="p-4 pb-2">
                <Flex direction="column" gap="2">
                  <Flex justify="between" align="center">
                    <Text size="2" weight="medium" color="gray">
                      Raw Logs ({filteredEvents.length}
                      {searchQuery && ` of ${events.length}`} events)
                    </Text>
                    <Flex gap="1">
                      <IconButton
                        size="1"
                        variant="ghost"
                        color="gray"
                        onClick={() => {
                          toggleSearch();
                          if (!showSearch) {
                            setTimeout(
                              () => searchInputRef.current?.focus(),
                              0,
                            );
                          }
                        }}
                      >
                        <MagnifyingGlass size={12} />
                      </IconButton>
                      <IconButton
                        size="1"
                        variant="ghost"
                        color="gray"
                        onClick={copyAllLogs}
                      >
                        <Copy size={12} />
                      </IconButton>
                    </Flex>
                  </Flex>
                  {showSearch && (
                    <TextField.Root
                      ref={searchInputRef}
                      size="1"
                      placeholder="Search logs... (Esc to close)"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    >
                      <TextField.Slot>
                        <MagnifyingGlass size={12} />
                      </TextField.Slot>
                    </TextField.Root>
                  )}
                </Flex>
              </Box>
              <VirtualizedList
                items={filteredEvents}
                estimateSize={150}
                getItemKey={({ originalIndex }) => originalIndex}
                renderItem={renderRawLogEntry}
                className="flex-1 px-4"
              />
            </Flex>
          ) : (
            <VirtualizedList
              items={turns}
              estimateSize={100}
              getItemKey={(turn) => turn.id}
              renderItem={renderTurn}
              autoScrollToBottom
              className="flex-1 p-4"
              gap={24}
              footer={
                <>
                  {isPromptPending && (
                    <Box className="py-2">
                      <GeneratingIndicator />
                    </Box>
                  )}
                  {!isPromptPending && lastGenerationDuration !== null && (
                    <Box className="pb-2">
                      <Text
                        size="1"
                        color="gray"
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        Generated in {formatDuration(lastGenerationDuration)}
                      </Text>
                    </Box>
                  )}
                </>
              }
            />
          )}

          <Box className="border-gray-6 border-t p-3">
            <MessageEditor
              sessionId={sessionId ?? "default"}
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
