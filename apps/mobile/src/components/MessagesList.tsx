import { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  FlatList,
  type StyleProp,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import {
  AssistantMessageType,
  isArtifactMessage,
  isAssistantMessage,
  isHumanMessage,
  isVisualizationArtifactContent,
  type ThreadMessage,
} from "../types/max";
import { AIMessage } from "./AIMessage";
import { FailureMessage } from "./FailureMessage";
import { HumanMessage } from "./HumanMessage";
import { VisualizationArtifact } from "./VisualizationArtifact";

interface MessagesListProps {
  messages: ThreadMessage[];
  streamingActive?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

function MessageItem({
  item,
  hasHumanMessageAfter,
}: {
  item: ThreadMessage;
  hasHumanMessageAfter: boolean;
}) {
  if (isHumanMessage(item)) {
    return <HumanMessage content={item.content} />;
  }

  if (isAssistantMessage(item)) {
    return (
      <AIMessage
        content={item.content}
        isLoading={item.status === "loading"}
        thinkingText={item.meta?.thinking?.[0]?.thinking}
        toolCalls={item.tool_calls}
        hasHumanMessageAfter={hasHumanMessageAfter}
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
}: MessagesListProps) {
  const flatListRef = useRef<FlatList>(null);

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
          <Text className="mb-2 text-center font-mono text-lg text-neutral-200">
            Start a conversation
          </Text>
          <Text className="text-center font-mono text-[13px] text-neutral-500">
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
              <ActivityIndicator size="small" color="#f1a82c" />
              <Text className="font-mono text-[13px] italic text-neutral-400">
                Generating...
              </Text>
            </View>
          </View>
        ) : null
      }
    />
  );
}
