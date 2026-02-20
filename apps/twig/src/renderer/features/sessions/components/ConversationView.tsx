import {
  sessionStoreSetters,
  usePendingPermissionsForTask,
  useQueuedMessagesForTask,
} from "@features/sessions/stores/sessionStore";
import { useSessionViewActions } from "@features/sessions/stores/sessionViewStore";
import { ArrowDown, XCircle } from "@phosphor-icons/react";
import { Box, Button, Flex, Text } from "@radix-ui/themes";
import type { AcpMessage } from "@shared/types/session-events";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildConversationItems,
  type ConversationItem,
  type TurnContext,
} from "./buildConversationItems";
import { GitActionMessage } from "./GitActionMessage";
import { GitActionResult } from "./GitActionResult";
import { SessionFooter } from "./SessionFooter";
import { QueuedMessageView } from "./session-update/QueuedMessageView";
import {
  type RenderItem,
  SessionUpdateView,
} from "./session-update/SessionUpdateView";
import { UserMessage } from "./session-update/UserMessage";
import { UserShellExecuteView } from "./session-update/UserShellExecuteView";
import { VirtualizedList, type VirtualizedListHandle } from "./VirtualizedList";

interface ConversationViewProps {
  events: AcpMessage[];
  isPromptPending: boolean;
  repoPath?: string | null;
  taskId?: string;
}

const SHOW_BUTTON_THRESHOLD = 300;
const ESTIMATE_SIZE = 36;

