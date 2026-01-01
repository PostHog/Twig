import { Circle, Host, TextField, type TextFieldRef } from "@expo/ui/swift-ui";
import { clipped, glassEffect, padding } from "@expo/ui/swift-ui/modifiers";
import { ArrowUp, Microphone, Stop } from "phosphor-react-native";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "@/lib/theme";
import { useVoiceRecording } from "../hooks/useVoiceRecording";

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
  const themeColors = useThemeColors();
  const [message, setMessage] = useState("");
  const textFieldRef = useRef<TextFieldRef>(null);
  const { status, startRecording, stopRecording, cancelRecording } =
    useVoiceRecording();

  const isRecording = status === "recording";
  const isTranscribing = status === "transcribing";

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setMessage("");
    textFieldRef.current?.setText("");
  };

  const handleMicPress = async () => {
    if (isRecording) {
      const transcript = await stopRecording();
      if (transcript) {
        setMessage((prev) => (prev ? `${prev} ${transcript}` : transcript));
        textFieldRef.current?.setText(
          message ? `${message} ${transcript}` : transcript,
        );
      }
    } else if (!isTranscribing) {
      await startRecording();
    }
  };

  const handleMicLongPress = async () => {
    if (isRecording) {
      await cancelRecording();
    }
  };

  const canSend = message.trim().length > 0 && !disabled && !isRecording;

  if (Platform.OS === "ios") {
    return (
      <View
        style={{
          paddingBottom: insets.bottom + 4,
          paddingHorizontal: 8,
          paddingTop: 8,
        }}
      >
        <View className="flex-row items-end gap-2">
          {/* Input field container */}
          <View className="relative flex-1 overflow-hidden rounded-full">
            <Host style={{ minHeight: 36, overflow: "hidden" }} matchContents>
              <TextField
                ref={textFieldRef}
                defaultValue=""
                placeholder={placeholder}
                onChangeText={setMessage}
                multiline
                numberOfLines={5}
                modifiers={[
                  padding({ leading: 12, trailing: 12, top: 8, bottom: 8 }),
                  glassEffect({
                    shape: "capsule",
                    glass: { variant: "regular" },
                  }),
                  clipped(),
                ]}
              />
            </Host>
          </View>

          {/* Mic / Send button */}
          <TouchableOpacity
            onPress={canSend ? handleSend : handleMicPress}
            onLongPress={handleMicLongPress}
            activeOpacity={0.7}
            disabled={isTranscribing || disabled}
            className="h-[34px] w-[34px] items-center justify-center"
          >
            {/* Glass Background */}
            <View className="absolute inset-0">
              <Host style={{ width: 34, height: 34 }}>
                <Circle
                  modifiers={[
                    glassEffect({
                      shape: "circle",
                      glass: { variant: "regular" },
                    }),
                  ]}
                />
              </Host>
            </View>

            {/* Icon */}
            {isTranscribing ? (
              <ActivityIndicator size="small" color={themeColors.gray[12]} />
            ) : canSend ? (
              <ArrowUp size={20} color={themeColors.gray[12]} weight="bold" />
            ) : isRecording ? (
              <Stop size={20} color={themeColors.status.error} weight="fill" />
            ) : (
              <Microphone size={20} color={themeColors.gray[12]} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Android fallback
  return (
    <View
      style={{
        paddingBottom: insets.bottom + 4,
        paddingHorizontal: 8,
        paddingTop: 8,
      }}
    >
      <View className="flex-row items-end gap-2">
        {/* Input field */}
        <View className="min-h-[36px] flex-1 justify-center rounded-[18px] bg-gray-3 px-4 py-2">
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder={placeholder}
            placeholderTextColor={themeColors.gray[9]}
            editable={!disabled}
            multiline
            numberOfLines={5}
            className="text-base text-gray-12"
            style={{ maxHeight: 120 }}
          />
        </View>

        {/* Mic / Send button */}
        <TouchableOpacity
          onPress={canSend ? handleSend : handleMicPress}
          onLongPress={handleMicLongPress}
          disabled={isTranscribing || disabled}
          className={`h-[34px] w-[34px] items-center justify-center rounded-full ${isRecording ? "bg-status-error/20" : "bg-gray-5"}`}
          activeOpacity={0.7}
        >
          {isTranscribing ? (
            <ActivityIndicator size="small" color={themeColors.gray[12]} />
          ) : canSend ? (
            <ArrowUp size={20} color={themeColors.gray[12]} weight="bold" />
          ) : isRecording ? (
            <Stop size={20} color={themeColors.status.error} weight="fill" />
          ) : (
            <Microphone size={20} color={themeColors.gray[12]} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
