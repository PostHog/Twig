import { runGitSync } from "./runner";

const REFS_PREFIX = "refs/arr";

/**
 * Push all arr metadata refs to remote.
 */
export function pushMetadataRefs(remote = "origin", cwd?: string): void {
  runGitSync(["push", remote, `${REFS_PREFIX}/*:${REFS_PREFIX}/*`], {
    cwd,
    onError: "ignore",
  });
}

/**
 * Fetch all arr metadata refs from remote.
 */
export function fetchMetadataRefs(remote = "origin", cwd?: string): void {
  runGitSync(["fetch", remote, `${REFS_PREFIX}/*:${REFS_PREFIX}/*`], {
    cwd,
    onError: "ignore",
  });
}

/**
 * Push metadata ref for a single branch.
 */
export function pushBranchMetadata(
  branchName: string,
  remote = "origin",
  cwd?: string,
): void {
  const ref = `${REFS_PREFIX}/${branchName}`;
  runGitSync(["push", remote, `${ref}:${ref}`], { cwd, onError: "ignore" });
}

/**
 * Fetch metadata ref for a single branch.
 */
export function fetchBranchMetadata(
  branchName: string,
  remote = "origin",
  cwd?: string,
): void {
  const ref = `${REFS_PREFIX}/${branchName}`;
  runGitSync(["fetch", remote, `${ref}:${ref}`], { cwd, onError: "ignore" });
}
