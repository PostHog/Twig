import { createError, err, type Result } from "../result";
import { withGitHub } from "./client";

export function isProtectedBranch(branchName: string): boolean {
  const protectedBranches = ["main", "master", "trunk", "develop"];
  const lower = branchName.toLowerCase();
  return (
    protectedBranches.includes(branchName) || protectedBranches.includes(lower)
  );
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

  return withGitHub(cwd, "delete branch", async ({ octokit, owner, repo }) => {
    try {
      await octokit.git.deleteRef({
        owner,
        repo,
        ref: `heads/${branchName}`,
      });
    } catch (e) {
      const error = e as Error & { status?: number };
      // 422 means branch doesn't exist, which is fine
      if (error.status !== 422) {
        throw e;
      }
    }
  });
}
