import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { Text } from "@components/text";
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
    <View className="flex-1 bg-dark-bg">
      {/* Header */}
      <View className="border-dark-border border-b px-4 pt-16 pb-4">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="font-bold text-2xl text-white">Conversations</Text>
            <Text className="text-dark-text-muted text-sm">
              Your Max AI chats
            </Text>
          </View>
          <Pressable
            onPress={handleNewChat}
            className="rounded-lg bg-orange-500 px-4 py-2 active:bg-orange-600"
          >
            <Text className="font-semibold text-sm text-white">New chat</Text>
          </Pressable>
        </View>
      </View>

      {/* Conversation List */}
      <ConversationList onConversationPress={handleConversationPress} />
    </View>
  );
}
