import { Octokit } from "@octokit/rest";
import { shellExecutor } from "../executor";
import { createError, err, ok, type Result } from "../result";

export interface RepoInfo {
  owner: string;
  repo: string;
}

// Module-level caches (keyed by cwd)
const tokenCache = new Map<string, string>();
const repoCache = new Map<string, RepoInfo>();
const octokitCache = new Map<string, Octokit>();

export async function getToken(cwd: string): Promise<string> {
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

export async function getRepoInfo(cwd: string): Promise<Result<RepoInfo>> {
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

export async function getOctokit(cwd: string): Promise<Octokit> {
  const cached = octokitCache.get(cwd);
  if (cached) return cached;

  const token = await getToken(cwd);
  const octokit = new Octokit({ auth: token });
  octokitCache.set(cwd, octokit);
  return octokit;
}

export interface GitHubContext {
  octokit: Octokit;
  owner: string;
  repo: string;
}

/**
 * Helper to reduce boilerplate for GitHub API calls.
 * Handles repo info lookup, octokit creation, and error wrapping.
 */
export async function withGitHub<T>(
  cwd: string,
  operation: string,
  fn: (ctx: GitHubContext) => Promise<T>,
): Promise<Result<T>> {
  const repoResult = await getRepoInfo(cwd);
  if (!repoResult.ok) return repoResult;

  const { owner, repo } = repoResult.value;

  try {
    const octokit = await getOctokit(cwd);
    const result = await fn({ octokit, owner, repo });
    return ok(result);
  } catch (e) {
    return err(createError("COMMAND_FAILED", `Failed to ${operation}: ${e}`));
  }
}
