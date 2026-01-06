import { graphql } from "@octokit/graphql";
import type {
  PullRequest,
  PullRequestReviewState,
} from "@octokit/graphql-schema";
import { Octokit } from "@octokit/rest";
import { shellExecutor } from "./executor";
import { createError, err, ok, type Result } from "./result";

/** GraphQL response types for batch PR queries */
interface GraphQLPRNode {
  number: number;
  title: string;
  state: PullRequest["state"];
  merged: boolean;
  baseRefName: string;
  url: string;
  reviews: {
    nodes: Array<{
      state: PullRequestReviewState;
      author: { login: string } | null;
    }>;
  };
  timelineItems: {
    totalCount: number;
  };
}

type GraphQLBatchPRResponse = {
  repository: {
    [key: `pr${number}`]: GraphQLPRNode | null;
  };
};

const STACK_COMMENT_MARKER = "<!-- array-stack-comment -->";

export interface GitHubComment {
  id: number;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface PRStatus {
  number: number;
  state: "open" | "closed" | "merged";
  reviewDecision: "approved" | "changes_requested" | "review_required" | null;
  title: string;
  baseRefName: string;
  url: string;
  /** Number of times PR was submitted (1 = initial, 2+ = updated via force-push) */
  version: number;
}

export interface RepoInfo {
  owner: string;
  repo: string;
}

// Module-level caches (keyed by cwd)
const tokenCache = new Map<string, string>();
const repoCache = new Map<string, RepoInfo>();
const octokitCache = new Map<string, Octokit>();

async function getToken(cwd: string): Promise<string> {
  const cached = tokenCache.get(cwd);
  if (cached) return cached;

  const result = await shellExecutor.execute("gh", ["auth", "token"], { cwd });
  if (result.exitCode !== 0) {
    throw new Error(`Failed to get GitHub token: ${result.stderr}`);
  }
  const token = result.stdout.trim();
  tokenCache.set(cwd, token);
  return token;
}

async function getRepoInfo(cwd: string): Promise<Result<RepoInfo>> {
  const cached = repoCache.get(cwd);
  if (cached) return ok(cached);

  try {
    const result = await shellExecutor.execute(
      "git",
      ["config", "--get", "remote.origin.url"],
      { cwd },
    );

    if (result.exitCode !== 0) {
      return err(createError("COMMAND_FAILED", "No git remote found"));
    }

    const url = result.stdout.trim();
    const match = url.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
    if (!match) {
      return err(
        createError(
          "COMMAND_FAILED",
          "Could not parse GitHub repo from remote URL",
        ),
      );
    }

    const info = { owner: match[1], repo: match[2] };
    repoCache.set(cwd, info);
    return ok(info);
  } catch (e) {
    return err(createError("COMMAND_FAILED", `Failed to get repo info: ${e}`));
  }
}

async function getOctokit(cwd: string): Promise<Octokit> {
  const cached = octokitCache.get(cwd);
  if (cached) return cached;

  const token = await getToken(cwd);
  const octokit = new Octokit({ auth: token });
  octokitCache.set(cwd, octokit);
  return octokit;
}

function isProtectedBranch(branchName: string): boolean {
  const protectedBranches = ["main", "master", "trunk", "develop"];
  const lower = branchName.toLowerCase();
  return (
    protectedBranches.includes(branchName) || protectedBranches.includes(lower)
  );
}

function computeReviewDecision(
  reviews: GraphQLPRNode["reviews"]["nodes"],
): PRStatus["reviewDecision"] {
  const latestByUser = new Map<string, PullRequestReviewState>();
  for (const review of reviews) {
    if (review.state !== "PENDING" && review.state !== "COMMENTED") {
      latestByUser.set(review.author?.login ?? "", review.state);
    }
  }

  const states = [...latestByUser.values()];
  if (states.includes("CHANGES_REQUESTED")) return "changes_requested";
  if (states.includes("APPROVED")) return "approved";
  return null;
}

// ============ Exported Functions ============

export async function listComments(
  prNumber: number,
  cwd = process.cwd(),
): Promise<Result<GitHubComment[]>> {
  const repoResult = await getRepoInfo(cwd);
  if (!repoResult.ok) return repoResult;

  const { owner, repo } = repoResult.value;

  try {
    const octokit = await getOctokit(cwd);
    const { data } = await octokit.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
    });

    return ok(
      data.map((c) => ({
        id: c.id,
        body: c.body ?? "",
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      })),
    );
  } catch (e) {
    return err(createError("COMMAND_FAILED", `Failed to list comments: ${e}`));
  }
}

export async function createComment(
  prNumber: number,
  body: string,
  cwd = process.cwd(),
): Promise<Result<GitHubComment>> {
  const repoResult = await getRepoInfo(cwd);
  if (!repoResult.ok) return repoResult;

  const { owner, repo } = repoResult.value;

  try {
    const octokit = await getOctokit(cwd);
    const { data } = await octokit.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    });

    return ok({
      id: data.id,
      body: data.body ?? "",
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    });
  } catch (e) {
    return err(createError("COMMAND_FAILED", `Failed to create comment: ${e}`));
  }
}

