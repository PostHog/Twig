import { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  FlatList,
  type StyleProp,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { useThemeColors } from "@/lib/theme";
import {
  AssistantMessageType,
  isArtifactMessage,
  isAssistantMessage,
  isHumanMessage,
  isVisualizationArtifactContent,
  type ThreadMessage,
} from "../types";
import { AgentMessage } from "./AgentMessage";
import { FailureMessage } from "./FailureMessage";
import { HumanMessage } from "./HumanMessage";
import { VisualizationArtifact } from "./VisualizationArtifact";

interface MessagesListProps {
  messages: ThreadMessage[];
  streamingActive?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  onOpenTask?: (taskId: string) => void;
}

function MessageItem({
  item,
  hasHumanMessageAfter,
  onOpenTask,
}: {
  item: ThreadMessage;
  hasHumanMessageAfter: boolean;
  onOpenTask?: (taskId: string) => void;
}) {
  if (isHumanMessage(item)) {
    return <HumanMessage content={item.content} />;
  }

  if (isAssistantMessage(item)) {
    return (
      <AgentMessage
        content={item.content}
        isLoading={item.status === "loading"}
        thinkingText={item.meta?.thinking?.[0]?.thinking}
        toolCalls={item.tool_calls}
        hasHumanMessageAfter={hasHumanMessageAfter}
        onOpenTask={onOpenTask}
      />
    );
  }

  if (item.type === AssistantMessageType.Failure) {
    return <FailureMessage content={item.content} />;
  }

  if (isArtifactMessage(item) && isVisualizationArtifactContent(item.content)) {
    return <VisualizationArtifact message={item} content={item.content} />;
  }

  return null;
}

export function MessagesList({
  messages,
  streamingActive,
  contentContainerStyle,
  onOpenTask,
}: MessagesListProps) {
  const flatListRef = useRef<FlatList>(null);
  const themeColors = useThemeColors();

  useEffect(() => {
    if (messages.length > 0 && flatListRef.current) {
      flatListRef.current.scrollToOffset({ offset: 0, animated: true });
    }
  }, [messages.length]);

  const reversedMessages = [...messages].reverse();

  return (
    <FlatList
      ref={flatListRef}
      data={reversedMessages}
      keyExtractor={(item, index) => item.id || `msg-${index}`}
      inverted
      renderItem={({ item, index }) => {
        // List is inverted, so index 0 is the last message. Check if any message before this index (after in original order) is human.
        const hasHumanMessageAfter = reversedMessages
          .slice(0, index)
          .some((m) => isHumanMessage(m));
        return (
          <MessageItem
            item={item}
            hasHumanMessageAfter={hasHumanMessageAfter}
            onOpenTask={onOpenTask}
          />
        );
      }}
      contentContainerStyle={contentContainerStyle}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={
        <View
          className="flex-1 items-center justify-center px-8"
          style={{ transform: [{ scaleY: -1 }] }}
        >
          <Text className="mb-2 text-center font-mono text-lg text-gray-12">
            Start a conversation
          </Text>
          <Text className="text-center font-mono text-[13px] text-gray-9">
            Ask Max anything about your product data
          </Text>
        </View>
      }
      ListHeaderComponent={
        streamingActive &&
        messages.length > 0 &&
        messages[messages.length - 1]?.status !== "loading" ? (
          <View className="items-start px-4 py-2">
            <View className="flex-row items-center gap-2 py-1">
              <ActivityIndicator size="small" color={themeColors.accent[9]} />
              <Text className="font-mono text-[13px] text-gray-11 italic">
                Generating...
              </Text>
            </View>
          </View>
        ) : null
      }
    />
  );
}
