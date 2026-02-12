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
  pushDisabledReason: string | null;
  prDisabledReason: string | null;
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

function getPushDisabledReason(
  s: GitState,
  repoReason: string | null,
  opts?: { assumeWillHaveCommits?: boolean },
): string | null {
  if (repoReason) return repoReason;

  if (s.behind > 0) {
    return "Sync branch with remote first.";
  }

  if (!opts?.assumeWillHaveCommits) {
    if (s.hasRemote && s.ahead === 0) {
      return "Branch is up to date.";
    }
    if (!s.hasRemote && s.ahead === 0) {
      return "No commits to publish.";
    }
  }

  return null;
}

function getPrDisabledReason(
  s: GitState,
  repoReason: string | null,
  opts?: { assumeWillHaveCommits?: boolean },
): string | null {
  if (repoReason) return repoReason;

  if (!s.ghStatus) return "Checking GitHub CLI status...";
  if (!s.ghStatus.installed) return "Install GitHub CLI: `brew install gh`";
  if (!s.ghStatus.authenticated)
    return "Authenticate GitHub CLI with `gh auth login`";
  if (!s.repoInfo) return "No GitHub remote detected.";

  const isOnDefaultBranch =
    s.defaultBranch && s.currentBranch === s.defaultBranch;
  if (isOnDefaultBranch) return "Checkout a feature branch to create PRs.";

  if (s.behind > 0) return "Sync branch with remote first.";

  if (s.prStatus?.prExists) return "PR already exists. Use commit and push.";

  if (!opts?.assumeWillHaveCommits && s.ahead === 0) {
    return "No commits to create PR.";
  }

  return null;
}

function getCommitAction(
  s: GitState,
  repoReason: string | null,
): GitMenuAction {
  const reason = repoReason ?? (s.hasChanges ? null : "No changes to commit.");
  return makeAction("commit", "Commit", reason);
}

function getPushAction(
  s: GitState,
  pushDisabledReason: string | null,
): GitMenuAction {
  if (!s.hasRemote) {
    return makeAction("publish", "Publish Branch", pushDisabledReason);
  }
  if (s.behind > 0) {
    return makeAction("sync", "Sync", pushDisabledReason);
  }
  return makeAction("push", "Push", pushDisabledReason);
}

function getPrAction(
  s: GitState,
  prDisabledReason: string | null,
): GitMenuAction {
  if (s.prStatus?.prExists) return makeAction("view-pr", "View PR", null);
  return makeAction("create-pr", "Create PR", prDisabledReason);
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

  const pushDisabledReason = getPushDisabledReason(input, repoReason);
  const prDisabledReason = getPrDisabledReason(input, repoReason);

  const commitAction = getCommitAction(input, repoReason);
  const pushAction = getPushAction(input, pushDisabledReason);
  const prAction = getPrAction(input, prDisabledReason);
  const primaryAction = getPrimaryAction(
    input,
    commitAction,
    pushAction,
    prAction,
  );

  return {
    actions: [commitAction, pushAction, prAction],
    primaryAction,
    pushDisabledReason: getPushDisabledReason(input, repoReason, {
      assumeWillHaveCommits: true,
    }),
    prDisabledReason: getPrDisabledReason(input, repoReason, {
      assumeWillHaveCommits: true,
    }),
    prBaseBranch: input.prStatus?.baseBranch ?? input.defaultBranch,
    prHeadBranch: input.prStatus?.headBranch ?? input.currentBranch,
    prUrl: input.prStatus?.prUrl ?? null,
    baseReason: repoReason,
  };
}
