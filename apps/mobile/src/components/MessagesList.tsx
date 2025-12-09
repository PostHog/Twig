import { ActivityIndicator, FlatList, Text, View } from "react-native";
import {
  AssistantMessageType,
  isAssistantMessage,
  isHumanMessage,
  type ThreadMessage,
} from "../types/max";

interface MessagesListProps {
  messages: ThreadMessage[];
  isLoading?: boolean;
}

function MessageBubble({ message }: { message: ThreadMessage }) {
  const isHuman = isHumanMessage(message);
  const isAssistant = isAssistantMessage(message);
  const isFailure = message.type === AssistantMessageType.Failure;
  const isLoading = message.status === "loading";

  // Get content based on message type
  let content = "";
  if (isHuman || isAssistant || isFailure) {
    content = message.content || "";
  }

  // Show thinking indicator for assistant messages
  const thinking = isAssistant && message.meta?.thinking?.[0]?.thinking;

  return (
    <View className={`px-4 py-3 ${isHuman ? "items-end" : "items-start"}`}>
      <View
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isHuman
            ? "bg-blue-600"
            : isFailure
              ? "bg-red-900/50"
              : "bg-dark-border"
        }`}
      >
        {isLoading && !content && thinking ? (
          <View className="flex-row items-center gap-2">
            <ActivityIndicator size="small" color="#9CA3AF" />
            <Text className="text-base text-dark-text-muted italic">
              {thinking}
            </Text>
          </View>
        ) : isLoading && !content ? (
          <View className="flex-row items-center gap-2">
            <ActivityIndicator size="small" color="#9CA3AF" />
            <Text className="text-base text-dark-text-muted italic">
              Thinking...
            </Text>
          </View>
        ) : (
          <Text
            className={`text-base ${isHuman ? "text-white" : isFailure ? "text-red-300" : "text-white"}`}
          >
            {content}
          </Text>
        )}
      </View>
    </View>
  );
}

export function MessagesList({ messages, isLoading }: MessagesListProps) {
  // Add a loading indicator at the end if streaming and last message is complete
  const displayMessages = [...messages];
  const lastMessage = displayMessages[displayMessages.length - 1];

  if (isLoading && (!lastMessage || lastMessage.status === "completed")) {
    displayMessages.push({
      type: AssistantMessageType.Assistant,
      content: "",
      status: "loading",
      id: "loading-indicator",
    });
  }

  return (
    <FlatList
      data={displayMessages}
      keyExtractor={(item, index) => item.id || `msg-${index}`}
      inverted
      renderItem={({ item }) => <MessageBubble message={item} />}
      contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }}
      ListEmptyComponent={
        <View className="flex-1 items-center justify-center">
          <Text className="text-base text-dark-text-muted">
            Ask Max anything about your product data
          </Text>
        </View>
      }
    />
  );
}
