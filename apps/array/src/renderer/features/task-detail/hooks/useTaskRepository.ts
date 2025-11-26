import type { Task } from "@shared/types";
import { repositoryWorkspaceStore } from "@stores/repositoryWorkspaceStore";

interface UseTaskRepositoryParams {
  task: Task;
  isCloning: boolean;
}

export function useTaskRepository({
  task,
  isCloning,
}: UseTaskRepositoryParams) {
  const handleClone = async () => {
    if (!task.repository) return;
    await repositoryWorkspaceStore.getState().selectRepository(task.repository);
  };

  return {
    clone: handleClone,
    isCloning,
    hasRepository: !!task.repository,
  };
}
