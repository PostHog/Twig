export interface GatewayModel {
  id: string;
  owned_by: string;
  context_window: number;
  supports_streaming: boolean;
  supports_vision: boolean;
}

interface GatewayModelsResponse {
  object: "list";
  data: GatewayModel[];
}

export interface FetchGatewayModelsOptions {
  gatewayUrl: string;
}

export const DEFAULT_GATEWAY_MODEL = "claude-opus-4-6";

export const BLOCKED_MODELS = new Set(["gpt-5-mini", "openai/gpt-5-mini"]);

type ArrayModelsResponse =
  | {
      data?: Array<{ id?: string; owned_by?: string }>;
      models?: Array<{ id?: string; owned_by?: string }>;
    }
  | Array<{ id?: string; owned_by?: string }>;

export async function fetchGatewayModels(
  options?: FetchGatewayModelsOptions,
): Promise<GatewayModel[]> {
  const gatewayUrl = options?.gatewayUrl ?? process.env.ANTHROPIC_BASE_URL;
  if (!gatewayUrl) {
    return [];
  }

  const modelsUrl = `${gatewayUrl}/v1/models`;

  try {
    const response = await fetch(modelsUrl);

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as GatewayModelsResponse;
    const models = data.data ?? [];
    return models.filter((m) => !BLOCKED_MODELS.has(m.id));
  } catch {
    return [];
  }
}

export function isAnthropicModel(model: GatewayModel): boolean {
  if (model.owned_by) {
    return model.owned_by === "anthropic";
  }
  return model.id.startsWith("claude-") || model.id.startsWith("anthropic/");
}

export async function fetchArrayModelIds(
  options?: FetchGatewayModelsOptions,
): Promise<string[]> {
  const models = await fetchArrayModels(options);
  return models.map((model) => model.id);
}

export interface ArrayModelInfo {
  id: string;
  owned_by?: string;
}

export async function fetchArrayModels(
  options?: FetchGatewayModelsOptions,
): Promise<ArrayModelInfo[]> {
  const gatewayUrl = options?.gatewayUrl ?? process.env.ANTHROPIC_BASE_URL;
  if (!gatewayUrl) {
    return [];
  }

  try {
    const base = new URL(gatewayUrl);
    base.pathname = "/array/v1/models";
    base.search = "";
    base.hash = "";
    const response = await fetch(base.toString());
    if (!response.ok) {
      return [];
    }
    const data = (await response.json()) as ArrayModelsResponse;
    const models = Array.isArray(data)
      ? data
      : (data.data ?? data.models ?? []);
    const results: ArrayModelInfo[] = [];
    for (const model of models) {
      const id = model?.id ? String(model.id) : "";
      if (!id) continue;
      results.push({ id, owned_by: model?.owned_by });
    }
    return results;
  } catch {
    return [];
  }
}

const PROVIDER_NAMES: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  "google-vertex": "Gemini",
};

export function getProviderName(ownedBy: string): string {
  return PROVIDER_NAMES[ownedBy] ?? ownedBy;
}

const PROVIDER_PREFIXES = ["anthropic/", "openai/", "google-vertex/"];

export function formatGatewayModelName(model: GatewayModel): string {
  let cleanId = model.id;
  for (const prefix of PROVIDER_PREFIXES) {
    if (cleanId.startsWith(prefix)) {
      cleanId = cleanId.slice(prefix.length);
      break;
    }
  }

  cleanId = cleanId.replace(/(\d)-(\d)/g, "$1.$2");

  const words = cleanId.split(/[-_]/).map((word) => {
    if (word.match(/^[0-9.]+$/)) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });

  return words.join(" ");
}
