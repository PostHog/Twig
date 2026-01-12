import { GlassContainer, GlassView } from "expo-glass-effect";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowUp, Microphone, Stop } from "phosphor-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { toRgba, useThemeColors } from "@/lib/theme";
import { useVoiceRecording } from "../hooks/useVoiceRecording";

interface ComposerProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function Composer({
  onSend,
  disabled = false,
  placeholder = "Ask a question",
}: ComposerProps) {
  const themeColors = useThemeColors();
  const [message, setMessage] = useState("");
  const { status, startRecording, stopRecording, cancelRecording } =
    useVoiceRecording();

  const isRecording = status === "recording";
  const isTranscribing = status === "transcribing";

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setMessage("");
  };

  const handleMicPress = async () => {
    if (isRecording) {
      const transcript = await stopRecording();
      if (transcript) {
        setMessage((prev) => (prev ? `${prev} ${transcript}` : transcript));
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
          paddingHorizontal: 8,
        }}
      >
        <LinearGradient
          colors={[
            toRgba(themeColors.background, 0),
            toRgba(themeColors.background, 1),
          ]}
          style={{
            position: "absolute",
            top: -40,
            left: 0,
            right: 0,
            bottom: -40,
          }}
          pointerEvents="none"
        />
        <GlassContainer
          spacing={8}
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            gap: 8,
          }}
        >
          {/* Input field with rounded glass background */}
          <GlassView
            style={{
              flex: 1,
              minHeight: 44,
              borderRadius: 24,
              paddingHorizontal: 16,
              paddingVertical: 12,
              justifyContent: "center",
            }}
            isInteractive
          >
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder={
                isRecording
                  ? "Recording..."
                  : isTranscribing
                    ? "Transcribing..."
                    : placeholder
              }
              placeholderTextColor={themeColors.gray[9]}
              editable={!disabled && !isRecording}
              multiline
              numberOfLines={8}
              style={{
                fontSize: 16,
                color: themeColors.gray[12],
                paddingTop: 0,
                paddingBottom: 0,
              }}
            />
          </GlassView>

          {/* Mic / Send button */}
          <TouchableOpacity
            onPress={canSend ? handleSend : handleMicPress}
            onLongPress={handleMicLongPress}
            activeOpacity={0.7}
            disabled={isTranscribing || disabled}
          >
            <GlassView
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                justifyContent: "center",
                alignItems: "center",
              }}
              isInteractive
            >
              {isTranscribing ? (
                <ActivityIndicator size="small" color={themeColors.gray[12]} />
              ) : canSend ? (
                <ArrowUp size={20} color={themeColors.gray[12]} weight="bold" />
              ) : isRecording ? (
                <Stop
                  size={20}
                  color={themeColors.status.error}
                  weight="fill"
                />
              ) : (
                <Microphone size={20} color={themeColors.gray[12]} />
              )}
            </GlassView>
          </TouchableOpacity>
        </GlassContainer>
      </View>
    );
  }
}
