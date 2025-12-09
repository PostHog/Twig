import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useMaxStore } from "../../../stores/maxStore";

export default function ChatScreen() {
  const [inputText, setInputText] = useState("");
  const {
    thread,
    conversation,
    streamingActive,
    askMax,
    stopGeneration,
    resetThread,
  } = useMaxStore();

  const handleSend = async () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;
    setInputText("");
    await askMax(trimmed);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-black"
      keyboardVerticalOffset={100}
    >
      {/* JSON Output */}
      <ScrollView className="flex-1 p-4">
        {/* Conversation metadata */}
        {conversation && (
          <View className="mb-4">
            <Text className="mb-1 font-bold text-green-400">Conversation:</Text>
            <Text className="font-mono text-green-300 text-xs">
              {JSON.stringify(conversation, null, 2)}
            </Text>
          </View>
        )}

        {/* Status */}
        <View className="mb-4">
          <Text className="text-gray-400">
            Streaming: {streamingActive ? "true" : "false"}
          </Text>
          <Text className="text-gray-400">Messages: {thread.length}</Text>
        </View>

        {/* Messages */}
        {thread.map((message, index) => (
          <View key={message.id || `msg-${index}`} className="mb-4">
            <Text className="mb-1 font-bold text-yellow-400">
              [{index}] {message.type} ({message.status})
            </Text>
            <Text className="font-mono text-white text-xs">
              {JSON.stringify(message, null, 2)}
            </Text>
          </View>
        ))}

        {thread.length === 0 && !streamingActive && (
          <Text className="text-center text-gray-500">
            Send a message to start
          </Text>
        )}

        {thread.length > 0 && !streamingActive && (
          <TouchableOpacity onPress={resetThread} className="mt-4 py-2">
            <Text className="text-center text-blue-500 underline">
              Start a new chat
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Header Actions */}
      {streamingActive && (
        <View className="absolute top-2 right-4">
          <TouchableOpacity onPress={stopGeneration}>
            <Text className="text-red-500">Stop</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Input */}
      <View className="flex-row items-center gap-2 border-gray-800 border-t p-4">
        <TextInput
          className="flex-1 rounded-lg bg-gray-800 px-4 py-3 text-white"
          placeholder="Type a message..."
          placeholderTextColor="#666"
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={handleSend}
          editable={!streamingActive}
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={!inputText.trim() || streamingActive}
          className={`rounded-lg px-4 py-3 ${
            inputText.trim() && !streamingActive ? "bg-blue-600" : "bg-gray-700"
          }`}
        >
          <Text className="text-white">Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
