import type {
  GitMenuAction,
  GitMenuActionId,
} from "@features/git-interaction/types";

interface GitState {
  repoPath?: string;
  isRepo: boolean;
  isRepoLoading: boolean;
  hasChanges: boolean;
  ahead: number;
  behind: number;
  hasRemote: boolean;
  currentBranch: string | null;
  defaultBranch: string | null;
  ghStatus: { installed: boolean; authenticated: boolean } | null;
  repoInfo: unknown | null;
  prStatus: {
    prExists: boolean;
    baseBranch: string | null;
    headBranch: string | null;
    prUrl: string | null;
  } | null;
}

interface GitComputed {
  actions: GitMenuAction[];
  primaryAction: GitMenuAction;
  createPrDisabledReason: string | null;
  commitPrDisabledReason: string | null;
  commitPushDisabledReason: string | null;
  prBaseBranch: string | null;
  prHeadBranch: string | null;
  prUrl: string | null;
  baseReason: string | null;
}

type Check = [boolean, string];

function firstFailingCheck(checks: Check[]): string | null {
  for (const [condition, message] of checks) {
    if (condition) return message;
  }
  return null;
}

function makeAction(
  id: GitMenuActionId,
  label: string,
  disabledReason: string | null,
): GitMenuAction {
  return { id, label, enabled: !disabledReason, disabledReason };
}

function getRepoReason(s: GitState): string | null {
  return firstFailingCheck([
    [!s.repoPath, "Select a repository folder first."],
    [s.isRepoLoading, "Checking repository status..."],
    [!s.isRepo, "Not a git repository."],
    [!s.currentBranch, "Checkout a branch to continue."],
  ]);
}

function getGhReason(s: GitState): string | null {
  const isOnDefaultBranch =
    s.defaultBranch && s.currentBranch === s.defaultBranch;
  const isWorkspaceBranch = s.currentBranch?.startsWith("workspace-");
  return firstFailingCheck([
    [!s.ghStatus, "Checking GitHub CLI status..."],
    [!s.ghStatus?.installed, "Install GitHub CLI: `brew install gh`"],
    [
      !s.ghStatus?.authenticated,
      "Authenticate GitHub CLI with `gh auth login`",
    ],
    [!s.repoInfo, "No GitHub remote detected."],
    [!!isOnDefaultBranch, "Checkout a feature branch to create PRs."],
    [!!isWorkspaceBranch, "Rename branch before creating PR."],
  ]);
}

function getCommitAction(
  s: GitState,
  repoReason: string | null,
): GitMenuAction {
  const reason = repoReason ?? (s.hasChanges ? null : "No changes to commit.");
  return makeAction("commit", "Commit", reason);
}

function getPushAction(s: GitState, repoReason: string | null): GitMenuAction {
  if (repoReason) return makeAction("push", "Push", repoReason);
  const isWorkspaceBranch = s.currentBranch?.startsWith("workspace-");
  if (!s.hasRemote) {
    const reason = isWorkspaceBranch
      ? "Rename branch before publishing."
      : null;
    return makeAction("publish", "Publish Branch", reason);
  }
  if (s.behind > 0) return makeAction("sync", "Sync", null);
  if (s.ahead > 0) return makeAction("push", "Push", null);
  return makeAction("push", "Push", "Branch is up to date.");
}

function getPrAction(
  s: GitState,
  disabledReason: string | null,
): GitMenuAction {
  if (s.prStatus?.prExists) return makeAction("view-pr", "View PR", null);
  if (disabledReason)
    return makeAction("create-pr", "Create PR", disabledReason);
  return makeAction("create-pr", "Create PR", null);
}

function getPrimaryAction(
  s: GitState,
  commitAction: GitMenuAction,
  pushAction: GitMenuAction,
  prAction: GitMenuAction,
): GitMenuAction {
  const allDisabled =
    !commitAction.enabled && !pushAction.enabled && !prAction.enabled;
  if (allDisabled) return commitAction;
  if (s.hasChanges) return commitAction;
  if (s.ahead > 0 || !s.hasRemote || s.behind > 0) return pushAction;
  return prAction;
}

export function computeGitInteractionState(input: GitState): GitComputed {
  const repoReason = getRepoReason(input);
  const ghReason = getGhReason(input);
  const isWorkspaceBranch = input.currentBranch?.startsWith("workspace-");

  const prExists = input.prStatus?.prExists;
  const commitPrDisabledReason =
    repoReason ??
    ghReason ??
    (prExists ? "PR already exists. Use commit and push." : null);
  const createPrDisabledReason =
    repoReason ??
    ghReason ??
    (input.behind > 0 ? "Sync branch with remote first." : null);
  const commitPushDisabledReason =
    isWorkspaceBranch && !input.hasRemote
      ? "Rename branch before pushing."
      : null;

  const commitAction = getCommitAction(input, repoReason);
  const pushAction = getPushAction(input, repoReason);
  const prAction = getPrAction(input, createPrDisabledReason);
  const primaryAction = getPrimaryAction(
    input,
    commitAction,
    pushAction,
    prAction,
  );

  return {
    actions: [commitAction, pushAction, prAction],
    primaryAction,
    createPrDisabledReason,
    commitPrDisabledReason,
    commitPushDisabledReason,
    prBaseBranch: input.prStatus?.baseBranch ?? input.defaultBranch,
    prHeadBranch: input.prStatus?.headBranch ?? input.currentBranch,
    prUrl: input.prStatus?.prUrl ?? null,
    baseReason: repoReason,
  };
}
