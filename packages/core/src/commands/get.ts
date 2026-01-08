import type { Engine } from "../engine";
import type { BranchMeta, PRInfo } from "../git/metadata";
import { getMultiplePRInfos, getPRForBranch } from "../github/pr-status";
import { edit, getTrunk, list, runJJ, runJJWithMutableConfigVoid } from "../jj";
import { createError, err, ok, type Result } from "../result";
import type { Command } from "./types";

export interface GetOptions {
  /** Branch name or PR number to get */
  target: string;
  engine: Engine;
  cwd?: string;
}

export interface GetResult {
  /** All branches restored in the stack (trunk -> target order) */
  stack: RestoredBranch[];
  /** The target branch that was requested */
  targetBranch: string;
}

export interface RestoredBranch {
  branchName: string;
  prNumber: number;
  meta: BranchMeta;
}

const MAX_STACK_DEPTH = 20;

/**
 * Walk up the PR base chain from a starting PR to trunk.
 * Returns PRs in trunk->target order (parent first).
 */
async function walkBaseChain(
  startPR: PRInfo,
  trunk: string,
  cwd: string,
): Promise<Result<PRInfo[]>> {
  const stack: PRInfo[] = [startPR];
  const visited = new Set<string>();
  visited.add(startPR.head ?? "");

  let current = startPR;

  while (current.base !== trunk && stack.length < MAX_STACK_DEPTH) {
    const baseBranch = current.base;

    // Cycle detection
    if (visited.has(baseBranch)) {
      return err(
        createError(
          "INVALID_STATE",
          `Cycle detected in PR chain: ${baseBranch} already visited`,
        ),
      );
    }
    visited.add(baseBranch);

    // Get PR for the parent branch
    const parentResult = await getPRForBranch(baseBranch, cwd);
    if (!parentResult.ok) return parentResult;

    const parentPR = parentResult.value;
    if (!parentPR) {
      // No PR for parent - assume it's trunk or an untracked branch
      break;
    }

    // Stop if parent PR is closed/merged - can't have valid stack with gap
    if (parentPR.state !== "OPEN") {
      // We still include this PR info for warning purposes
      stack.unshift(parentPR);
      break;
    }

    stack.unshift(parentPR);
    current = parentPR;
  }

  if (stack.length >= MAX_STACK_DEPTH) {
    return err(
      createError(
        "INVALID_STATE",
        `Stack depth exceeded ${MAX_STACK_DEPTH} levels. Possible cycle or malformed stack.`,
      ),
    );
  }

  return ok(stack);
}

/**
 * Restore a single branch from remote and track it.
 * Returns the metadata for the restored branch.
 */
async function restoreBranch(
  branchName: string,
  prInfo: PRInfo,
  engine: Engine,
  cwd: string,
): Promise<Result<BranchMeta>> {
  // Check if remote bookmark exists
  const checkResult = await runJJ(
    ["log", "-r", `${branchName}@origin`, "--no-graph", "-T", "change_id"],
    cwd,
  );

  if (!checkResult.ok) {
    return err(
      createError(
        "NOT_FOUND",
        `Remote branch ${branchName}@origin not found. It may have been deleted.`,
      ),
    );
  }

  // Track the remote bookmark to create local bookmark
  const trackResult = await runJJWithMutableConfigVoid(
    ["bookmark", "track", `${branchName}@origin`],
    cwd,
  );

  // If tracking fails, try setting the bookmark directly
  if (!trackResult.ok) {
    const setResult = await runJJWithMutableConfigVoid(
      ["bookmark", "set", branchName, "-r", `${branchName}@origin`],
      cwd,
    );
    if (!setResult.ok) {
      return err(
        createError(
          "COMMAND_FAILED",
          `Failed to restore bookmark ${branchName}: ${setResult.error.message}`,
        ),
      );
    }
  }

  // Get the change info from jj
  const listResult = await list({ revset: branchName, limit: 1 }, cwd);
  if (!listResult.ok) return listResult;

  if (listResult.value.length === 0) {
    return err(
      createError("NOT_FOUND", `Could not find changeset for ${branchName}`),
    );
  }

  const change = listResult.value[0];

  // Build metadata
  const meta: BranchMeta = {
    changeId: change.changeId,
    commitId: change.commitId,
    parentBranchName: prInfo.base,
    prInfo,
  };

  // Store in engine
  engine.setMeta(branchName, meta);

  return ok(meta);
}