export async function updateComment(
  commentId: number,
  body: string,
  cwd = process.cwd(),
): Promise<Result<void>> {
  const repoResult = await getRepoInfo(cwd);
  if (!repoResult.ok) return repoResult;

  const { owner, repo } = repoResult.value;

  try {
    const octokit = await getOctokit(cwd);
    await octokit.issues.updateComment({
      owner,
      repo,
      comment_id: commentId,
      body,
    });

    return ok(undefined);
  } catch (e) {
    return err(createError("COMMAND_FAILED", `Failed to update comment: ${e}`));
  }
}

export async function findStackComment(
  prNumber: number,
  cwd = process.cwd(),
): Promise<Result<GitHubComment | null>> {
  const commentsResult = await listComments(prNumber, cwd);
  if (!commentsResult.ok) return commentsResult;

  const stackComment = commentsResult.value.find((c) =>
    c.body.includes(STACK_COMMENT_MARKER),
  );
  return ok(stackComment ?? null);
}

export async function upsertStackComment(
  prNumber: number,
  body: string,
  cwd = process.cwd(),
): Promise<Result<GitHubComment>> {
  const markedBody = `${STACK_COMMENT_MARKER}\n${body}`;

  const existingResult = await findStackComment(prNumber, cwd);
  if (!existingResult.ok) return existingResult;

  if (existingResult.value) {
    const updateResult = await updateComment(
      existingResult.value.id,
      markedBody,
      cwd,
    );
    if (!updateResult.ok) return updateResult;
    return ok({ ...existingResult.value, body: markedBody });
  }

  return createComment(prNumber, markedBody, cwd);
}

export async function getPRStatus(
  prNumber: number,
  cwd = process.cwd(),
): Promise<Result<PRStatus>> {
  const result = await getMultiplePRStatuses([prNumber], cwd);
  if (!result.ok) return result;

  const status = result.value.get(prNumber);
  if (!status) {
    return err(createError("COMMAND_FAILED", `PR #${prNumber} not found`));
  }
  return ok(status);
}

