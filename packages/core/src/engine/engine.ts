import {
  type BranchMeta,
  deleteMetadata,
  listTrackedBranches,
  type PRInfo,
  readMetadata,
  writeMetadata,
} from "../git/metadata";
import { getTrunk, list } from "../jj";
import { createError, ok, type Result } from "../result";
import type { TreeNode } from "./types";

export type { PRInfo };

/**
 * Engine manages tracked branches and cached data.
 *
 * - Load once at command start
 * - All mutations go through update methods
 * - Persist once at command end
 */
export interface Engine {
  // Lifecycle
  load(): void;
  persist(): void;

  // Tracking
  isTracked(bookmark: string): boolean;
  getTrackedBookmarks(): string[];

  // Metadata access
  getMeta(bookmark: string): BranchMeta | null;
  getParent(bookmark: string): string | null;
  getChildren(bookmark: string): string[];

  // Mutations
  /**
   * Set metadata directly for a bookmark.
   * Use this when you already have the full metadata (e.g., from remote refs).
   */
  setMeta(bookmark: string, meta: BranchMeta): void;

  /**
   * Refresh a bookmark's changeId/commitId/parentBranchName from jj.
   * Preserves existing prInfo if present.
   * Returns error if bookmark not found in jj.
   */
  refreshFromJJ(bookmark: string): Promise<Result<void>>;

  /**
   * Track a new bookmark by looking up its info from jj.
   * @deprecated Use setMeta() for explicit metadata or refreshFromJJ() for jj lookup
   */
  track(bookmark: string, prInfo?: PRInfo): Promise<void>;

  /**
   * Untrack a bookmark (delete metadata).
   */
  untrack(bookmark: string): void;

  /**
   * Update PR info for a tracked bookmark.
   */
  updatePRInfo(bookmark: string, prInfo: PRInfo): void;

  // Tree building
  buildTree(trunk: string): TreeNode[];
}

/**
 * Create a new Engine instance.
 */
