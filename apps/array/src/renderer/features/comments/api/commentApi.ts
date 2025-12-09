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
import { ipcRenderer } from "electron";

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
      const rawComments = await ipcRenderer.invoke(
        "get-pr-review-comments",
        directoryPath,
        prNumber,
      );

      // Transform GitHub API response to Comment type
      return rawComments.map((githubComment: GitHubComment) => ({
        id: githubComment.id.toString(),
        fileId: githubComment.path,
        line: githubComment.line,
        side: githubComment.side.toLowerCase() as "left" | "right",
        content: githubComment.body,
        author: githubComment.user.login,
        timestamp: new Date(githubComment.created_at),
        resolved: githubComment.body.includes("<!-- RESOLVED -->"), // Check for resolution marker
        replies: [], // GitHub review comments don't have nested replies
      }));
    } catch (_error) {
      return [];
    }
  },

  async createComment(input) {
    const createdComment = await ipcRenderer.invoke(
      "add-pr-comment",
      input.directoryPath,
      input.prNumber,
      {
        body: input.content,
        commitId: input.commitId,
        path: input.path,
        line: input.line,
        side: input.side.toUpperCase() as "LEFT" | "RIGHT",
      },
    );

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
    const replyComment = await ipcRenderer.invoke(
      "reply-pr-review",
      input.directoryPath,
      input.prNumber,
      {
        body: input.content,
        inReplyTo: parseInt(input.parentId, 10),
      },
    );

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
    const updatedComment = await ipcRenderer.invoke(
      "update-pr-comment",
      directoryPath,
      parseInt(commentId, 10),
      content,
    );

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
    await ipcRenderer.invoke(
      "delete-pr-comment",
      directoryPath,
      parseInt(commentId, 10),
    );
  },

  async resolveComment(commentId, resolved, directoryPath) {
    const updatedComment = await ipcRenderer.invoke(
      "resolve-pr-comment",
      directoryPath,
      parseInt(commentId, 10),
      resolved,
    );

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
