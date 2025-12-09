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
  isAssistantMessage,
  isHumanMessage,
  isToolCallMessage,
  type ThreadMessage,
} from "../types/max";
import { AIMessage } from "./AIMessage";
import { FailureMessage } from "./FailureMessage";
import { HumanMessage } from "./HumanMessage";
import { ToolCallMessage } from "./ToolCallMessage";

interface MessagesListProps {
  messages: ThreadMessage[];
  streamingActive?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

function MessageItem({ item }: { item: ThreadMessage }) {
  if (isHumanMessage(item)) {
    return <HumanMessage content={item.content} />;
  }

  if (isToolCallMessage(item)) {
    return (
      <ToolCallMessage
        toolName={item.toolName}
        status={item.status}
        args={item.args}
        result={item.result}
      />
    );
  }

  if (isAssistantMessage(item)) {
  return (
      <AIMessage
        content={item.content}
        isLoading={item.status === "loading"}
        thinkingText={item.meta?.thinking?.[0]?.thinking}
      />
    );
  }

  if (item.type === AssistantMessageType.Failure) {
    return <FailureMessage content={item.content} />;
  }

  return null;
}

export function MessagesList({
  messages,
  streamingActive,
  contentContainerStyle,
}: MessagesListProps) {
  const flatListRef = useRef<FlatList>(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0 && flatListRef.current) {
      flatListRef.current.scrollToOffset({ offset: 0, animated: true });
    }
  }, [messages.length]);

  // Reverse messages for inverted FlatList
  const reversedMessages = [...messages].reverse();

  return (
    <FlatList
      ref={flatListRef}
      data={reversedMessages}
      keyExtractor={(item, index) => item.id || `msg-${index}`}
      inverted
      renderItem={({ item }) => <MessageItem item={item} />}
      contentContainerStyle={contentContainerStyle}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={
        <View
          className="flex-1 items-center justify-center px-8"
          style={{ transform: [{ scaleY: -1 }] }}
        >
          <Text className="mb-2 text-center font-semibold text-dark-text text-xl">
            Start a conversation
          </Text>
          <Text className="text-center text-base text-dark-text-muted">
            Ask Max anything about your product data
          </Text>
        </View>
      }
      ListFooterComponent={
        streamingActive &&
        messages.length > 0 &&
        messages[messages.length - 1]?.status !== "loading" ? (
          <View className="items-start px-4 py-2">
            <View className="flex-row items-center gap-2 rounded-2xl rounded-bl-md bg-dark-surface px-4 py-3">
              <ActivityIndicator size="small" color="#a3a3a3" />
              <Text className="text-base text-dark-text-muted italic">
                Thinking...
              </Text>
            </View>
          </View>
        ) : null
      }
    />
  );
}
