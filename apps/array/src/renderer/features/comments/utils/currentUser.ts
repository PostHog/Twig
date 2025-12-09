/**
 * ============================================
 * CURRENT USER UTILITY
 * ============================================
 *
 * TODO FOR API INTEGRATION:
 * Replace the mock implementation below with real user from auth.
 *
 * Example:
 *   import { useAuthStore } from "@features/auth";
 *
 *   export function getCurrentUser(): CommentAuthor {
 *     const user = useAuthStore.getState().user;
 *     return {
 *       id: user.id,
 *       name: user.name || user.email,
 *     };
 *   }
 * ============================================
 */

export interface CommentAuthor {
  id: string;
  name: string;
}

/**
 * Get the current user for comment authorship.
 * Replace this mock with real auth integration.
 */
export function getCurrentUser(): CommentAuthor {
  // MOCK - Replace with real auth
  return {
    id: "current-user",
    name: "You",
  };
}

/**
 * Check if a comment author matches the current user.
 * Used to determine if edit/delete actions should be shown.
 */
export function isCurrentUser(authorName: string): boolean {
  return authorName === getCurrentUser().name;
}
