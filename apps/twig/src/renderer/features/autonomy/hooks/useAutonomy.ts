import { useAuthStore } from "@features/auth/stores/authStore";
import { useAuthenticatedQuery } from "@hooks/useAuthenticatedQuery";

interface AutonomySettings {
  proactive_tasks_enabled?: boolean;
}

export function useAutonomy(): boolean {
  const projectId = useAuthStore((state) => state.projectId);
  const { data: autonomySettings } = useAuthenticatedQuery<AutonomySettings>(
    ["inbox", "autonomy-settings", projectId],
    (client) =>
      projectId
        ? client.getProjectAutonomySettings(projectId)
        : Promise.resolve({}),
    {
      enabled: !!projectId,
      staleTime: 30 * 1000,
    },
  );

  return autonomySettings?.proactive_tasks_enabled === true;
}
