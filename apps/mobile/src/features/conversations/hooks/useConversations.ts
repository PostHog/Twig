import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/features/auth";
import { getConversation, getConversations } from "../api";
import { sortConversationsByDate } from "../stores/conversationStore";

export const conversationKeys = {
  all: ["conversations"] as const,
  lists: () => [...conversationKeys.all, "list"] as const,
  list: () => [...conversationKeys.lists()] as const,
  details: () => [...conversationKeys.all, "detail"] as const,
  detail: (id: string) => [...conversationKeys.details(), id] as const,
};

export function useConversations() {
  const { projectId, oauthAccessToken } = useAuthStore();

  const query = useQuery({
    queryKey: conversationKeys.list(),
    queryFn: getConversations,
    enabled: !!projectId && !!oauthAccessToken,
    select: sortConversationsByDate,
  });

  return {
    conversations: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

export function useConversation(conversationId: string) {
  const { projectId, oauthAccessToken } = useAuthStore();

  return useQuery({
    queryKey: conversationKeys.detail(conversationId),
    queryFn: () => getConversation(conversationId),
    enabled: !!projectId && !!oauthAccessToken && !!conversationId,
  });
}
