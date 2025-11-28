import type { AgentEvent, ArtifactEvent, StatusEvent } from "../types.js";

/**
 * Provider adapter interface for transforming provider-specific messages
 * into our standardized AgentEvent format.
 *
 * This allows us to support multiple AI providers (Claude, Gemini, OpenAI, etc.)
 * while maintaining a consistent event interface for consumers.
 */
export interface ProviderAdapter {
  /** Provider name (e.g., 'claude', 'gemini') */
  name: string;

  /**
   * Transform a provider-specific SDK message into one or more AgentEvents.
   * Returns an array of events (can be empty if the message should be ignored).
   */
  transform(sdkMessage: unknown): AgentEvent[];

  /**
   * Create a standardized status event.
   * Used for task phase transitions and other status updates.
   */
  createStatusEvent(phase: string, additionalData?: unknown): StatusEvent;

  /**
   * Create an artifact event for custom task artifacts (todos, etc).
   * Used to emit structured artifacts for UI consumption.
   */
  createArtifactEvent(kind: string, content: unknown): ArtifactEvent;

  /**
   * Create a raw SDK event for debugging purposes.
   * Wraps the original SDK message in a raw_sdk_event.
   */
  createRawSDKEvent(sdkMessage: any): AgentEvent;
}
