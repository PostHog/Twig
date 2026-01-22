import { useAuthenticatedQuery } from "@hooks/useAuthenticatedQuery";
import type { TaskReferencesResponse } from "@shared/types";

const taskReferenceKeys = {
  all: ["task-references"] as const,
  list: (taskId: string) => [...taskReferenceKeys.all, taskId] as const,
};

export function useTaskReferences(taskId: string) {
  return useAuthenticatedQuery<TaskReferencesResponse>(
    taskReferenceKeys.list(taskId),
    (client) => client.getTaskReferences(taskId),
    { enabled: !!taskId },
  );
}
