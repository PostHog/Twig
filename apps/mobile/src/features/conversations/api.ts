import { fetch } from "expo/fetch";
import { useAuthStore } from "@/features/auth";
import type { ConversationDetail } from "./types";

function getAuthHeaders(): { Authorization: string; "Content-Type": string } {
  const { oauthAccessToken } = useAuthStore.getState();
  if (!oauthAccessToken) {
    throw new Error("Not authenticated");
  }
  return {
    Authorization: `Bearer ${oauthAccessToken}`,
    "Content-Type": "application/json",
  };
}

function getBaseUrl(): string {
  const { cloudRegion, getCloudUrlFromRegion } = useAuthStore.getState();
  if (!cloudRegion) {
    throw new Error("No cloud region set");
  }
  return getCloudUrlFromRegion(cloudRegion);
}

function getProjectId(): number {
  const { projectId } = useAuthStore.getState();
  if (!projectId) {
    throw new Error("No project ID set");
  }
  return projectId;
}

export async function getConversations(): Promise<ConversationDetail[]> {
  const baseUrl = getBaseUrl();
  const projectId = getProjectId();
  const headers = getAuthHeaders();

  const response = await fetch(
    `${baseUrl}/api/environments/${projectId}/conversations/`,
    { headers },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch conversations: ${response.statusText}`);
  }

  const data = await response.json();
  return data.results ?? [];
}

export async function getConversation(
  conversationId: string,
): Promise<ConversationDetail> {
  const baseUrl = getBaseUrl();
  const projectId = getProjectId();
  const headers = getAuthHeaders();

  const response = await fetch(
    `${baseUrl}/api/environments/${projectId}/conversations/${conversationId}/`,
    { headers },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch conversation: ${response.statusText}`);
  }

  return await response.json();
}


