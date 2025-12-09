/**
 * ============================================
 * COMMENT API ADAPTER
 * ============================================
 *
 * TODO FOR API INTEGRATION:
 *
 * 1. Create a new file `githubCommentApi.ts` that implements `CommentApi`
 * 2. Replace `mockCommentApi` with your implementation below
 *
 * Example:
 *   import { githubCommentApi } from "./githubCommentApi";
 *   export const commentApi: CommentApi = githubCommentApi;
 *
 * The store calls these functions automatically - you just need to
 * implement them to hit your GitHub API endpoints.
 * ============================================
 */

import type { Comment } from "@shared/types";
import { getCurrentUser } from "../utils/currentUser";

// ============================================
// INPUT TYPES
// ============================================

export interface CreateCommentInput {
  fileId: string;
  line: number;
  side: "left" | "right";
  content: string;
}

export interface CreateReplyInput extends CreateCommentInput {
  parentId: string;
}

// ============================================
// API INTERFACE
// ============================================

export interface CommentApi {
  /**
   * Fetch all comments for a file
   * GET /api/comments?fileId=...
   */
  fetchComments(fileId: string): Promise<Comment[]>;

  /**
   * Create a new comment on a line
   * POST /api/comments
   * Body: { fileId, line, side, content }
   * Returns: Created comment with server-generated ID
   */
  createComment(input: CreateCommentInput): Promise<Comment>;

  /**
   * Create a reply to an existing comment
   * POST /api/comments/:parentId/replies
   * Body: { content }
   * Returns: Created reply with server-generated ID
   */
  createReply(input: CreateReplyInput): Promise<Comment>;

  /**
   * Update a comment's content
   * PATCH /api/comments/:commentId
   * Body: { content }
   * Returns: Updated comment
   */
  updateComment(commentId: string, content: string): Promise<Comment>;

  /**
   * Delete a comment
   * DELETE /api/comments/:commentId
   */
  deleteComment(commentId: string): Promise<void>;

  /**
   * Mark a comment as resolved or unresolved
   * PATCH /api/comments/:commentId/resolve
   * Body: { resolved: boolean }
   * Returns: Updated comment
   */
  resolveComment(commentId: string, resolved: boolean): Promise<Comment>;
}

// ============================================
// MOCK IMPLEMENTATION (local-only, no persistence)
// ============================================

/**
 * Mock API that works with local state only.
 * Replace this with `githubCommentApi` when ready.
 */
export const mockCommentApi: CommentApi = {
  async fetchComments(_fileId) {
    // Mock: Return empty array (store manages local state)
    // Real: GET /api/comments?fileId=...
    return [];
  },

  async createComment(input) {
    // Mock: Create comment object with generated ID
    // Real: POST /api/comments, return server response
    const user = getCurrentUser();
    return {
      id: crypto.randomUUID(),
      fileId: input.fileId,
      line: input.line,
      side: input.side,
      content: input.content,
      author: user.name,
      timestamp: new Date(),
      resolved: false,
      replies: [],
    };
  },

  async createReply(input) {
    // Mock: Create reply object with generated ID
    // Real: POST /api/comments/:parentId/replies
    const user = getCurrentUser();
    return {
      id: crypto.randomUUID(),
      fileId: input.fileId,
      line: input.line,
      side: input.side,
      content: input.content,
      author: user.name,
      timestamp: new Date(),
      resolved: false,
      replies: [],
    };
  },

  async updateComment(commentId, content) {
    // Mock: Return updated comment (store handles state update)
    // Real: PATCH /api/comments/:commentId
    return {
      id: commentId,
      content,
    } as Comment;
  },

  async deleteComment(_commentId) {
    // Mock: No-op (store handles state removal)
    // Real: DELETE /api/comments/:commentId
  },

  async resolveComment(commentId, resolved) {
    // Mock: Return updated comment (store handles state update)
    // Real: PATCH /api/comments/:commentId/resolve
    return {
      id: commentId,
      resolved,
    } as Comment;
  },
};

// ============================================
// ACTIVE API IMPLEMENTATION
// ============================================

/**
 * Change this to switch between mock and real API.
 *
 * When ready for GitHub integration:
 *   import { githubCommentApi } from "./githubCommentApi";
 *   export const commentApi: CommentApi = githubCommentApi;
 */
export const commentApi: CommentApi = mockCommentApi;
