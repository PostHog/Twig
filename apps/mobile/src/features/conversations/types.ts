export interface UserBasicType {
  uuid: string;
  distinct_id: string;
  first_name: string;
  last_name?: string;
  email: string;
}

export enum ConversationStatus {
  Idle = "idle",
  InProgress = "in_progress",
}

export enum ConversationType {
  Chat = "chat",
  DeepResearch = "deep_research",
}

export interface Conversation {
  id: string;
  user: UserBasicType;
  status: ConversationStatus;
  title: string | null;
  created_at: string | null;
  updated_at: string | null;
  type: ConversationType;
  has_unsupported_content?: boolean;
  agent_mode?: string | null;
}

export enum AssistantMessageType {
  Human = "human",
  Assistant = "ai",
  ToolCall = "tool",
  Failure = "ai/failure",
}

export interface HumanMessage {
  type: AssistantMessageType.Human;
  content: string;
  id?: string;
}

export interface AssistantMessage {
  type: AssistantMessageType.Assistant;
  content: string;
  id?: string;
}

export interface FailureMessage {
  type: AssistantMessageType.Failure;
  content: string;
  id?: string;
}

export type RootAssistantMessage =
  | HumanMessage
  | AssistantMessage
  | FailureMessage;

export interface ConversationDetail extends Conversation {
  messages: RootAssistantMessage[];
}
