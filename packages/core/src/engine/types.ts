// Re-export types from the single source of truth
import type { BranchMeta } from "../git/metadata";

export type {
  BranchMeta,
  PRInfo,
  PRState,
  ReviewDecision,
} from "../git/metadata";

/**
 * Tree node for rendering arr log.
 */
export interface TreeNode {
  bookmarkName: string;
  meta: BranchMeta;
  children: TreeNode[];
}
