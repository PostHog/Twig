import { graphql } from "@octokit/graphql";
import type { PullRequestReviewState } from "@octokit/graphql-schema";
import { createError, err, ok, type Result } from "../result";
import { getRepoInfo, getToken } from "./client";

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

/** GraphQL fields for fetching PR status - shared between queries */
const PR_STATUS_FIELDS = `
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
`;

/** GraphQL response shape for a single PR */
interface GraphQLPRNode {
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

/** Map a GraphQL PR node to our PRStatus type */
function mapPRNodeToStatus(pr: GraphQLPRNode): PRStatus {
  const forcePushCount = pr.timelineItems?.totalCount ?? 0;
  return {
    number: pr.number,
    title: pr.title,
    state: pr.merged ? "merged" : (pr.state.toLowerCase() as "open" | "closed"),
    reviewDecision: computeReviewDecision(pr.reviews.nodes),
    baseRefName: pr.baseRefName,
    url: pr.url,
    version: 1 + forcePushCount,
  };
}

async function _getPRStatus(
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
        (num, i) =>
          `pr${i}: pullRequest(number: ${num}) { ${PR_STATUS_FIELDS} }`,
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

    type Response = {
      repository: { [key: `pr${number}`]: GraphQLPRNode | null };
    };

    const response = await graphql<Response>(query, {
      owner,
      repo,
      headers: { authorization: `token ${token}` },
    });

    const statuses = new Map<number, PRStatus>();
    for (let i = 0; i < prNumbers.length; i++) {
      const pr = response.repository[`pr${i}`];
      if (pr) {
        statuses.set(pr.number, mapPRNodeToStatus(pr));
      }
    }

    return ok(statuses);
  } catch (e) {
    return err(
      createError("COMMAND_FAILED", `Failed to get PR statuses: ${e}`),
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
        (branch, i) =>
          `branch${i}: pullRequests(first: 5, headRefName: "${branch}", states: [OPEN, CLOSED, MERGED]) {
            nodes { ${PR_STATUS_FIELDS} }
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

    type Response = {
      repository: { [key: `branch${number}`]: { nodes: GraphQLPRNode[] } };
    };

    const response = await graphql<Response>(query, {
      owner,
      repo,
      headers: { authorization: `token ${token}` },
    });

    const prMap = new Map<string, PRStatus>();
    for (let i = 0; i < branchNames.length; i++) {
      const branchData = response.repository[`branch${i}`];
      const prs = branchData?.nodes ?? [];
      // Prefer open PR, otherwise take first (most recent)
      const pr = prs.find((p) => p.state === "OPEN") ?? prs[0];
      if (pr) {
        prMap.set(branchNames[i], mapPRNodeToStatus(pr));
      }
    }

    return ok(prMap);
  } catch (e) {
    return err(createError("COMMAND_FAILED", `Failed to list PRs: ${e}`));
  }
}
