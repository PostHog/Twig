import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { type Message, MessagesList } from "../components/MessagesList";

// Sample messages for demo
const SAMPLE_MESSAGES: Message[] = [
  { id: "1", text: "Hello!" },
  { id: "2", text: "How can I help you today?" },
  { id: "3", text: "Welcome to the chat." },
];

export default function ChatScreen() {
  return (
    <SafeAreaView className="flex-1 bg-dark-bg">
      {/* Header */}
      <View className="border-dark-border border-b px-6 pt-4 pb-2">
        <Text className="font-bold text-white text-xl">Chat</Text>
      </View>

      {/* Messages */}
      <View className="flex-1">
        <MessagesList messages={SAMPLE_MESSAGES} />
      </View>
    </SafeAreaView>
  );
}
