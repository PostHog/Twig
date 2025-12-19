/**
 * Shared path utilities for PostHog task artifacts.
 *
 * The .posthog folder structure:
 *   .posthog/
 *     {taskId}/
 *       plan.md
 *       context.md
 *       ...other artifacts
 */

/** Base folder name for PostHog artifacts */
export const POSTHOG_FOLDER = ".posthog";

/** Get the directory path for a task's artifacts */
export function getTaskDir(cwd: string, taskId: string): string {
  return `${cwd}/${POSTHOG_FOLDER}/${taskId}`;
}

/** Get the path to a task's plan file */
export function getPlanPath(cwd: string, taskId: string): string {
  return `${getTaskDir(cwd, taskId)}/plan.md`;
}

/** Get the path to any task artifact */
export function getTaskArtifactPath(
  cwd: string,
  taskId: string,
  fileName: string,
): string {
  return `${getTaskDir(cwd, taskId)}/${fileName}`;
}
