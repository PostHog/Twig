import { DEFAULT_GATEWAY_MODEL } from "@posthog/agent/gateway-models";
import { trpcVanilla } from "@renderer/trpc/client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getCloudUrlFromRegion } from "@/constants/oauth";

export interface ModelOption {
  modelId: string;
  name: string;
  description?: string | null;
  provider?: string;
}

export interface GroupedModels {
  provider: string;
  models: ModelOption[];
}

const PROVIDER_ORDER = ["Anthropic", "OpenAI", "Gemini"];

function groupModels(models: ModelOption[]): GroupedModels[] {
  const grouped: Record<string, ModelOption[]> = {};

  for (const model of models) {
    const provider = model.provider ?? "Other";
    if (!grouped[provider]) {
      grouped[provider] = [];
    }
    grouped[provider].push(model);
  }

  const providers = Object.keys(grouped).sort((a, b) => {
    const aIndex = PROVIDER_ORDER.indexOf(a);
    const bIndex = PROVIDER_ORDER.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  return providers.map((provider) => ({
    provider,
    models: grouped[provider],
  }));
}

interface ModelsState {
  models: ModelOption[];
  groupedModels: GroupedModels[];
  selectedModel: string;
  isLoading: boolean;
  error: string | null;

  fetchModels: () => Promise<void>;
  setSelectedModel: (modelId: string) => void;
  getEffectiveModel: () => string;
}

async function getAuthStore() {
  const authModule = await import("@features/auth/stores/authStore");
  return authModule.useAuthStore;
}

export const useModelsStore = create<ModelsState>()(
  persist(
    (set, get) => ({
      models: [],
      groupedModels: [],
      selectedModel: DEFAULT_GATEWAY_MODEL,
      isLoading: false,
      error: null,

      fetchModels: async () => {
        const authStore = await getAuthStore();
        const authState = authStore.getState();

        if (
          !authState.isAuthenticated ||
          !authState.cloudRegion ||
          !authState.oauthAccessToken
        ) {
          return;
        }

        if (get().isLoading) {
          return;
        }

        set({ isLoading: true, error: null });

        try {
          const apiHost = getCloudUrlFromRegion(authState.cloudRegion);
          const models = await trpcVanilla.agent.getGatewayModels.query({
            apiHost,
            apiKey: authState.oauthAccessToken,
          });

          set({
            models,
            groupedModels: groupModels(models),
            isLoading: false,
          });
        } catch (err) {
          set({
            error:
              err instanceof Error ? err.message : "Failed to fetch models",
            isLoading: false,
          });
        }
      },

      setSelectedModel: (modelId: string) => {
        set({ selectedModel: modelId });
      },

      getEffectiveModel: () => {
        const { selectedModel, models } = get();
        const modelExists = models.some((m) => m.modelId === selectedModel);
        if (modelExists) {
          return selectedModel;
        }
        return DEFAULT_GATEWAY_MODEL;
      },
    }),
    {
      name: "models-storage",
      partialize: (state) => ({ selectedModel: state.selectedModel }),
    },
  ),
);

let authSubscriptionInitialized = false;

async function initializeModelsAuthSubscription() {
  if (authSubscriptionInitialized) {
    return;
  }

  const authStore = await getAuthStore();
  authSubscriptionInitialized = true;

  authStore.subscribe(
    (state) => state.isAuthenticated,
    (isAuthenticated) => {
      if (isAuthenticated) {
        void useModelsStore.getState().fetchModels();
      } else {
        useModelsStore.setState({ models: [], groupedModels: [], error: null });
      }
    },
    { fireImmediately: true },
  );
}

void initializeModelsAuthSubscription();
