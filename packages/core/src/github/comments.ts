import { ok, type Result } from "../result";
import { withGitHub } from "./client";

const STACK_COMMENT_MARKER = "<!-- array-stack-comment -->";

export interface GitHubComment {
  id: number;
  body: string;
  createdAt: string;
  updatedAt: string;
}

function listComments(
  prNumber: number,
  cwd = process.cwd(),
): Promise<Result<GitHubComment[]>> {
  return withGitHub(cwd, "list comments", async ({ octokit, owner, repo }) => {
    const { data } = await octokit.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
    });

    return data.map((c) => ({
      id: c.id,
      body: c.body ?? "",
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    }));
  });
}

function createComment(
  prNumber: number,
  body: string,
  cwd = process.cwd(),
): Promise<Result<GitHubComment>> {
  return withGitHub(cwd, "create comment", async ({ octokit, owner, repo }) => {
    const { data } = await octokit.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    });

    return {
      id: data.id,
      body: data.body ?? "",
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  });
}

function updateComment(
  commentId: number,
  body: string,
  cwd = process.cwd(),
): Promise<Result<void>> {
  return withGitHub(cwd, "update comment", async ({ octokit, owner, repo }) => {
    await octokit.issues.updateComment({
      owner,
      repo,
      comment_id: commentId,
      body,
    });
  });
}

async function findStackComment(
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
