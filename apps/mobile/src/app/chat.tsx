import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MessagesList } from "../components/MessagesList";
import { useMaxStore } from "../stores/maxStore";

export default function ChatScreen() {
  const [inputText, setInputText] = useState("");
  const { thread, streamingActive, askMax, stopGeneration, resetThread } =
    useMaxStore();

  const handleSend = async () => {
    const trimmed = inputText.trim();
    if (!trimmed || streamingActive) return;

    setInputText("");
    await askMax(trimmed);
  };

  const handleStop = () => {
    stopGeneration();
  };

  return (
    <SafeAreaView
      className="flex-1 bg-dark-bg"
      edges={["top", "left", "right"]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between border-dark-border border-b px-6 pt-4 pb-2">
          <Text className="font-bold text-white text-xl">Max</Text>
          {thread.length > 0 && (
            <TouchableOpacity onPress={resetThread}>
              <Text className="text-blue-500">New chat</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Messages */}
        <View className="flex-1">
          <MessagesList messages={thread} isLoading={streamingActive} />
        </View>

        {/* Input area */}
        <View className="border-dark-border border-t px-4 py-3">
          <View className="flex-row items-end gap-2">
            <TextInput
              className="max-h-[120px] min-h-[44px] flex-1 rounded-2xl bg-dark-border px-4 py-3 text-base text-white"
              placeholder="Ask Max..."
              placeholderTextColor="#6B7280"
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={handleSend}
              multiline
              editable={!streamingActive}
              returnKeyType="send"
              blurOnSubmit={false}
            />
            {streamingActive ? (
              <TouchableOpacity
                onPress={handleStop}
                className="h-11 w-11 items-center justify-center rounded-full bg-red-600"
              >
                <View className="h-4 w-4 rounded-sm bg-white" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={handleSend}
                disabled={!inputText.trim()}
                className={`h-11 w-11 items-center justify-center rounded-full ${
                  inputText.trim() ? "bg-blue-600" : "bg-dark-border"
                }`}
              >
                <Text className="text-lg text-white">↑</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
