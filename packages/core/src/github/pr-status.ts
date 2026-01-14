import { graphql } from "@octokit/graphql";
import type { PullRequestReviewState } from "@octokit/graphql-schema";
import type { PRInfo, ReviewDecision } from "../git/metadata";
import { createError, err, ok, type Result } from "../result";
import { getRepoInfo, getToken } from "./client";

// Re-export PRInfo as the unified type for PR data
export type { PRInfo };

/** GraphQL fields for fetching PR status - shared between queries */
const PR_STATUS_FIELDS = `
  number
  title
  state
  merged
  baseRefName
  headRefName
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
  headRefName: string;
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
): ReviewDecision | null {
  const latestByUser = new Map<string, PullRequestReviewState>();
  for (const review of reviews) {
    if (review.state !== "PENDING" && review.state !== "COMMENTED") {
      latestByUser.set(review.author?.login ?? "", review.state);
    }
  }

  const states = [...latestByUser.values()];
  if (states.includes("CHANGES_REQUESTED")) return "CHANGES_REQUESTED";
  if (states.includes("APPROVED")) return "APPROVED";
  return null;
}

/** Map a GraphQL PR node to our PRInfo type */
function mapPRNodeToInfo(pr: GraphQLPRNode): PRInfo {
  const forcePushCount = pr.timelineItems?.totalCount ?? 0;
  return {
    number: pr.number,
    title: pr.title,
    state: pr.merged ? "MERGED" : pr.state,
    reviewDecision: computeReviewDecision(pr.reviews.nodes),
    base: pr.baseRefName,
    head: pr.headRefName,
    url: pr.url,
    version: 1 + forcePushCount,
  };
}

export async function getMultiplePRInfos(
  prNumbers: number[],
  cwd = process.cwd(),
): Promise<Result<Map<number, PRInfo>>> {
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

    const infos = new Map<number, PRInfo>();
    for (let i = 0; i < prNumbers.length; i++) {
      const pr = response.repository[`pr${i}`];
      if (pr) {
        infos.set(pr.number, mapPRNodeToInfo(pr));
      }
    }

    return ok(infos);
  } catch (e) {
    return err(createError("COMMAND_FAILED", `Failed to get PR info: ${e}`));
  }
}

export async function getPRForBranch(
  branchName: string,
  cwd = process.cwd(),
): Promise<Result<PRInfo | null>> {
  const result = await batchGetPRsForBranches([branchName], cwd);
  if (!result.ok) return result;
  return ok(result.value.get(branchName) ?? null);
}

export async function batchGetPRsForBranches(
  branchNames: string[],
  cwd = process.cwd(),
): Promise<Result<Map<string, PRInfo>>> {
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

    const prMap = new Map<string, PRInfo>();
    for (let i = 0; i < branchNames.length; i++) {
      const branchData = response.repository[`branch${i}`];
      const prs = branchData?.nodes ?? [];
      // Prefer open PR, otherwise take first (most recent)
      const pr = prs.find((p) => p.state === "OPEN") ?? prs[0];
      if (pr) {
        prMap.set(branchNames[i], mapPRNodeToInfo(pr));
      }
    }

    return ok(prMap);
  } catch (e) {
    return err(createError("COMMAND_FAILED", `Failed to list PRs: ${e}`));
  }
}
