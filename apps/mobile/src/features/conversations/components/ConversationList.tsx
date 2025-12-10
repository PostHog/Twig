import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  View,
} from "react-native";
import { Text } from "../../../components/text";
import { useConversations } from "../hooks/useConversations";
import type { ConversationDetail } from "../types";
import { ConversationItem } from "./ConversationItem";

interface ConversationListProps {
  onConversationPress?: (conversation: ConversationDetail) => void;
}

export function ConversationList({
  onConversationPress,
}: ConversationListProps) {
  const { conversations, isLoading, error, refetch } = useConversations();

  const handleConversationPress = (conversation: ConversationDetail) => {
    onConversationPress?.(conversation);
  };

  if (error) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <Text className="mb-4 text-center text-red-400">{error}</Text>
        <Pressable
          onPress={refetch}
          className="rounded-lg bg-dark-surface px-4 py-2"
        >
          <Text className="text-white">Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (isLoading && conversations.length === 0) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#f97316" />
        <Text className="mt-4 text-dark-text-muted">
          Loading conversations...
        </Text>
      </View>
    );
  }

  if (conversations.length === 0) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <Text className="text-center text-dark-text-muted">
          No conversations yet
        </Text>
        <Text className="mt-2 text-center text-gray-600 text-sm">
          Start chatting with Max to see your conversations here
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={conversations}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <ConversationItem
          conversation={item}
          onPress={handleConversationPress}
        />
      )}
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={refetch}
          tintColor="#f97316"
        />
      }
      contentContainerStyle={{ paddingBottom: 100 }}
    />
  );
}