/**
 * Get a branch (and its stack) from remote by name or PR number.
 * Restores the entire downstack from trunk to target.
 *
 * Flow:
 * 1. Resolve target to PR (by PR# or branch name)
 * 2. Validate PR is OPEN
 * 3. Walk base chain to trunk via GitHub API
 * 4. Fetch from remote
 * 5. Restore each branch in stack (trunk -> target order)
 */
export async function get(options: GetOptions): Promise<Result<GetResult>> {
  const { target, engine, cwd = process.cwd() } = options;

  // Get trunk name
  const trunk = await getTrunk(cwd);

  // Resolve target to PRInfo
  const isNumeric = /^\d+$/.test(target);
  let targetPR: PRInfo;

  if (isNumeric) {
    // Target is PR number
    const prNumber = Number.parseInt(target, 10);
    const prResult = await getMultiplePRInfos([prNumber], cwd);
    if (!prResult.ok) return prResult;

    const info = prResult.value.get(prNumber);
    if (!info) {
      return err(createError("NOT_FOUND", `PR #${prNumber} not found`));
    }
    targetPR = info;
  } else {
    // Target is branch name
    const prResult = await getPRForBranch(target, cwd);
    if (!prResult.ok) return prResult;

    if (!prResult.value) {
      return err(createError("NOT_FOUND", `No PR found for branch: ${target}`));
    }
    targetPR = prResult.value;
  }

  // Validate PR is open
  if (targetPR.state !== "OPEN") {
    return err(
      createError(
        "INVALID_STATE",
        `PR #${targetPR.number} is ${targetPR.state.toLowerCase()}. Cannot restore closed/merged PRs.`,
      ),
    );
  }

  // Walk base chain to build stack
  const stackResult = await walkBaseChain(targetPR, trunk, cwd);
  if (!stackResult.ok) return stackResult;

  const prStack = stackResult.value;

  // Check for closed/merged parent PRs
  const closedParent = prStack.find(
    (pr) => pr.state !== "OPEN" && pr.number !== targetPR.number,
  );
  if (closedParent) {
    // Filter out closed parent and warn
    const openStack = prStack.filter((pr) => pr.state === "OPEN");
    if (openStack.length === 0) {
      return err(
        createError(
          "INVALID_STATE",
          `Parent PR #${closedParent.number} (${closedParent.head}) is ${closedParent.state.toLowerCase()}. Run arr sync to rebase your stack.`,
        ),
      );
    }
  }

  // Fetch from git remote
  const fetchResult = await runJJ(["git", "fetch"], cwd);
  if (!fetchResult.ok) return fetchResult;

  // Restore each branch in stack (from trunk toward target)
  const restoredStack: RestoredBranch[] = [];

  for (const pr of prStack) {
    // Skip non-open PRs (they're in the chain for warning purposes)
    if (pr.state !== "OPEN") continue;

    const branchName = pr.head;
    if (!branchName) {
      // Skip PRs without head (shouldn't happen with valid data)
      continue;
    }

    const restoreResult = await restoreBranch(branchName, pr, engine, cwd);
    if (!restoreResult.ok) {
      // Log warning but continue - partial stack is still useful
      continue;
    }

    restoredStack.push({
      branchName,
      prNumber: pr.number,
      meta: restoreResult.value,
    });
  }

  if (restoredStack.length === 0) {
    return err(
      createError(
        "COMMAND_FAILED",
        "Failed to restore any branches from stack",
      ),
    );
  }

  // Find target branch name
  const targetBranch =
    targetPR.head ?? restoredStack[restoredStack.length - 1].branchName;

  // Switch to the target branch
  const editResult = await edit(targetBranch, cwd);
  if (!editResult.ok) {
    return err(
      createError(
        "COMMAND_FAILED",
        `Restored stack but failed to switch to ${targetBranch}: ${editResult.error.message}`,
      ),
    );
  }

  return ok({
    stack: restoredStack,
    targetBranch,
  });
}

export const getCommand: Command<GetResult, [GetOptions]> = {
  meta: {
    name: "get",
    args: "<branch|pr#>",
    description:
      "Restore a branch and its stack from remote by name or PR number",
    category: "workflow",
  },
  run: get,
};
