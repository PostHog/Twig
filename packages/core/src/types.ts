import type { Changeset } from "./parser";

export interface Author {
  name: string;
  email: string;
}

export interface ConflictInfo {
  path: string;
  type: "content" | "delete" | "rename";
}

/** Lightweight changeset info for status display */
export interface StatusChangeset {
  changeId: string;
  changeIdPrefix: string;
  commitId: string;
  commitIdPrefix: string;
  description: string;
  bookmarks: string[];
  parents: string[];
  isWorkingCopy: boolean;
  isImmutable: boolean;
  isEmpty: boolean;
  hasConflicts: boolean;
}

export interface ChangesetStatus {
  workingCopy: StatusChangeset;
  parents: StatusChangeset[];
  modifiedFiles: FileChange[];
  conflicts: ConflictInfo[];
  hasResolvedConflict: boolean;
}

export interface FileChange {
  path: string;
  status: "modified" | "added" | "deleted" | "renamed" | "copied";
  originalPath?: string;
}

export interface DiffStats {
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export interface Bookmark {
  name: string;
  changeId: string;
  isTracking: boolean;
  remote?: string;
}

export interface BookmarkTrackingStatus {
  name: string;
  aheadCount: number;
  behindCount: number;
}

export interface WorkspaceInfo {
  name: string;
  path: string;
  isCurrent: boolean;
}

export interface ListOptions {
  revset?: string;
  limit?: number;
}

export interface NewOptions {
  parents?: string[];
  message?: string;
  noEdit?: boolean;
}

export interface BookmarkOptions {
  revision?: string;
  create?: boolean;
  move?: boolean;
}

export interface PushOptions {
  remote?: string;
  bookmark?: string;
}

export interface PROptions {
  title?: string;
  body?: string;
  base?: string;
  draft?: boolean;
}

export interface PRResult {
  url: string;
  number: number;
}

export interface CreateOptions {
  message: string;
  all?: boolean;
  /** Optional bookmark name. If not provided, one will be generated from the message. */
  bookmarkName?: string;
}

export type PRSubmitStatus = "created" | "updated" | "synced" | "untracked";

export interface StackPR {
  changeId: string;
  bookmarkName: string;
  prNumber: number;
  prUrl: string;
  base: string;
  title: string;
  position: number;
  status: PRSubmitStatus;
}

export interface SubmitOptions {
  stack?: boolean;
  draft?: boolean;
  /** Tracked bookmarks - only these will be shown in stack comments */
  trackedBookmarks?: string[];
  /** Dry run - show what would be done without making changes */
  dryRun?: boolean;
}

export interface SubmitResult {
  prs: StackPR[];
  created: number;
  updated: number;
  synced: number;
  /** True if this was a dry run (no changes made) */
  dryRun?: boolean;
}

export interface AbandonedChange {
  changeId: string;
  reason: "empty" | "merged";
}

export interface SyncResult {
  fetched: boolean;
  rebased: boolean;
  abandoned: AbandonedChange[];
  forgottenBookmarks: string[];
  hasConflicts: boolean;
}

export type NavigationPosition =
  | "editing" // On a branch, editing it directly
  | "on-top" // At top of stack, ready for new work
  | "on-trunk"; // On trunk, starting fresh

export interface NavigationResult {
  changeId: string;
  changeIdPrefix: string;
  description: string;
  /** The bookmark/branch name if on a tracked branch */
  bookmark?: string;
  /** Where we ended up */
  position: NavigationPosition;
}

export interface FindOptions {
  query: string;
  includeBookmarks?: boolean;
}

export type FindResult =
  | { status: "found"; change: Changeset }
  | { status: "multiple"; matches: Changeset[] }
  | { status: "none" };

export type ModifyResult =
  | { status: "squashed" }
  | { status: "already_editing"; description: string }
  | { status: "no_parent" };

export type NextAction =
  | { action: "create"; reason: "unsaved" | "empty" | "on_trunk" }
  | { action: "submit"; reason: "create_pr" | "update_pr" }
  | { action: "continue"; reason: "conflicts" }
  | { action: "up"; reason: "start_new" };

export interface StatusInfo {
  changeId: string;
  changeIdPrefix: string;
  name: string;
  isUndescribed: boolean;
  hasChanges: boolean;
  hasConflicts: boolean;
  /** True if the current stack is behind trunk and needs restacking */
  isBehindTrunk: boolean;
  stackPath: string[];
  modifiedFiles: FileChange[];
  conflicts: ConflictInfo[];
  nextAction: NextAction;
}

export interface PRToMerge {
  prNumber: number;
  prTitle: string;
  prUrl: string;
  bookmarkName: string;
  changeId: string | null;
  baseRefName: string;
}

export interface MergeOptions {
  method?: "merge" | "squash" | "rebase";
}

export interface MergeResult {
  merged: PRToMerge[];
  synced: boolean;
}

/** Transaction state for tracking resources created during submitStack */
export interface SubmitTransaction {
  createdPRs: Array<{ number: number; bookmark: string }>;
  createdBookmarks: string[];
  pushedBookmarks: string[];
}

/** Result of rolling back a failed submission */
export interface RollbackResult {
  closedPRs: number[];
  deletedBookmarks: string[];
  failures: string[];
}
