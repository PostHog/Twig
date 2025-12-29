import { Stack } from "expo-router";
import { useCallback } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ChatInput,
  MessagesList,
  useChatStore,
  useGradualAnimation,
} from "@/features/chat";

export default function NewChatScreen() {
  const insets = useSafeAreaInsets();
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
          <Text className="font-medium text-red-500">Stop</Text>
        </TouchableOpacity>
      );
    }
    if (thread.length > 0) {
      return (
        <TouchableOpacity onPress={resetThread} className="px-2">
          <Text className="font-medium text-orange-500">New</Text>
        </TouchableOpacity>
      );
    }
    return null;
  }, [streamingActive, thread.length, stopGeneration, resetThread]);

  const { height } = useGradualAnimation();

  const contentPosition = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: -height.value }],
    };
  }, []);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: "Chat",
          headerBackTitle: "Back",
          headerStyle: { backgroundColor: "#09090b" },
          headerTintColor: "#fff",
          headerTitleStyle: {
            fontWeight: "600",
          },
          headerRight,
        }}
      />
      <Animated.View className="flex-1 bg-dark-bg" style={[contentPosition]}>
        <MessagesList
          messages={thread}
          streamingActive={streamingActive}
          contentContainerStyle={{
            paddingTop: 80 + insets.bottom,
            paddingBottom: 16,
            flexGrow: thread.length === 0 ? 1 : undefined,
          }}
        />

        {/* Fixed input at bottom */}
        <View className="absolute inset-x-0 bottom-0">
          <ChatInput onSend={handleSend} disabled={streamingActive} />
        </View>
      </Animated.View>
    </>
  );
}
