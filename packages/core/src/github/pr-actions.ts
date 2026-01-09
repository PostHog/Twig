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
        data?: { message?: string; errors?: Array<{ message?: string }> };
      };
    };
    const ghMessage = error.response?.data?.message || error.message;
    const ghErrors = error.response?.data?.errors
      ?.map((err) => err.message)
      .join(", ");
    const details = ghErrors ? `${ghMessage} (${ghErrors})` : ghMessage;
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

export function waitForMergeable(
  prNumber: number,
  options?: { timeoutMs?: number; pollIntervalMs?: number },
  cwd = process.cwd(),
): Promise<Result<{ mergeable: boolean; reason?: string }>> {
  const timeoutMs = options?.timeoutMs ?? 30000;
  const pollIntervalMs = options?.pollIntervalMs ?? 2000;

  return withGitHub(
    cwd,
    "check mergeable status",
    async ({ octokit, owner, repo }) => {
      const startTime = Date.now();

      while (Date.now() - startTime < timeoutMs) {
        const { data: pr } = await octokit.pulls.get({
          owner,
          repo,
          pull_number: prNumber,
        });

        if (pr.mergeable === true) {
          return { mergeable: true };
        }

        if (pr.mergeable === false) {
          return {
            mergeable: false,
            reason: pr.mergeable_state || "Has conflicts or other issues",
          };
        }

        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }

      return {
        mergeable: false,
        reason: "Timeout waiting for merge status",
      };
    },
  );
}
