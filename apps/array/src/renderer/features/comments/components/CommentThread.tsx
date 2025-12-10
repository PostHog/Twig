import { Check, CheckCircle } from "@phosphor-icons/react";
import { Box, Button, Flex, TextArea } from "@radix-ui/themes";
import type { Comment } from "@shared/types";
import { useCallback, useState } from "react";
import type { CreateReplyInput } from "../api/commentApi";
import { useCommentStore } from "../store/commentStore";
import { CommentBubble } from "./CommentBubble";

interface CommentThreadProps {
  comment: Comment;
}

export function CommentThread({ comment: initialComment }: CommentThreadProps) {
  const [isReplying, setIsReplying] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const createReply = useCommentStore((state) => state.createReply);
  const resolveComment = useCommentStore((state) => state.resolveComment);

  // Subscribe to the store to get live updates for this comment
  // Returns null if comment was deleted
  const comment = useCommentStore((state) => {
    const fileComments = state.comments[initialComment.fileId] || [];
    return fileComments.find((c) => c.id === initialComment.id) || null;
  });

  const handleStartReply = useCallback(() => {
    setIsReplying(true);
  }, []);

  const handleCancelReply = useCallback(() => {
    setIsReplying(false);
    setReplyContent("");
  }, []);

  const handleSubmitReply = useCallback(async () => {
    const trimmed = replyContent.trim();
    if (!trimmed || !comment) return;

    const input: CreateReplyInput = {
      parentId: comment.id,
      prNumber: 0, // TODO: Get actual PR number from context
      directoryPath: "", // TODO: Get actual directory path from context
      content: trimmed,
    };

    await createReply(input);
    setReplyContent("");
    setIsReplying(false);
  }, [replyContent, comment, createReply]);

  const handleToggleResolved = useCallback(async () => {
    if (!comment) return;
    await resolveComment(comment.id, !comment.resolved, "", 0); // TODO: Get actual directory path and PR number from context
    // Auto-collapse when resolving
    if (!comment.resolved) {
      setIsCollapsed(true);
    }
  }, [comment, resolveComment]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmitReply();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleCancelReply();
      }
    },
    [handleSubmitReply, handleCancelReply],
  );

  // If comment was deleted, don't render anything
  if (!comment) {
    return null;
  }

  // Collapsed view for resolved comments
  if (comment.resolved && isCollapsed) {
    return (
      <Box
        style={{
          padding: "var(--space-2)",
          backgroundColor: "var(--gray-1)",
          borderRadius: "var(--radius-2)",
          border: "1px solid var(--green-6)",
          cursor: "pointer",
        }}
        onClick={() => setIsCollapsed(false)}
      >
        <Flex align="center" gap="2">
          <CheckCircle size={14} weight="fill" color="var(--green-9)" />
          <Box style={{ fontSize: "12px", color: "var(--gray-11)" }}>
            Resolved thread by {comment.author}
            {comment.replies.length > 0 &&
              ` · ${comment.replies.length} replies`}
          </Box>
          <Box
            style={{
              fontSize: "11px",
              color: "var(--gray-9)",
              marginLeft: "auto",
            }}
          >
            Click to expand
          </Box>
        </Flex>
      </Box>
    );
  }

  return (
    <Box
      style={{
        padding: "var(--space-2)",
        backgroundColor: comment.resolved ? "var(--green-2)" : "var(--gray-1)",
        borderRadius: "var(--radius-2)",
        border: `1px solid ${comment.resolved ? "var(--green-6)" : "var(--gray-4)"}`,
      }}
    >
      <Flex direction="column" gap="2">
        <CommentBubble comment={comment} />

        {/* Replies */}
        {comment.replies.map((reply) => (
          <CommentBubble key={reply.id} comment={reply} isReply />
        ))}

        {/* Reply composer */}
        {isReplying ? (
          <Box style={{ marginLeft: "var(--space-4)" }}>
            <TextArea
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Write a reply..."
              size="1"
              autoFocus
              style={{ minHeight: "60px", resize: "vertical" }}
            />
            <Flex gap="2" mt="2" justify="between">
              <Box style={{ fontSize: "11px", color: "var(--gray-9)" }}>
                ⌘+Enter to submit · Esc to cancel
              </Box>
              <Flex gap="2">
                <Button
                  size="1"
                  variant="soft"
                  color="gray"
                  onClick={handleCancelReply}
                >
                  Cancel
                </Button>
                <Button
                  size="1"
                  variant="solid"
                  onClick={handleSubmitReply}
                  disabled={!replyContent.trim()}
                >
                  Reply
                </Button>
              </Flex>
            </Flex>
          </Box>
        ) : (
          <Flex
            gap="2"
            align="center"
            justify="between"
            style={{ marginLeft: "var(--space-4)" }}
          >
            <Button
              size="1"
              variant="ghost"
              color="gray"
              onClick={handleStartReply}
            >
              Reply
            </Button>
            <Button
              size="1"
              variant={comment.resolved ? "soft" : "ghost"}
              color={comment.resolved ? "green" : "gray"}
              onClick={handleToggleResolved}
            >
              <Check size={12} weight="bold" />
              {comment.resolved ? "Resolved" : "Resolve"}
            </Button>
          </Flex>
        )}
      </Flex>
    </Box>
  );
}