export async function getMultiplePRStatuses(
  prNumbers: number[],
  cwd = process.cwd(),
): Promise<Result<Map<number, PRStatus>>> {
  if (prNumbers.length === 0) {
    return ok(new Map());
  }

  const repoResult = await getRepoInfo(cwd);
  if (!repoResult.ok) return repoResult;

  const { owner, repo } = repoResult.value;

  try {
    const prQueries = prNumbers
      .map(
        (num, i) => `
        pr${i}: pullRequest(number: ${num}) {
          number
          title
          state
          merged
          baseRefName
          url
          reviews(last: 50) {
            nodes {
              state
              author { login }
            }
          }
          timelineItems(itemTypes: [HEAD_REF_FORCE_PUSHED_EVENT], first: 100) {
            totalCount
          }
        }`,
      )
      .join("\n");

    const query = `
      query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          ${prQueries}
        }
      }
    `;

    const token = await getToken(cwd);

    const response = await graphql<GraphQLBatchPRResponse>(query, {
      owner,
      repo,
      headers: {
        authorization: `token ${token}`,
      },
    });

    const statuses = new Map<number, PRStatus>();

    for (let i = 0; i < prNumbers.length; i++) {
      const pr = response.repository[`pr${i}`];
      if (pr) {
        const forcePushCount = pr.timelineItems?.totalCount ?? 0;
        statuses.set(pr.number, {
          number: pr.number,
          title: pr.title,
          state: pr.merged
            ? "merged"
            : (pr.state.toLowerCase() as "open" | "closed"),
          reviewDecision: computeReviewDecision(pr.reviews.nodes),
          baseRefName: pr.baseRefName,
          url: pr.url,
          version: 1 + forcePushCount,
        });
      }
    }

    return ok(statuses);
  } catch (e) {
    return err(
      createError("COMMAND_FAILED", `Failed to get PR statuses: ${e}`),
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

export async function closePR(
  prNumber: number,
  cwd = process.cwd(),
): Promise<Result<void>> {
  const repoResult = await getRepoInfo(cwd);
  if (!repoResult.ok) return repoResult;

  const { owner, repo } = repoResult.value;

  try {
    const octokit = await getOctokit(cwd);
    await octokit.pulls.update({
      owner,
      repo,
      pull_number: prNumber,
      state: "closed",
    });

    return ok(undefined);
  } catch (e) {
    return err(createError("COMMAND_FAILED", `Failed to close PR: ${e}`));
  }
}

export async function updatePR(
  prNumber: number,
  options: { title?: string; body?: string; base?: string },
  cwd = process.cwd(),
): Promise<Result<void>> {
  const repoResult = await getRepoInfo(cwd);
  if (!repoResult.ok) return repoResult;

  const { owner, repo } = repoResult.value;

  try {
    const octokit = await getOctokit(cwd);
    await octokit.pulls.update({
      owner,
      repo,
      pull_number: prNumber,
      title: options.title,
      body: options.body,
      base: options.base,
    });

    return ok(undefined);
  } catch (e) {
    return err(createError("COMMAND_FAILED", `Failed to update PR: ${e}`));
  }
}

export async function updatePRBase(
  prNumber: number,
  newBase: string,
  cwd = process.cwd(),
): Promise<Result<void>> {
  return updatePR(prNumber, { base: newBase }, cwd);
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

export async function getPRForBranch(
  branchName: string,
  cwd = process.cwd(),
): Promise<Result<PRStatus | null>> {
  const result = await batchGetPRsForBranches([branchName], cwd);
  if (!result.ok) return result;
  return ok(result.value.get(branchName) ?? null);
}

export async function batchGetPRsForBranches(
  branchNames: string[],
  cwd = process.cwd(),
): Promise<Result<Map<string, PRStatus>>> {
  if (branchNames.length === 0) {
    return ok(new Map());
  }

  const repoResult = await getRepoInfo(cwd);
  if (!repoResult.ok) return repoResult;

  const { owner, repo } = repoResult.value;

  try {
    const branchQueries = branchNames
      .map(
        (branch, i) => `
        branch${i}: pullRequests(first: 5, headRefName: "${branch}", states: [OPEN, CLOSED, MERGED]) {
          nodes {
            number
            title
            state
            merged
            baseRefName
            url
            reviews(last: 50) {
              nodes {
                state
                author { login }
              }
            }
            timelineItems(itemTypes: [HEAD_REF_FORCE_PUSHED_EVENT], first: 100) {
              totalCount
            }
          }
        }`,
      )
      .join("\n");

    const query = `
      query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          ${branchQueries}
        }
      }
    `;

    const token = await getToken(cwd);

    type BranchPRResponse = {
      repository: {
        [key: `branch${number}`]: {
          nodes: Array<{
            number: number;
            title: string;
            state: "OPEN" | "CLOSED" | "MERGED";
            merged: boolean;
            baseRefName: string;
            url: string;
            reviews: {
              nodes: Array<{
                state: PullRequestReviewState;
                author: { login: string } | null;
              }>;
            };
            timelineItems: {
              totalCount: number;
            };
          }>;
        };
      };
    };

    const response = await graphql<BranchPRResponse>(query, {
      owner,
      repo,
      headers: {
        authorization: `token ${token}`,
      },
    });

    const prMap = new Map<string, PRStatus>();

    for (let i = 0; i < branchNames.length; i++) {
      const branchData = response.repository[`branch${i}`];
      const prs = branchData?.nodes ?? [];
      const pr = prs.find((p) => p.state === "OPEN") ?? prs[0];
      if (pr) {
        const forcePushCount = pr.timelineItems?.totalCount ?? 0;
        prMap.set(branchNames[i], {
          number: pr.number,
          title: pr.title,
          state: pr.merged
            ? "merged"
            : (pr.state.toLowerCase() as "open" | "closed"),
          reviewDecision: computeReviewDecision(pr.reviews.nodes),
          baseRefName: pr.baseRefName,
          url: pr.url,
          version: 1 + forcePushCount,
        });
      }
    }

    return ok(prMap);
  } catch (e) {
    return err(createError("COMMAND_FAILED", `Failed to list PRs: ${e}`));
  }
}

export async function deleteBranch(
  branchName: string,
  cwd = process.cwd(),
): Promise<Result<void>> {
  if (isProtectedBranch(branchName)) {
    return err(
      createError(
        "INVALID_STATE",
        `Cannot delete protected branch: ${branchName}`,
      ),
    );
  }

  const repoResult = await getRepoInfo(cwd);
  if (!repoResult.ok) return repoResult;

  const { owner, repo } = repoResult.value;

  try {
    const octokit = await getOctokit(cwd);
    await octokit.git.deleteRef({
      owner,
      repo,
      ref: `heads/${branchName}`,
    });
    return ok(undefined);
  } catch (e) {
    const error = e as Error & { status?: number };
    if (error.status === 422) {
      return ok(undefined);
    }
    return err(createError("COMMAND_FAILED", `Failed to delete branch: ${e}`));
  }
}

export async function waitForMergeable(
  prNumber: number,
  options?: { timeoutMs?: number; pollIntervalMs?: number },
  cwd = process.cwd(),
): Promise<Result<{ mergeable: boolean; reason?: string }>> {
  const repoResult = await getRepoInfo(cwd);
  if (!repoResult.ok) return repoResult;

  const { owner, repo } = repoResult.value;
  const timeoutMs = options?.timeoutMs ?? 30000;
  const pollIntervalMs = options?.pollIntervalMs ?? 2000;
  const startTime = Date.now();

  try {
    const octokit = await getOctokit(cwd);

    while (Date.now() - startTime < timeoutMs) {
      const { data: pr } = await octokit.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      });

      if (pr.mergeable === true) {
        return ok({ mergeable: true });
      }

      if (pr.mergeable === false) {
        return ok({
          mergeable: false,
          reason: pr.mergeable_state || "Has conflicts or other issues",
        });
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    return ok({
      mergeable: false,
      reason: "Timeout waiting for merge status",
    });
  } catch (e) {
    return err(
      createError("COMMAND_FAILED", `Failed to check mergeable status: ${e}`),
    );
  }
}
