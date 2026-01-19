import { Text } from "@components/text";
import { differenceInHours, format, formatDistanceToNow } from "date-fns";
import { memo } from "react";
import { Pressable, View } from "react-native";
import {
  AssistantMessageType,
  type ConversationDetail,
  ConversationStatus,
  ConversationType,
} from "../types";

interface ConversationItemProps {
  conversation: ConversationDetail;
  onPress: (conversation: ConversationDetail) => void;
}

const statusColorMap: Record<string, { bg: string; text: string }> = {
  [ConversationStatus.Idle]: { bg: "bg-gray-5/20", text: "text-gray-9" },
  [ConversationStatus.InProgress]: {
    bg: "bg-status-info/20",
    text: "text-status-info",
  },
};

const typeDisplayMap: Record<string, string> = {
  [ConversationType.Chat]: "Chat",
  [ConversationType.DeepResearch]: "Deep research",
};

function ConversationItemComponent({
  conversation,
  onPress,
}: ConversationItemProps) {
  const updatedAt = conversation.updated_at
    ? new Date(conversation.updated_at)
    : conversation.created_at
      ? new Date(conversation.created_at)
      : new Date();

  const hoursSinceUpdated = differenceInHours(new Date(), updatedAt);
  const timeDisplay =
    hoursSinceUpdated < 24
      ? formatDistanceToNow(updatedAt, { addSuffix: true })
      : format(updatedAt, "MMM d");

  const statusColors =
    statusColorMap[conversation.status] ||
    statusColorMap[ConversationStatus.Idle];

  // Get preview from first human message
  const firstHumanMessage = conversation.messages?.find(
    (m) => m.type === AssistantMessageType.Human,
  );
  const preview = firstHumanMessage?.content || "No messages";

  const messageCount = conversation.messages?.length || 0;

  return (
    <Pressable
      onPress={() => onPress(conversation)}
      className="border-gray-6 border-b px-3 py-3 active:bg-gray-3"
    >
      <View className="flex-row items-center gap-2">
        {/* Type badge */}
        <View className="rounded bg-accent-3 px-1.5 py-0.5">
          <Text className="text-accent-11 text-xs">
            {typeDisplayMap[conversation.type] || conversation.type}
          </Text>
        </View>

        {/* Status Badge */}
        {conversation.status === ConversationStatus.InProgress && (
          <View className={`rounded px-1.5 py-0.5 ${statusColors.bg}`}>
            <Text className={`text-xs ${statusColors.text}`}>In progress</Text>
          </View>
        )}

        {/* Message count */}
        <Text className="text-gray-9 text-xs">
          {messageCount} {messageCount === 1 ? "message" : "messages"}
        </Text>
      </View>

      {/* Title */}
      <Text
        className="mt-1 font-medium text-gray-12 text-sm"
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {conversation.title || "Untitled conversation"}
      </Text>

      {/* Preview */}
      <Text
        className="mt-0.5 text-gray-11 text-xs"
        numberOfLines={2}
        ellipsizeMode="tail"
      >
        {preview}
      </Text>

      {/* Bottom row: agent mode + time */}
      <View className="mt-1.5 flex-row items-center justify-between">
        <Text className="text-gray-9 text-xs">
          {conversation.agent_mode || "General"}
        </Text>
        <Text className="flex-shrink-0 text-gray-8 text-xs">{timeDisplay}</Text>
      </View>
    </Pressable>
  );
}

export const ConversationItem = memo(ConversationItemComponent);
