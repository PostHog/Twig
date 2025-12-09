import { Text, View } from "react-native";
import { type Message, MessagesList } from "../../components/MessagesList";

// Sample messages for demo
const SAMPLE_MESSAGES: Message[] = [
  { id: "1", text: "Hello!" },
  { id: "2", text: "How can I help you today?" },
  { id: "3", text: "Welcome to the chat." },
];

export default function ChatScreen() {
  return (
    <View className="flex-1 bg-dark-bg">
      {/* Header */}
      <View className="px-6 pt-16 pb-4">
        <Text className="mb-2 font-bold text-3xl text-white">Chat</Text>
        <Text className="text-base text-dark-text-muted">
          Start a new conversation
        </Text>
      </View>

      {/* Messages - FlatList handles its own scrolling */}
      <View className="flex-1 pb-32">
        <MessagesList messages={SAMPLE_MESSAGES} />
      </View>
    </View>
  );
}
