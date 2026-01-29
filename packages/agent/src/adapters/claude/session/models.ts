export const DEFAULT_MODEL = "opus";

const GATEWAY_TO_SDK_MODEL: Record<string, string> = {
  "claude-opus-4-5": "opus",
  "claude-sonnet-4-5": "sonnet",
  "claude-haiku-4-5": "haiku",
};

export function toSdkModelId(modelId: string): string {
  return GATEWAY_TO_SDK_MODEL[modelId] ?? modelId;
}
