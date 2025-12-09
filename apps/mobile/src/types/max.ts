// Simplified types for Max conversation in mobile app
// Based on posthog/frontend/src/queries/schema/schema-assistant-messages.ts

export enum AssistantMessageType {
  Human = "human",
  Assistant = "ai",
  Artifact = "ai/artifact",
  Failure = "ai/failure",
}

/** Source of artifact - determines which model to fetch from */
export enum ArtifactSource {
  /** Artifact created by the agent (stored in AgentArtifact) */
  Artifact = "artifact",
  /** Reference to a saved insight (stored in Insight model) */
  Insight = "insight",
  /** Legacy visualization message converted to artifact (content stored inline in state) */
  State = "state",
}

/** Type of artifact content */
export enum ArtifactContentType {
  /** Visualization artifact (chart, graph, etc.) */
  Visualization = "visualization",
  /** Notebook */
  Notebook = "notebook",
}

export enum AssistantEventType {
  Status = "status",
  Message = "message",
  Conversation = "conversation",
}

export enum AssistantGenerationStatusType {
  Acknowledged = "ack",
  GenerationError = "generation_error",
}

export interface BaseAssistantMessage {
  id?: string;
}

export interface HumanMessage extends BaseAssistantMessage {
  type: AssistantMessageType.Human;
  content: string;
}

export interface AssistantMessage extends BaseAssistantMessage {
  type: AssistantMessageType.Assistant;
  content: string;
  meta?: {
    thinking?: Array<{ type: string; thinking: string }>;
  };
}

export interface FailureMessage extends BaseAssistantMessage {
  type: AssistantMessageType.Failure;
  content?: string;
}

export interface VisualizationArtifactContent {
  content_type: ArtifactContentType.Visualization;
  // biome-ignore lint/suspicious/noExplicitAny: Query can be any insight query type
  query: Record<string, any>;
  name?: string | null;
  description?: string | null;
  // Cached results from the query execution
  // biome-ignore lint/suspicious/noExplicitAny: Results structure varies by query type
  cachedResults?: Record<string, any>;
}

export interface NotebookArtifactContent {
  content_type: ArtifactContentType.Notebook;
}

export type ArtifactContent =
  | VisualizationArtifactContent
  | NotebookArtifactContent;

export interface ArtifactMessage extends BaseAssistantMessage {
  type: AssistantMessageType.Artifact;
  /** The ID of the artifact (short_id for both drafts and saved insights) */
  artifact_id: string;
  /** Source of artifact - determines which model to fetch from */
  source: ArtifactSource;
  /** Content of artifact */
  content: ArtifactContent;
}

export type RootAssistantMessage =
  | HumanMessage
  | AssistantMessage
  | ArtifactMessage
  | FailureMessage;

export type MessageStatus = "loading" | "completed" | "error";

export type ThreadMessage = RootAssistantMessage & {
  status: MessageStatus;
};

export interface Conversation {
  id: string;
  title?: string | null;
  created_at: string;
  updated_at: string;
  status: ConversationStatus;
}

export enum ConversationStatus {
  Idle = "idle",
  InProgress = "in_progress",
}

export interface AssistantGenerationStatusEvent {
  type: AssistantGenerationStatusType;
}

// Helper type guards
export function isHumanMessage(
  message: RootAssistantMessage,
): message is HumanMessage {
  return message.type === AssistantMessageType.Human;
}

export function isAssistantMessage(
  message: RootAssistantMessage,
): message is AssistantMessage {
  return message.type === AssistantMessageType.Assistant;
}

export function isFailureMessage(
  message: RootAssistantMessage,
): message is FailureMessage {
  return message.type === AssistantMessageType.Failure;
}

export function isArtifactMessage(
  message: RootAssistantMessage,
): message is ArtifactMessage {
  return message.type === AssistantMessageType.Artifact;
}

export function isVisualizationArtifactContent(
  content: ArtifactContent,
): content is VisualizationArtifactContent {
  return content.content_type === ArtifactContentType.Visualization;
}
