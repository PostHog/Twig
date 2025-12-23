export type ModelProvider = "anthropic" | "openai" | "gemini";

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
  gemini: {
    name: "Google",
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
  { id: "gpt-5.2", name: "GPT 5.2", provider: "openai", enabled: true },
  {
    id: "gpt-5.1-codex-max",
    name: "GPT 5.1 Codex Max",
    provider: "openai",
    enabled: true,
  },
  {
    id: "gpt-5.1-codex-mini",
    name: "GPT 5.1 Codex Mini",
    provider: "openai",
    enabled: true,
  },
  {
    id: "gemini/gemini-3-pro-preview",
    name: "Gemini 3.0 Pro",
    provider: "gemini",
    enabled: true,
  },
  {
    id: "gemini/gemini-3-flash-preview",
    name: "Gemini 3.0 Flash",
    provider: "gemini",
    enabled: true,
  },
];

export const DEFAULT_MODEL = "claude-opus-4-5";

// Agent frameworks
export type AgentFramework = "claude" | "codex";

export interface FrameworkOption {
  id: AgentFramework;
  name: string;
  description: string;
  enabled: boolean;
}

export const AVAILABLE_FRAMEWORKS: FrameworkOption[] = [
  {
    id: "claude",
    name: "Claude Code",
    description: "Anthropic's Claude Code agent",
    enabled: true,
  },
  {
    id: "codex",
    name: "OpenAI Codex",
    description: "OpenAI's Codex agent",
    enabled: true,
  },
];

export const DEFAULT_FRAMEWORK: AgentFramework = "claude";

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
    gemini: {
      ...MODEL_PROVIDERS.gemini,
      models: AVAILABLE_MODELS.filter(
        (m) => m.provider === "gemini" && m.enabled,
      ),
    },
  };
}
