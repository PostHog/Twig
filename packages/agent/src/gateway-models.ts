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

export const DEFAULT_GATEWAY_MODEL = "claude-opus-4-5";

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
    return data.data ?? [];
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
