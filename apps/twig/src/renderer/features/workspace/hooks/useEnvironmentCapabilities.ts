import type { EnvironmentCapabilities } from "@shared/types";
import { selectCapabilities, useWorkspaceStore } from "../stores/workspaceStore";

export function useEnvironmentCapabilities(
  taskId: string | undefined,
): EnvironmentCapabilities | null {
  return useWorkspaceStore((state) =>
    taskId ? selectCapabilities(taskId)(state) : null,
  );
}