export function createEngine(cwd: string = process.cwd()): Engine {
  // In-memory state
  const branches: Map<string, BranchMeta> = new Map();
  const dirty: Set<string> = new Set();
  const deleted: Set<string> = new Set();
  let loaded = false;

  return {
    /**
     * Load all tracked branches from disk.
     */
    load(): void {
      if (loaded) return;

      // Load metadata from git refs
      const tracked = listTrackedBranches(cwd);
      for (const [bookmarkName] of tracked) {
        const meta = readMetadata(bookmarkName, cwd);
        if (meta) {
          branches.set(bookmarkName, meta);
        }
      }

      loaded = true;
    },

    /**
     * Persist all changes to disk.
     */
    persist(): void {
      // Write dirty branches to git refs
      for (const bookmarkName of dirty) {
        const meta = branches.get(bookmarkName);
        if (meta) {
          writeMetadata(bookmarkName, meta, cwd);
        }
      }

      // Delete removed branches from git refs
      for (const bookmarkName of deleted) {
        deleteMetadata(bookmarkName, cwd);
      }

      // Clear dirty state
      dirty.clear();
      deleted.clear();
    },

    /**
     * Check if a bookmark is tracked.
     */
    isTracked(bookmark: string): boolean {
      return branches.has(bookmark);
    },

    /**
     * Get all tracked bookmark names.
     */
    getTrackedBookmarks(): string[] {
      return Array.from(branches.keys());
    },

    /**
     * Get metadata for a bookmark.
     */
    getMeta(bookmark: string): BranchMeta | null {
      return branches.get(bookmark) ?? null;
    },

    /**
     * Get the parent branch name for a bookmark.
     */
    getParent(bookmark: string): string | null {
      return branches.get(bookmark)?.parentBranchName ?? null;
    },

    /**
     * Get all children of a bookmark (derived from parent scan).
     */
    getChildren(bookmark: string): string[] {
      const children: string[] = [];
      for (const [name, meta] of branches) {
        if (meta.parentBranchName === bookmark) {
          children.push(name);
        }
      }
      return children;
    },

    /**
     * Set metadata directly for a bookmark.
     * Use this when you already have the full metadata (e.g., from remote refs).
     */
    setMeta(bookmark: string, meta: BranchMeta): void {
      branches.set(bookmark, meta);
      dirty.add(bookmark);
      deleted.delete(bookmark);
    },

    /**
     * Refresh a bookmark's changeId/commitId/parentBranchName from jj.
     * Preserves existing prInfo if present.
     * Returns error if bookmark not found in jj.
     */
    async refreshFromJJ(bookmark: string): Promise<Result<void>> {
      const trunk = await getTrunk(cwd);
      const existing = branches.get(bookmark);

      // Get the change for this bookmark
      const changeResult = await list(
        { revset: `bookmarks(exact:"${bookmark}")`, limit: 1 },
        cwd,
      );
      if (!changeResult.ok) {
        return {
          ok: false,
          error: createError("COMMAND_FAILED", changeResult.error.message),
        };
      }
      if (changeResult.value.length === 0) {
        return {
          ok: false,
          error: createError(
            "NOT_FOUND",
            `Bookmark "${bookmark}" not found in jj`,
          ),
        };
      }

      const change = changeResult.value[0];
      const parentChangeId = change.parents[0];

      // Determine parent branch name
      let parentBranchName = trunk;

      if (parentChangeId) {
        // Check if parent is trunk
        const trunkResult = await list(
          { revset: `bookmarks(exact:"${trunk}")`, limit: 1 },
          cwd,
        );
        const isTrunkParent =
          trunkResult.ok &&
          trunkResult.value.length > 0 &&
          trunkResult.value[0].changeId === parentChangeId;

        if (!isTrunkParent) {
          // Find parent's bookmark
          const parentResult = await list(
            { revset: parentChangeId, limit: 1 },
            cwd,
          );
          if (parentResult.ok && parentResult.value.length > 0) {
            const parentBookmark = parentResult.value[0].bookmarks[0];
            if (parentBookmark) {
              parentBranchName = parentBookmark;
            }
          }
        }
      }

      const meta: BranchMeta = {
        changeId: change.changeId,
        commitId: change.commitId,
        parentBranchName,
        prInfo: existing?.prInfo, // Preserve existing prInfo
      };

      branches.set(bookmark, meta);
      dirty.add(bookmark);
      deleted.delete(bookmark);

      return ok(undefined);
    },

    /**
     * Track a bookmark. Derives changeId, commitId, parentBranchName from jj.
     * If already tracked, updates the metadata (upsert behavior).
     * @deprecated Use setMeta() for explicit metadata or refreshFromJJ() for jj lookup
     */
    async track(bookmark: string, prInfo?: PRInfo): Promise<void> {
      const trunk = await getTrunk(cwd);

      // Get the change for this bookmark
      const changeResult = await list(
        { revset: `bookmarks(exact:"${bookmark}")`, limit: 1 },
        cwd,
      );
      if (!changeResult.ok || changeResult.value.length === 0) {
        return; // Bookmark not found, skip tracking
      }

      const change = changeResult.value[0];
      const parentChangeId = change.parents[0];

      // Determine parent branch name
      let parentBranchName = trunk;

      if (parentChangeId) {
        // Check if parent is trunk
        const trunkResult = await list(
          { revset: `bookmarks(exact:"${trunk}")`, limit: 1 },
          cwd,
        );
        const isTrunkParent =
          trunkResult.ok &&
          trunkResult.value.length > 0 &&
          trunkResult.value[0].changeId === parentChangeId;

        if (!isTrunkParent) {
          // Find parent's bookmark
          const parentResult = await list(
            { revset: parentChangeId, limit: 1 },
            cwd,
          );
          if (parentResult.ok && parentResult.value.length > 0) {
            const parentBookmark = parentResult.value[0].bookmarks[0];
            if (parentBookmark) {
              parentBranchName = parentBookmark;
            }
          }
        }
      }

      const meta: BranchMeta = {
        changeId: change.changeId,
        commitId: change.commitId,
        parentBranchName,
        prInfo,
      };

      branches.set(bookmark, meta);
      dirty.add(bookmark);
      deleted.delete(bookmark);
    },

    /**
     * Untrack a bookmark (delete metadata).
     */
    untrack(bookmark: string): void {
      branches.delete(bookmark);
      dirty.delete(bookmark);
      deleted.add(bookmark);
    },

    /**
     * Update PR info for a tracked bookmark.
     */
    updatePRInfo(bookmark: string, prInfo: PRInfo): void {
      const existing = branches.get(bookmark);
      if (!existing) {
        return; // Not tracked, skip
      }
      branches.set(bookmark, { ...existing, prInfo });
      dirty.add(bookmark);
    },

    /**
     * Build a tree of tracked branches for rendering.
     * Returns roots (branches whose parent is trunk).
     */
    buildTree(trunk: string): TreeNode[] {
      const nodeMap = new Map<string, TreeNode>();

      // Create nodes for all tracked branches
      for (const [bookmarkName, meta] of branches) {
        nodeMap.set(bookmarkName, {
          bookmarkName,
          meta,
          children: [],
        });
      }

      // Build parent-child relationships
      const roots: TreeNode[] = [];
      for (const [_bookmarkName, node] of nodeMap) {
        const parentName = node.meta.parentBranchName;
        if (parentName === trunk) {
          roots.push(node);
        } else {
          const parentNode = nodeMap.get(parentName);
          if (parentNode) {
            parentNode.children.push(node);
          } else {
            // Parent not tracked - treat as root (orphaned)
            roots.push(node);
          }
        }
      }

      return roots;
    },
  };
}
