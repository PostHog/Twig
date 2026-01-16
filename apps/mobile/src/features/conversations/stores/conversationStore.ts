import type { ConversationDetail } from "../types";

export function sortConversationsByDate(
  conversations: ConversationDetail[],
): ConversationDetail[] {
  return [...conversations].sort((a, b) => {
    const dateA = a.updated_at || a.created_at || "";
    const dateB = b.updated_at || b.created_at || "";
    return dateB.localeCompare(dateA);
  });
}
