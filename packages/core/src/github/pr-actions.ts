import { shellExecutor } from "../executor";
import { createError, err, ok, type Result } from "../result";
import { isProtectedBranch } from "./branch";
import { getOctokit, getRepoInfo, withGitHub } from "./client";

export async function createPR(
  options: {
    head: string;
    title?: string;
    body?: string;
    base?: string;
    draft?: boolean;
  },
  cwd = process.cwd(),
): Promise<Result<{ url: string; number: number }>> {
  const repoResult = await getRepoInfo(cwd);
  if (!repoResult.ok) return repoResult;

  const { owner, repo } = repoResult.value;

  try {
    const octokit = await getOctokit(cwd);
    const { data: pr } = await octokit.pulls.create({
      owner,
      repo,
      head: options.head,
      title: options.title ?? options.head,
      body: options.body,
      base: options.base ?? "main",
      draft: options.draft,
    });

    return ok({ url: pr.html_url, number: pr.number });
  } catch (e) {
    // Special error handling for PR creation - extract GitHub's error details
    const error = e as Error & {
      status?: number;
      response?: {
        data?: {
          message?: string;
          errors?: Array<{
            message?: string;
            resource?: string;
            field?: string;
            code?: string;
          }>;
        };
      };
    };
    const ghMessage = error.response?.data?.message || error.message;
    const ghErrors = error.response?.data?.errors
      ?.map((err) => err.message || `${err.resource}.${err.field}: ${err.code}`)
      .join(", ");
    const details = ghErrors ? `${ghMessage}: ${ghErrors}` : ghMessage;

    // Log full error for debugging
    console.error("[createPR] GitHub API error:", {
      status: error.status,
      message: ghMessage,
      errors: error.response?.data?.errors,
      head: options.head,
      base: options.base,
    });

    return err(
      createError("COMMAND_FAILED", `Failed to create PR: ${details}`),
    );
  }
}

export async function mergePR(
  prNumber: number,
  options?: {
    method?: "merge" | "squash" | "rebase";
    deleteHead?: boolean;
    headRef?: string;
  },
  cwd = process.cwd(),
): Promise<Result<void>> {
  const repoResult = await getRepoInfo(cwd);
  if (!repoResult.ok) return repoResult;

  const { owner, repo } = repoResult.value;
  const method = options?.method ?? "squash";

  try {
    const octokit = await getOctokit(cwd);
    await octokit.pulls.merge({
      owner,
      repo,
      pull_number: prNumber,
      merge_method: method,
    });

    if (options?.deleteHead && options?.headRef) {
      if (isProtectedBranch(options.headRef)) {
        console.error(
          `SAFETY: Refusing to delete protected branch: ${options.headRef}`,
        );
        return ok(undefined);
      }

      try {
        await octokit.git.deleteRef({
          owner,
          repo,
          ref: `heads/${options.headRef}`,
        });
      } catch {
        // Branch deletion is best-effort
      }
    }

    return ok(undefined);
  } catch (e) {
    // Special error handling for merge - detect specific failure modes
    const error = e as Error & { status?: number; message?: string };
    if (error.status === 405) {
      return err(
        createError(
          "MERGE_BLOCKED",
          "PR is not mergeable. Check for conflicts or required status checks.",
        ),
      );
    }
    if (error.message?.includes("already been merged")) {
      return err(createError("ALREADY_MERGED", "PR has already been merged"));
    }
    return err(createError("COMMAND_FAILED", `Failed to merge PR: ${e}`));
  }
}

export function closePR(
  prNumber: number,
  cwd = process.cwd(),
): Promise<Result<void>> {
  return withGitHub(cwd, "close PR", async ({ octokit, owner, repo }) => {
    await octokit.pulls.update({
      owner,
      repo,
      pull_number: prNumber,
      state: "closed",
    });
  });
}

export function updatePR(
  prNumber: number,
  options: { title?: string; body?: string; base?: string },
  cwd = process.cwd(),
): Promise<Result<void>> {
  return withGitHub(cwd, "update PR", async ({ octokit, owner, repo }) => {
    await octokit.pulls.update({
      owner,
      repo,
      pull_number: prNumber,
      title: options.title,
      body: options.body,
      base: options.base,
    });
  });
}

export async function updatePRBranch(
  prNumber: number,
  options?: { rebase?: boolean },
  cwd = process.cwd(),
): Promise<Result<void>> {
  const repoResult = await getRepoInfo(cwd);
  if (!repoResult.ok) return repoResult;

  const { owner, repo } = repoResult.value;

  try {
    if (options?.rebase) {
      // gh CLI is needed for rebase - octokit doesn't support it
      const result = await shellExecutor.execute(
        "gh",
        [
          "pr",
          "update-branch",
          String(prNumber),
          "--rebase",
          "-R",
          `${owner}/${repo}`,
        ],
        { cwd },
      );
      if (result.exitCode !== 0) {
        return err(
          createError(
            "COMMAND_FAILED",
            `Failed to update PR branch: ${result.stderr}`,
          ),
        );
      }
      return ok(undefined);
    }

    const octokit = await getOctokit(cwd);
    await octokit.pulls.updateBranch({
      owner,
      repo,
      pull_number: prNumber,
    });

    return ok(undefined);
  } catch (e) {
    return err(
      createError("COMMAND_FAILED", `Failed to update PR branch: ${e}`),
    );
  }
}

export interface WaitForMergeableOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  /** Callback when status changes, for UI updates */
  onStatusChange?: (status: {
    mergeable: boolean | null;
    state: string;
    checksComplete: boolean;
  }) => void;
}

export function waitForMergeable(
  prNumber: number,
  options?: WaitForMergeableOptions,
  cwd = process.cwd(),
): Promise<Result<{ mergeable: boolean; reason?: string }>> {
  const timeoutMs = options?.timeoutMs ?? 300000; // 5 minutes default
  const pollIntervalMs = options?.pollIntervalMs ?? 5000;

  return withGitHub(
    cwd,
    "check mergeable status",
    async ({ octokit, owner, repo }) => {
      const startTime = Date.now();
      let lastState = "";

      while (Date.now() - startTime < timeoutMs) {
        const { data: pr } = await octokit.pulls.get({
          owner,
          repo,
          pull_number: prNumber,
        });

        // mergeable_state values:
        // - "clean": can merge, all checks passed
        // - "blocked": checks pending or required reviews missing
        // - "dirty": has conflicts
        // - "unstable": has failing checks but can still merge
        // - "unknown": GitHub is computing
        const state = pr.mergeable_state || "unknown";
        const checksComplete = state !== "blocked" && state !== "unknown";

        // Notify caller of status change
        if (state !== lastState) {
          options?.onStatusChange?.({
            mergeable: pr.mergeable,
            state,
            checksComplete,
          });
          lastState = state;
        }

        // "clean" means mergeable AND all required checks passed
        if (state === "clean" && pr.mergeable === true) {
          return { mergeable: true };
        }

        // "unstable" means checks failed but PR is still mergeable (non-required checks)
        if (state === "unstable" && pr.mergeable === true) {
          return { mergeable: true };
        }

        // Has conflicts
        if (state === "dirty") {
          return {
            mergeable: false,
            reason: "Has merge conflicts",
          };
        }

        // Explicit not mergeable
        if (pr.mergeable === false && state !== "unknown") {
          return {
            mergeable: false,
            reason: state || "Not mergeable",
          };
        }

        // "blocked" or "unknown" - keep waiting
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }

      return {
        mergeable: false,
        reason: "Timeout waiting for CI checks",
      };
    },
  );
}
