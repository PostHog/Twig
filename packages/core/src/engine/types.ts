import { z } from "zod";

/**
 * PR information cached from GitHub.
 * Stored in git refs, refreshed on submit/sync.
 */
const prInfoSchema = z.object({
  number: z.number(),
  url: z.string(),
  state: z.enum(["OPEN", "CLOSED", "MERGED"]),
  base: z.string(),
  title: z.string().optional(),
  reviewDecision: z
    .enum(["APPROVED", "CHANGES_REQUESTED", "REVIEW_REQUIRED"])
    .optional(),
  isDraft: z.boolean().optional(),
});

export type PRInfo = z.infer<typeof prInfoSchema>;

/**
 * Branch metadata stored in git refs at refs/arr/<bookmarkName>.
 * This is the authoritative tracking data that persists across machines.
 */
const branchMetaSchema = z.object({
  // Identity
  changeId: z.string(),
  commitId: z.string(),

  // Stack relationship - the key field for PR base chains
  parentBranchName: z.string(),

  // PR info (cached from GitHub)
  prInfo: prInfoSchema.optional(),
});

export type BranchMeta = z.infer<typeof branchMetaSchema>;

/**
 * Tree node for rendering arr log.
 */
export interface TreeNode {
  bookmarkName: string;
  meta: BranchMeta;
  children: TreeNode[];
}
