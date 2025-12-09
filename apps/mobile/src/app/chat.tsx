import { Stack } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { MessagesList } from "../components/MessagesList";
import { useMaxStore } from "../stores/maxStore";

export default function ChatScreen() {
  const [inputText, setInputText] = useState("");
  const { thread, streamingActive, askMax, stopGeneration } = useMaxStore();

  const handleSend = async () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;
    setInputText("");
    await askMax(trimmed);
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: "Chat",
          headerStyle: { backgroundColor: "#09090b" },
          headerTintColor: "#fff",
          headerRight: streamingActive
            ? () => (
                <TouchableOpacity onPress={stopGeneration}>
                  <Text className="text-red-500">Stop</Text>
                </TouchableOpacity>
              )
            : undefined,
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 bg-black"
        keyboardVerticalOffset={100}
      >
        <MessagesList messages={thread} isLoading={streamingActive} />

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
              inputText.trim() && !streamingActive
                ? "bg-blue-600"
                : "bg-gray-700"
            }`}
          >
            <Text className="text-white">Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}
