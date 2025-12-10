import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChatInput } from "../../components/ChatInput";
import { MessagesList } from "../../components/MessagesList";
import { useGradualAnimation } from "../../hooks/useGradualAnimation";
import { useMaxStore } from "../../stores/maxStore";

export default function ConversationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
  } = useMaxStore();

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
            headerStyle: { backgroundColor: "#09090b" },
            headerTintColor: "#fff",
          }}
        />
        <View className="flex-1 items-center justify-center bg-dark-bg px-4">
          <Text className="mb-4 text-center text-red-400">{loadError}</Text>
          <Pressable
            onPress={() => router.back()}
            className="rounded-lg bg-dark-surface px-4 py-2"
          >
            <Text className="text-white">Go Back</Text>
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
            headerBackTitle: "",
            headerStyle: { backgroundColor: "#09090b" },
            headerTintColor: "#fff",
          }}
        />
        <View className="flex-1 items-center justify-center bg-dark-bg">
          <ActivityIndicator size="large" color="#f97316" />
          <Text className="mt-4 text-dark-text-muted">
            Loading conversation...
          </Text>
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
          headerBackTitle: "",
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
