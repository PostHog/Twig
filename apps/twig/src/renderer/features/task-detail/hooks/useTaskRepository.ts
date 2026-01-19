import type { Task } from "@shared/types";
import { repositoryWorkspaceStore } from "@stores/repositoryWorkspaceStore";
import { getTaskRepository } from "@utils/repository";

interface UseTaskRepositoryParams {
  task: Task;
  isCloning: boolean;
}

export function useTaskRepository({
  task,
  isCloning,
}: UseTaskRepositoryParams) {
  const repository = getTaskRepository(task);

  const handleClone = async () => {
    if (!repository) return;
    await repositoryWorkspaceStore.getState().selectRepository(repository);
  };

  return {
    clone: handleClone,
    isCloning,
    hasRepository: !!repository,
  };
}
