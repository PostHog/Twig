export type ModelProvider = "anthropic" | "openai";

export type ModelProviderConfig = {
  name: string;
};

export interface ModelOption {
  id: string;
  name: string;
  provider: ModelProvider;
  enabled: boolean;
}

export const MODEL_PROVIDERS: Record<ModelProvider, ModelProviderConfig> = {
  anthropic: {
    name: "Anthropic",
  },
  openai: {
    name: "OpenAI",
  },
};

export const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: "claude-opus-4-5",
    name: "Claude Opus 4.5",
    provider: "anthropic",
    enabled: true,
  },
  {
    id: "claude-sonnet-4-5",
    name: "Claude Sonnet 4.5",
    provider: "anthropic",
    enabled: true,
  },
  { id: "gpt-5.1", name: "GPT 5.1", provider: "openai", enabled: false },
  {
    id: "gpt-5.1-codex-max",
    name: "GPT 5.1 Codex Max",
    provider: "openai",
    enabled: false,
  },
  {
    id: "gpt-5.1-codex-mini",
    name: "GPT 5.1 Codex Mini",
    provider: "openai",
    enabled: false,
  },
];

export const DEFAULT_MODEL = "claude-opus-4-5";

export function getModelById(id: string): ModelOption | undefined {
  return AVAILABLE_MODELS.find((m) => m.id === id && m.enabled);
}

export function getModelsByProvider(): Record<
  ModelProvider,
  ModelProviderConfig & { models: ModelOption[] }
> {
  return {
    anthropic: {
      ...MODEL_PROVIDERS.anthropic,
      models: AVAILABLE_MODELS.filter(
        (m) => m.provider === "anthropic" && m.enabled,
      ),
    },
    openai: {
      ...MODEL_PROVIDERS.openai,
      models: AVAILABLE_MODELS.filter(
        (m) => m.provider === "openai" && m.enabled,
      ),
    },
  };
}
