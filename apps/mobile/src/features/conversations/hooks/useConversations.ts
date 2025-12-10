import { useCallback, useEffect } from "react";
import { getConversations } from "../api";
import {
  sortConversationsByDate,
  useConversationStore,
} from "../stores/conversationStore";

export function useConversations() {
  const {
    conversations,
    isLoading,
    error,
    setConversations,
    setLoading,
    setError,
  } = useConversationStore();

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getConversations();
      setConversations(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch conversations",
      );
    } finally {
      setLoading(false);
    }
  }, [setConversations, setLoading, setError]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const sortedConversations = sortConversationsByDate(conversations);

  return {
    conversations: sortedConversations,
    isLoading,
    error,
    refetch: fetchConversations,
  };
}
