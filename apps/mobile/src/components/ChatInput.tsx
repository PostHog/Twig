import { useState } from "react";
import {
  TextInput,
  type TextStyle,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "./text";

const TEXT_INPUT_STYLE: TextStyle = {
  maxHeight: 120,
};

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = "Message",
}: ChatInputProps) {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState("");

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setMessage("");
  };

  const canSend = message.trim().length > 0 && !disabled;

  return (
    <View
      style={{
        backgroundColor: "#0a0a0a",
        paddingBottom: insets.bottom,
        borderTopWidth: 0.5,
        borderTopColor: "rgba(255, 255, 255, 0.1)",
      }}
    >
      <View className="flex-row items-end gap-2 px-4 py-2">
        {/* Plus button */}
        <TouchableOpacity
          className="mb-0.5 h-9 w-9 items-center justify-center rounded-full bg-dark-surface"
          activeOpacity={0.7}
        >
          <Text className="text-dark-text-muted text-xl">+</Text>
        </TouchableOpacity>

        {/* Text input */}
        <View className="relative flex-1">
          <TextInput
            placeholder={placeholder}
            style={TEXT_INPUT_STYLE}
            className="min-h-[36px] flex-1 rounded-[18px] border border-dark-border bg-dark-surface px-4 py-2 pr-10 text-base text-dark-text"
            placeholderTextColor="#6b6b6b"
            editable={!disabled}
            multiline
            onChangeText={setMessage}
            value={message}
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />

          {/* Send / Mic button */}
          <View className="absolute right-1 bottom-1">
            {canSend ? (
              <TouchableOpacity
                onPress={handleSend}
                className="h-7 w-7 items-center justify-center rounded-full bg-orange-500"
                activeOpacity={0.7}
              >
                <Text className="font-bold text-sm text-white">↑</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                className="h-7 w-7 items-center justify-center rounded-full opacity-50"
                activeOpacity={0.7}
              >
                <Text className="text-base text-dark-text-muted">🎤</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}
