import type { SessionNotification } from "@agentclientprotocol/sdk";
import type { PermissionMode } from "@anthropic-ai/claude-agent-sdk";

export interface SessionState {
  permissionMode: PermissionMode;
  notificationHistory: SessionNotification[];
  lastPlanFilePath?: string;
  lastPlanContent?: string;
  cancelled: boolean;
}