export function ConversationView({
  events,
  isPromptPending,
  repoPath,
  taskId,
}: ConversationViewProps) {
  const listRef = useRef<VirtualizedListHandle>(null);
  const { items: conversationItems, lastTurnInfo } = useMemo(
    () => buildConversationItems(events, isPromptPending),
    [events, isPromptPending],
  );

  const pendingPermissions = usePendingPermissionsForTask(taskId ?? "");
  const pendingPermissionsCount = pendingPermissions.size;

  const queuedMessages = useQueuedMessagesForTask(taskId);
  const { saveScrollPosition, getScrollPosition } = useSessionViewActions();

  const [showScrollButton, setShowScrollButton] = useState(false);
  const showScrollButtonRef = useRef(false);
  const hasRestoredScrollRef = useRef(false);
  const prevItemCountRef = useRef(0);
  const prevPendingCountRef = useRef(0);
  const prevEventsLengthRef = useRef(events.length);

  const queuedItems = useMemo<Extract<ConversationItem, { type: "queued" }>[]>(
    () =>
      queuedMessages.map((msg) => ({
        type: "queued" as const,
        id: msg.id,
        message: msg,
      })),
    [queuedMessages],
  );

  const virtualizedItems = useMemo<ConversationItem[]>(
    () =>
      queuedItems.length > 0
        ? [...conversationItems, ...queuedItems]
        : conversationItems,
    [conversationItems, queuedItems],
  );

  useEffect(() => {
    if (!taskId || hasRestoredScrollRef.current) return;

    const savedPosition = getScrollPosition(taskId);
    if (savedPosition > 0) {
      listRef.current?.scrollToOffset(savedPosition);
      hasRestoredScrollRef.current = true;
    }
  }, [taskId, getScrollPosition]);

  useEffect(() => {
    const isNewContent = virtualizedItems.length > prevItemCountRef.current;
    const isNewPending = pendingPermissionsCount > prevPendingCountRef.current;
    const isNewEvents = events.length > prevEventsLengthRef.current;
    prevItemCountRef.current = virtualizedItems.length;
    prevPendingCountRef.current = pendingPermissionsCount;
    prevEventsLengthRef.current = events.length;

    if (isNewContent || isNewPending) {
      listRef.current?.scrollToBottom();
      return;
    }

    if (isNewEvents && !showScrollButtonRef.current) {
      listRef.current?.scrollToBottom();
    }
  }, [events.length, virtualizedItems.length, pendingPermissionsCount]);

  const handleScroll = useCallback(
    (scrollOffset: number, scrollHeight: number, clientHeight: number) => {
      const distanceFromBottom = scrollHeight - scrollOffset - clientHeight;
      const isScrolledUp = distanceFromBottom > SHOW_BUTTON_THRESHOLD;
      if (showScrollButtonRef.current !== isScrolledUp) {
        setShowScrollButton(isScrolledUp);
      }
      showScrollButtonRef.current = isScrolledUp;

      if (taskId) {
        saveScrollPosition(taskId, scrollOffset);
      }
    },
    [taskId, saveScrollPosition],
  );

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToBottom();
  }, []);

  const renderItem = useCallback(
    (item: ConversationItem) => {
      switch (item.type) {
        case "user_message":
          return <UserMessage content={item.content} />;
        case "git_action":
          return <GitActionMessage actionType={item.actionType} />;
        case "session_update":
          return (
            <SessionUpdateRow
              update={item.update}
              turnContext={item.turnContext}
            />
          );
        case "git_action_result":
          return repoPath ? (
            <GitActionResult
              actionType={item.actionType}
              repoPath={repoPath}
              turnId={item.turnId}
            />
          ) : null;
        case "turn_cancelled":
          return <TurnCancelledView interruptReason={item.interruptReason} />;
        case "user_shell_execute":
          return <UserShellExecuteView item={item} />;
        case "queued":
          return (
            <QueuedMessageView
              message={item.message}
              onRemove={
                taskId
                  ? () =>
                      sessionStoreSetters.removeQueuedMessage(
                        taskId,
                        item.message.id,
                      )
                  : undefined
              }
            />
          );
      }
    },
    [repoPath, taskId],
  );

  const getItemKey = useCallback((item: ConversationItem) => item.id, []);

  return (
    <div className="relative flex-1">
      <VirtualizedList
        ref={listRef}
        items={virtualizedItems}
        estimateSize={ESTIMATE_SIZE}
        gap={12}
        overscan={5}
        getItemKey={getItemKey}
        renderItem={renderItem}
        onScroll={handleScroll}
        className="absolute inset-0 bg-gray-1 p-2"
        innerClassName="mx-auto max-w-[750px]"
        footer={
          <div className="pb-16">
            <SessionFooter
              isPromptPending={isPromptPending}
              lastGenerationDuration={
                lastTurnInfo?.isComplete ? lastTurnInfo.durationMs : null
              }
              lastStopReason={lastTurnInfo?.stopReason}
              queuedCount={queuedMessages.length}
              hasPendingPermission={pendingPermissionsCount > 0}
            />
          </div>
        }
      />
      {showScrollButton && (
        <Box className="absolute right-4 bottom-4 z-10">
          <Button size="1" variant="solid" onClick={scrollToBottom}>
            <ArrowDown size={14} weight="bold" />
            Scroll to bottom
          </Button>
        </Box>
      )}
    </div>
  );
}

const SessionUpdateRow = memo(function SessionUpdateRow({
  update,
  turnContext,
}: {
  update: RenderItem;
  turnContext: TurnContext;
}) {
  return (
    <SessionUpdateView
      item={update}
      toolCalls={turnContext.toolCalls}
      turnCancelled={turnContext.turnCancelled}
      turnComplete={turnContext.turnComplete}
    />
  );
});

function getInterruptMessage(reason?: string): string {
  switch (reason) {
    case "moving_to_worktree":
      return "Paused while worktree is focused";
    default:
      return "Interrupted by user";
  }
}

const TurnCancelledView = memo(function TurnCancelledView({
  interruptReason,
}: {
  interruptReason?: string;
}) {
  return (
    <Box className="border-gray-4 border-l-2 py-0.5 pl-3">
      <Flex align="center" gap="2" className="text-gray-9">
        <XCircle size={14} />
        <Text size="1" color="gray">
          {getInterruptMessage(interruptReason)}
        </Text>
      </Flex>
    </Box>
  );
});
