import type { WorkflowRuntime, WorkflowStepDefinition } from "./types.js";

interface FinalizeGitOptions {
  commitMessage: string;
  allowEmptyCommit?: boolean;
}

/**
 * Commits (and optionally pushes) any staged changes according to the step configuration.
 * Returns true if a commit was created.
 */
export async function finalizeStepGitActions(
  context: WorkflowRuntime,
  step: WorkflowStepDefinition,
  options: FinalizeGitOptions,
): Promise<boolean> {
  if (!step.commit) {
    return false;
  }

  const { gitManager, logger } = context;
  const hasStagedChanges = await gitManager.hasStagedChanges();

  if (!hasStagedChanges && !options.allowEmptyCommit) {
    logger.debug("No staged changes to commit for step", { stepId: step.id });
    return false;
  }

  try {
    await gitManager.commitChanges(options.commitMessage);
    logger.info("Committed changes for step", {
      stepId: step.id,
      message: options.commitMessage,
    });
  } catch (error) {
    logger.error("Failed to commit changes for step", {
      stepId: step.id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  if (step.push) {
    const branchName = await gitManager.getCurrentBranch();
    await gitManager.pushBranch(branchName);
    logger.info("Pushed branch after step", {
      stepId: step.id,
      branch: branchName,
    });
  }

  return true;
}
