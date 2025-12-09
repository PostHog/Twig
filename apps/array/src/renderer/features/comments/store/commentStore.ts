/**
 * ============================================
 * COMMENT STORE
 * ============================================
 *
 * Local state management for comments.
 * Uses the API adapter for server communication.
 *
 * TODO FOR API INTEGRATION:
 * The store actions call `commentApi` methods. When you implement
 * the real API, the store will automatically use it.
 *
 * See: api/commentApi.ts for the API interface.
 * ============================================
 */

import type { Comment } from "@shared/types";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  type CreateCommentInput,
  type CreateReplyInput,
  commentApi,
} from "../api/commentApi";

// ============================================
// STORE INTERFACE
// ============================================

interface CommentStore {
  // State
  comments: Record<string, Comment[]>; // fileId -> comments
  showComments: boolean;
  composerState: { fileId: string; line: number } | null;

  // Queries (sync, read from local state)
  getCommentsForFile: (fileId: string) => Comment[];
  getCommentsForLine: (fileId: string, line: number) => Comment[];

  // Commands (async, call API then update local state)
  createComment: (input: CreateCommentInput) => Promise<Comment>;
  createReply: (input: CreateReplyInput) => Promise<Comment>;
  updateComment: (
    commentId: string,
    content: string,
    directoryPath: string,
  ) => Promise<void>;
  deleteComment: (commentId: string, directoryPath: string) => Promise<void>;
  resolveComment: (
    commentId: string,
    resolved: boolean,
    directoryPath: string,
  ) => Promise<void>;

  // Local-only actions (no API call)
  toggleShowComments: () => void;
  openComposer: (fileId: string, line: number) => void;
  closeComposer: () => void;

  // Internal: Update local state (used after API calls)
  _setComments: (fileId: string, comments: Comment[]) => void;
  _addCommentToState: (comment: Comment) => void;
  _addReplyToState: (parentId: string, reply: Comment) => void;
  _updateCommentInState: (commentId: string, updates: Partial<Comment>) => void;
  _removeCommentFromState: (commentId: string) => void;
}

// ============================================
// STORE IMPLEMENTATION
// ============================================

export const useCommentStore = create<CommentStore>()(
  persist(
    (set, get) => ({
      // Initial state
      comments: {},
      showComments: true,
      composerState: null,

      // ----------------------------------------
      // QUERIES (sync, local state only)
      // ----------------------------------------

      getCommentsForFile: (fileId: string) => {
        return get().comments[fileId] || [];
      },

      getCommentsForLine: (fileId: string, line: number) => {
        const comments = get().getCommentsForFile(fileId);
        return comments.filter((c) => c.line === line);
      },

      // ----------------------------------------
      // COMMANDS (async, call API + update state)
      // ----------------------------------------

      createComment: async (input: CreateCommentInput) => {
        // Call API to create comment
        const comment = await commentApi.createComment(input);

        // Update local state
        get()._addCommentToState(comment);

        return comment;
      },

      createReply: async (input: CreateReplyInput) => {
        // Call API to create reply
        const reply = await commentApi.createReply(input);

        // Update local state
        get()._addReplyToState(input.parentId, reply);

        return reply;
      },

      updateComment: async (
        commentId: string,
        content: string,
        directoryPath: string,
      ) => {
        // Call API to update
        await commentApi.updateComment(commentId, content, directoryPath);

        // Update local state
        get()._updateCommentInState(commentId, { content });
      },

      deleteComment: async (commentId: string, directoryPath: string) => {
        // Call API to delete
        await commentApi.deleteComment(commentId, directoryPath);

        // Update local state
        get()._removeCommentFromState(commentId);
      },

      resolveComment: async (
        commentId: string,
        resolved: boolean,
        directoryPath: string,
      ) => {
        // Call API to update resolve status
        await commentApi.resolveComment(commentId, resolved, directoryPath);

        // Update local state
        get()._updateCommentInState(commentId, { resolved });
      },

      // ----------------------------------------
      // LOCAL-ONLY ACTIONS (no API call)
      // ----------------------------------------

      toggleShowComments: () => {
        set((state) => ({ showComments: !state.showComments }));
      },

      openComposer: (fileId: string, line: number) => {
        set({ composerState: { fileId, line } });
      },

      closeComposer: () => {
        set({ composerState: null });
      },

      // ----------------------------------------
      // INTERNAL STATE UPDATES
      // ----------------------------------------

      _setComments: (fileId: string, comments: Comment[]) => {
        set((state) => ({
          comments: {
            ...state.comments,
            [fileId]: comments,
          },
        }));
      },

      _addCommentToState: (comment: Comment) => {
        set((state) => ({
          comments: {
            ...state.comments,
            [comment.fileId]: [
              ...(state.comments[comment.fileId] || []),
              comment,
            ],
          },
        }));
      },

      _addReplyToState: (parentId: string, reply: Comment) => {
        set((state) => {
          const newComments = { ...state.comments };
          for (const fileId of Object.keys(newComments)) {
            newComments[fileId] = newComments[fileId].map((comment) =>
              comment.id === parentId
                ? { ...comment, replies: [...comment.replies, reply] }
                : comment,
            );
          }
          return { comments: newComments };
        });
      },

      _updateCommentInState: (commentId: string, updates: Partial<Comment>) => {
        set((state) => {
          const newComments = { ...state.comments };
          for (const fileId of Object.keys(newComments)) {
            newComments[fileId] = newComments[fileId].map((comment) => {
              // Check if this is the comment to update
              if (comment.id === commentId) {
                return { ...comment, ...updates };
              }
              // Check replies
              if (comment.replies.some((r) => r.id === commentId)) {
                return {
                  ...comment,
                  replies: comment.replies.map((reply) =>
                    reply.id === commentId ? { ...reply, ...updates } : reply,
                  ),
                };
              }
              return comment;
            });
          }
          return { comments: newComments };
        });
      },

      _removeCommentFromState: (commentId: string) => {
        set((state) => {
          const newComments = { ...state.comments };
          for (const fileId of Object.keys(newComments)) {
            // First try to filter out top-level comments
            const filtered = newComments[fileId].filter(
              (comment) => comment.id !== commentId,
            );
            // If nothing was removed, check if it's a reply
            if (filtered.length === newComments[fileId].length) {
              newComments[fileId] = newComments[fileId].map((comment) => ({
                ...comment,
                replies: comment.replies.filter((r) => r.id !== commentId),
              }));
            } else {
              newComments[fileId] = filtered;
            }
          }
          return { comments: newComments };
        });
      },
    }),
    {
      name: "comments-storage",
      // Custom serialization to handle Date objects
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const parsed = JSON.parse(str);
          // Convert timestamp strings back to Date objects
          if (parsed.state?.comments) {
            for (const fileId of Object.keys(parsed.state.comments)) {
              parsed.state.comments[fileId] = parsed.state.comments[fileId].map(
                (c: Comment) => ({
                  ...c,
                  timestamp: new Date(c.timestamp),
                  replies: c.replies.map((r: Comment) => ({
                    ...r,
                    timestamp: new Date(r.timestamp),
                  })),
                }),
              );
            }
          }
          return parsed;
        },
        setItem: (name, value) => {
          localStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          localStorage.removeItem(name);
        },
      },
    },
  ),
);

// Expose store for dev testing - access via window.__commentStore in console
if (import.meta.env.DEV) {
  (
    window as unknown as { __commentStore: typeof useCommentStore }
  ).__commentStore = useCommentStore;
}
