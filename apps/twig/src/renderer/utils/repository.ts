import type { Task } from "@shared/types";

export const parseRepository = (
  repository: string,
): { organization: string; repoName: string } | null => {
  const result = repository.split("/");

  if (result.length !== 2) {
    return null;
  }

  return { organization: result[0], repoName: result[1] };
};

export function getTaskRepository(task: Task): string | null {
  return task.repository ?? null;
}

export const REPO_NOT_IN_INTEGRATION_WARNING =
  "This repository is not connected to your GitHub integration. Tasks which run in the cloud won't be able to create PRs.";
