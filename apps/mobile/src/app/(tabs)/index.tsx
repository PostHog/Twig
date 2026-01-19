import { Text } from "@components/text";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import {
  type ConversationDetail,
  ConversationList,
} from "@/features/conversations";

export default function ConversationsScreen() {
  const router = useRouter();

  const handleConversationPress = (conversation: ConversationDetail) => {
    router.push(`/chat/${conversation.id}`);
  };

  const handleNewChat = () => {
    router.push("/chat");
  };

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="border-gray-6 border-b px-4 pt-16 pb-4">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="font-bold text-2xl text-gray-12">
              Conversations
            </Text>
            <Text className="text-gray-11 text-sm">Your PostHog AI chats</Text>
          </View>
          <Pressable
            onPress={handleNewChat}
            className="rounded-lg bg-accent-9 px-4 py-2"
          >
            <Text className="font-semibold text-accent-contrast text-sm">
              New chat
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Conversation List */}
      <ConversationList onConversationPress={handleConversationPress} />
    </View>
  );
}
