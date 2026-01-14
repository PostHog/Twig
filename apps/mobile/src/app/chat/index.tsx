import { Text } from "@components/text";
import { Stack } from "expo-router";
import { useCallback } from "react";
import { TouchableOpacity } from "react-native";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Composer, MessagesList, useChatStore } from "@/features/chat";
import { useThemeColors } from "@/lib/theme";

export default function NewChatScreen() {
  const insets = useSafeAreaInsets();
  const themeColors = useThemeColors();
  const { thread, streamingActive, askMax, stopGeneration, resetThread } =
    useChatStore();

  const handleSend = useCallback(
    async (message: string) => {
      await askMax(message);
    },
    [askMax],
  );

  const headerRight = useCallback(() => {
    if (streamingActive) {
      return (
        <TouchableOpacity onPress={stopGeneration} className="px-2">
          <Text className="font-medium text-status-error">Stop</Text>
        </TouchableOpacity>
      );
    }
    if (thread.length > 0) {
      return (
        <TouchableOpacity onPress={resetThread} className="px-2">
          <Text className="font-medium text-accent-9">New</Text>
        </TouchableOpacity>
      );
    }
    return null;
  }, [streamingActive, thread.length, stopGeneration, resetThread]);

  const { height } = useReanimatedKeyboardAnimation();

  // useReanimatedKeyboardAnimation returns negative height values
  // e.g., -300 when keyboard is open, 0 when closed
  const contentPosition = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: height.value }],
    };
  }, []);

  const inputContainerStyle = useAnimatedStyle(() => {
    return {
      marginBottom: height.value < 0 ? 12 : insets.bottom,
    };
  }, [insets.bottom]);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: "Chat",
          headerBackTitle: "Back",
          headerStyle: { backgroundColor: themeColors.background },
          headerTintColor: themeColors.gray[12],
          headerTitleStyle: {
            fontWeight: "600",
          },
          headerRight,
        }}
      />
      <Animated.View className="flex-1 bg-background" style={contentPosition}>
        <MessagesList
          messages={thread}
          contentContainerStyle={{
            paddingTop: 80 + insets.bottom,
            paddingBottom: 16,
            flexGrow: thread.length === 0 ? 1 : undefined,
          }}
        />

        {/* Fixed input at bottom */}
        <Animated.View
          className="absolute inset-x-0 bottom-0"
          style={inputContainerStyle}
        >
          <Composer onSend={handleSend} disabled={streamingActive} />
        </Animated.View>
      </Animated.View>
    </>
  );
}
