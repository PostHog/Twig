/**
 * ============================================
 * COMMENT API ADAPTER
 * ============================================
 *
 * GitHub API integration for PR review comments.
 * All methods delegate to the git service via IPC channels:
 *
 * - fetchComments: get-pr-review-comments
 * - createComment: add-pr-comment
 * - createReply: reply-pr-review
 * - updateComment: update-pr-comment
 * - deleteComment: delete-pr-comment
 * - resolveComment: resolve-pr-comment
 *
 * ============================================
 */

import type { Comment } from "@shared/types";

// GitHub API response types
interface GitHubUser {
  login: string;
  id: number;
}

interface GitHubComment {
  id: number;
  path: string;
  line: number;
  side: string;
  body: string;
  user: GitHubUser;
  created_at: string;
  updated_at: string;
}

// ============================================
// INPUT TYPES
// ============================================

export interface CreateCommentInput {
  prNumber: number;
  directoryPath: string;
  path: string;
  line: number;
  side: "left" | "right";
  content: string;
  commitId: string;
}

export interface CreateReplyInput {
  prNumber: number;
  directoryPath: string;
  parentId: string;
  content: string;
}

// ============================================
// API INTERFACE
// ============================================

export interface CommentApi {
  /**
   * Fetch all comments for a pull request
   * Uses IPC: get-pr-review-comments
   */
  fetchComments(prNumber: number, directoryPath: string): Promise<Comment[]>;

  /**
   * Create a new comment on a line
   * Uses IPC: add-pr-comment
   * Returns: Created comment with server-generated ID
   */
  createComment(input: CreateCommentInput): Promise<Comment>;

  /**
   * Create a reply to an existing comment
   * Uses IPC: reply-pr-review
   * Returns: Created reply with server-generated ID
   */
  createReply(input: CreateReplyInput): Promise<Comment>;

  /**
   * Update a comment's content
   * Uses IPC: update-pr-comment
   * Returns: Updated comment
   */
  updateComment(
    commentId: string,
    content: string,
    directoryPath: string,
  ): Promise<Comment>;

  /**
   * Delete a comment
   * Uses IPC: delete-pr-comment
   */
  deleteComment(commentId: string, directoryPath: string): Promise<void>;

  /**
   * Mark a comment as resolved or unresolved
   * Uses IPC: resolve-pr-comment
   * Returns: Updated comment
   */
  resolveComment(
    commentId: string,
    resolved: boolean,
    directoryPath: string,
    prNumber: number,
  ): Promise<Comment>;
}

// ============================================
// GITHUB API IMPLEMENTATION (via git service)
// ============================================

/**
 * GitHub API implementation that delegates to the git service via IPC.
 */
export const githubCommentApi: CommentApi = {
  async fetchComments(prNumber, directoryPath) {
    try {
      const rawComments = await window.electronAPI.prComments.getReviewComments(
        directoryPath,
        prNumber,
      );

      // Transform GitHub API response to Comment type
      return (rawComments as GitHubComment[]).map((githubComment) => ({
        id: githubComment.id.toString(),
        fileId: githubComment.path,
        line: githubComment.line,
        side: githubComment.side.toLowerCase() as "left" | "right",
        content: githubComment.body,
        author: githubComment.user.login,
        timestamp: new Date(githubComment.created_at),
        resolved: false, // TODO: Fetch actual resolution status from GraphQL reviewThreads
        replies: [], // GitHub review comments don't have nested replies
      }));
    } catch (_error) {
      return [];
    }
  },

  async createComment(input) {
    const createdComment = (await window.electronAPI.prComments.addComment(
      input.directoryPath,
      input.prNumber,
      {
        body: input.content,
        commitId: input.commitId,
        path: input.path,
        line: input.line,
        side: input.side.toUpperCase() as "LEFT" | "RIGHT",
      },
    )) as GitHubComment;

    // Transform the response to match our Comment type
    return {
      id: createdComment.id.toString(),
      fileId: createdComment.path,
      line: createdComment.line,
      side: createdComment.side.toLowerCase() as "left" | "right",
      content: createdComment.body,
      author: createdComment.user.login,
      timestamp: new Date(createdComment.created_at),
      resolved: createdComment.body.includes("<!-- RESOLVED -->"),
      replies: [],
    };
  },

  async createReply(input) {
    const replyComment = (await window.electronAPI.prComments.replyToReview(
      input.directoryPath,
      input.prNumber,
      {
        body: input.content,
        inReplyTo: parseInt(input.parentId, 10),
      },
    )) as GitHubComment;

    // Transform the response to match our Comment type
    return {
      id: replyComment.id.toString(),
      fileId: replyComment.path,
      line: replyComment.line,
      side: replyComment.side.toLowerCase() as "left" | "right",
      content: replyComment.body,
      author: replyComment.user.login,
      timestamp: new Date(replyComment.created_at),
      resolved: replyComment.body.includes("<!-- RESOLVED -->"),
      replies: [],
    };
  },

  async updateComment(commentId, content, directoryPath) {
    const updatedComment = (await window.electronAPI.prComments.updateComment(
      directoryPath,
      parseInt(commentId, 10),
      content,
    )) as GitHubComment;

    // Transform the response to match our Comment type
    const resolved = updatedComment.body.includes("<!-- RESOLVED -->");
    return {
      id: updatedComment.id.toString(),
      fileId: updatedComment.path,
      line: updatedComment.line,
      side: updatedComment.side.toLowerCase() as "left" | "right",
      content: updatedComment.body,
      author: updatedComment.user.login,
      timestamp: new Date(updatedComment.updated_at),
      resolved: resolved,
      replies: [],
    };
  },

  async deleteComment(commentId, directoryPath) {
    await window.electronAPI.prComments.deleteComment(
      directoryPath,
      parseInt(commentId, 10),
    );
  },

  async resolveComment(commentId, resolved, directoryPath, prNumber) {
    const updatedComment = (await window.electronAPI.prComments.resolveComment(
      directoryPath,
      prNumber,
      parseInt(commentId, 10),
      resolved,
    )) as GitHubComment & { resolved: boolean };

    // Transform the response to match our Comment type
    return {
      id: updatedComment.id.toString(),
      fileId: updatedComment.path,
      line: updatedComment.line,
      side: updatedComment.side.toLowerCase() as "left" | "right",
      content: updatedComment.body,
      author: updatedComment.user.login,
      timestamp: new Date(updatedComment.updated_at),
      resolved: updatedComment.resolved,
      replies: [],
    };
  },
};

// ============================================
// ACTIVE API IMPLEMENTATION
// ============================================

/**
 * GitHub API implementation for PR review comments.
 * All operations delegate to the git service via IPC.
 */
export const commentApi: CommentApi = githubCommentApi;
