import { Text } from "@components/text";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ChatInput,
  MessagesList,
  useChatStore,
  useGradualAnimation,
} from "@/features/chat";
import { useThemeColors } from "@/lib/useThemeColors";

export default function ChatDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const themeColors = useThemeColors();
  const [loadError, setLoadError] = useState<string | null>(null);

  const {
    conversation,
    thread,
    streamingActive,
    conversationLoading,
    askMax,
    stopGeneration,
    loadConversation,
    resetThread,
  } = useChatStore();

  useEffect(() => {
    if (!id) return;

    setLoadError(null);
    loadConversation(id).catch((err) => {
      console.error("Failed to load conversation:", err);
      setLoadError("Failed to load conversation");
    });

    return () => {
      // Reset when leaving the screen
      resetThread();
    };
  }, [id, loadConversation, resetThread]);

  const handleSend = useCallback(
    async (message: string) => {
      await askMax(message, id);
    },
    [askMax, id],
  );

  const handleOpenTask = useCallback(
    (taskId: string) => {
      router.push(`/task/${taskId}`);
    },
    [router],
  );

  const headerRight = useCallback(() => {
    if (streamingActive) {
      return (
        <TouchableOpacity onPress={stopGeneration} className="px-2">
          <Text className="font-medium text-status-error">Stop</Text>
        </TouchableOpacity>
      );
    }
    return null;
  }, [streamingActive, stopGeneration]);

  const { height } = useGradualAnimation();

  const contentPosition = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: -height.value }],
    };
  }, []);

  if (loadError) {
    return (
      <>
        <Stack.Screen
          options={{
            headerShown: true,
            headerTitle: "Error",
            headerBackTitle: "Back",
            headerStyle: { backgroundColor: themeColors.background },
            headerTintColor: themeColors.gray[12],
          }}
        />
        <View className="flex-1 items-center justify-center bg-background px-4">
          <Text className="mb-4 text-center text-status-error">
            {loadError}
          </Text>
          <Pressable
            onPress={() => router.back()}
            className="rounded-lg bg-gray-3 px-4 py-2"
          >
            <Text className="text-gray-12">Go back</Text>
          </Pressable>
        </View>
      </>
    );
  }

  if (conversationLoading && thread.length === 0) {
    return (
      <>
        <Stack.Screen
          options={{
            headerShown: true,
            headerTitle: "Loading...",
            headerBackTitle: "Back",
            headerStyle: { backgroundColor: themeColors.background },
            headerTintColor: themeColors.gray[12],
          }}
        />
        <View className="flex-1 items-center justify-center bg-background">
          <ActivityIndicator size="large" color={themeColors.accent[9]} />
          <Text className="mt-4 text-gray-11">Loading conversation...</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: conversation?.title || "Conversation",
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
          streamingActive={streamingActive}
          onOpenTask={handleOpenTask}
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
