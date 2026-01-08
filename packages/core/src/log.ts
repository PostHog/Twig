import type { Changeset } from "./parser";

interface LogNode {
  change: Changeset;
  children: LogNode[];
}

interface LogEntry {
  change: Changeset;
  prefix: string;
  isCurrent: boolean;
  isLastInStack: boolean;
  stackIndex: number;
  /** True when the change's bookmark has local commits not yet pushed */
  isModified: boolean;
}

/** Minimal PR info for log display */
export interface LogPRInfo {
  number: number;
  state: "OPEN" | "MERGED" | "CLOSED";
  url: string;
}

export interface EnrichedLogEntry extends LogEntry {
  prInfo: LogPRInfo | null;
  diffStats: {
    filesChanged: number;
    insertions: number;
    deletions: number;
  } | null;
}

export interface EnrichedLogResult extends Omit<LogResult, "entries"> {
  entries: EnrichedLogEntry[];
  modifiedCount: number;
}

export interface UncommittedWork {
  changeId: string;
  changeIdPrefix: string;
  /** True when uncommitted work is directly on trunk, not in a stack */
  isOnTrunk: boolean;
  diffStats: {
    filesChanged: number;
    insertions: number;
    deletions: number;
  } | null;
}

export interface TrunkInfo {
  name: string;
  commitId: string;
  commitIdPrefix: string;
  description: string;
  timestamp: Date;
}

export interface LogResult {
  entries: LogEntry[];
  trunk: TrunkInfo;
  currentChangeId: string | null;
  currentChangeIdPrefix: string | null;
  isOnTrunk: boolean;
  /** True when @ is an empty, undescribed change above the stack */
  hasEmptyWorkingCopy: boolean;
  /** Present when @ has file changes but no description (uncommitted work) */
  uncommittedWork: UncommittedWork | null;
}

function _formatDescriptionWithDate(
  description: string,
  timestamp: Date,
): string {
  const now = new Date();
  const diffMs = now.getTime() - timestamp.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Only add date prefix if older than today
  if (diffDays >= 1) {
    const month = timestamp.toLocaleString("en-US", { month: "short" });
    const day = timestamp.getDate();
    return `[${month} ${day}] ${description}`;
  }
  return description;
}

function _formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60)
    return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
  if (diffHours < 24)
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  if (diffWeeks < 4)
    return `${diffWeeks} week${diffWeeks === 1 ? "" : "s"} ago`;
  return `${diffMonths} month${diffMonths === 1 ? "" : "s"} ago`;
}

export function buildTree(changes: Changeset[], trunkId: string): LogNode[] {
  const nodeMap = new Map<string, LogNode>();
  const hasChild = new Set<string>();

  for (const change of changes) {
    nodeMap.set(change.changeId, { change, children: [] });
  }

  // Build reverse tree: each node points to its parent as "child"
  // This lets us traverse from heads down to roots
  for (const change of changes) {
    const parentId = change.parents[0];
    if (parentId && parentId !== trunkId && nodeMap.has(parentId)) {
      // This node has a parent in our set, so parent is not a head
      hasChild.add(parentId);
      // Link: node -> parent (reversed direction for display)
      const node = nodeMap.get(change.changeId)!;
      const parent = nodeMap.get(parentId)!;
      node.children.push(parent);
    }
  }

  // Heads are nodes that have no children pointing to them
  const heads: LogNode[] = [];
  for (const change of changes) {
    if (!hasChild.has(change.changeId)) {
      heads.push(nodeMap.get(change.changeId)!);
    }
  }

  return heads;
}

export function flattenTree(
  heads: LogNode[],
  currentChangeId: string | null,
  modifiedBookmarks: Set<string> = new Set(),
): LogEntry[] {
  const result: LogEntry[] = [];

  function visit(node: LogNode, prefix: string, stackIndex: number): void {
    // isLastInStack = this node has no more ancestors (closest to trunk)
    const isLastInStack = node.children.length === 0;

    // Check if any bookmark on this change is modified (has unpushed commits)
    const isModified = node.change.bookmarks.some((b) =>
      modifiedBookmarks.has(b),
    );

    result.push({
      change: node.change,
      prefix,
      isCurrent: node.change.changeId === currentChangeId,
      isLastInStack,
      stackIndex,
      isModified,
    });

    // children here are actually ancestors (going toward trunk)
    for (const child of node.children) {
      visit(child, prefix, stackIndex);
    }
  }

  // Sort heads by timestamp (newest first)
  const sortedHeads = [...heads].sort(
    (a, b) => b.change.timestamp.getTime() - a.change.timestamp.getTime(),
  );

  for (let i = 0; i < sortedHeads.length; i++) {
    // First stack has no prefix, remaining stacks get │ prefix
    const prefix = i === 0 ? "" : "│ ";
    visit(sortedHeads[i], prefix, i);
  }

  return result;
}
