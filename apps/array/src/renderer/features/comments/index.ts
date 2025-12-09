// Store

export type {
  CommentApi,
  CreateCommentInput,
  CreateReplyInput,
} from "./api/commentApi";

// API (adapter pattern - see commentApi.ts for integration instructions)
export { commentApi } from "./api/commentApi";
// Components
export { CommentBubble } from "./components/CommentBubble";
export { CommentThread } from "./components/CommentThread";
export { commentComposerExtension } from "./extensions/commentComposerExtension";
export { commentGutterExtension } from "./extensions/commentGutterExtension";
// Extensions
export { commentWidgetExtension } from "./extensions/commentWidgetExtension";
export { useCommentStore } from "./store/commentStore";
export type { CommentAuthor } from "./utils/currentUser";
// Utilities
export { getCurrentUser, isCurrentUser } from "./utils/currentUser";
