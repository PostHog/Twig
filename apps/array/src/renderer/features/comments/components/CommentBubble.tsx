import { MarkdownRenderer } from "@features/editor/components/MarkdownRenderer";
import { Pencil, Trash } from "@phosphor-icons/react";
import {
  Avatar,
  Box,
  Button,
  Flex,
  IconButton,
  Text,
  TextArea,
} from "@radix-ui/themes";
import type { Comment } from "@shared/types";
import { useCallback, useState } from "react";
import { useCommentStore } from "../store/commentStore";
import { isCurrentUser } from "../utils/currentUser";

interface CommentBubbleProps {
  comment: Comment;
  isReply?: boolean;
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function CommentBubble({
  comment,
  isReply = false,
}: CommentBubbleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);

  const updateComment = useCommentStore((state) => state.updateComment);
  const deleteComment = useCommentStore((state) => state.deleteComment);

  const isOwnComment = isCurrentUser(comment.author);

  const handleStartEdit = useCallback(() => {
    setEditContent(comment.content);
    setIsEditing(true);
  }, [comment.content]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditContent(comment.content);
  }, [comment.content]);

  const handleSaveEdit = useCallback(async () => {
    const trimmed = editContent.trim();
    if (!trimmed) return;

    await updateComment(comment.id, trimmed);
    setIsEditing(false);
  }, [editContent, comment.id, updateComment]);

  const handleDelete = useCallback(async () => {
    if (window.confirm("Delete this comment? This action cannot be undone.")) {
      await deleteComment(comment.id);
    }
  }, [comment.id, deleteComment]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSaveEdit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleCancelEdit();
      }
    },
    [handleSaveEdit, handleCancelEdit],
  );

  return (
    <Box
      style={{
        backgroundColor: "var(--gray-2)",
        border: "1px solid var(--gray-5)",
        borderRadius: "var(--radius-2)",
        padding: "var(--space-2) var(--space-3)",
        marginLeft: isReply ? "var(--space-4)" : 0,
        borderLeftColor: isReply ? "var(--accent-8)" : "var(--gray-5)",
        borderLeftWidth: isReply ? "2px" : "1px",
      }}
    >
      <Flex gap="2" align="start">
        <Avatar
          size="1"
          fallback={getInitials(comment.author)}
          radius="full"
          color="gray"
        />
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Flex gap="2" align="center" justify="between" mb="1">
            <Flex gap="2" align="center">
              <Text size="1" weight="medium" color="gray" highContrast>
                {comment.author}
              </Text>
              <Text size="1" color="gray">
                {formatRelativeTime(comment.timestamp)}
              </Text>
              {comment.resolved && (
                <Text size="1" color="green">
                  ✓ Resolved
                </Text>
              )}
              {comment.isOutdated && (
                <Text size="1" color="orange">
                  ⚠ Outdated
                </Text>
              )}
            </Flex>

            {/* Action menu - only show for own comments */}
            {isOwnComment && !isEditing && (
              <Flex gap="1">
                <IconButton
                  size="1"
                  variant="ghost"
                  color="gray"
                  onClick={handleStartEdit}
                  title="Edit"
                >
                  <Pencil size={12} />
                </IconButton>
                <IconButton
                  size="1"
                  variant="ghost"
                  color="red"
                  onClick={handleDelete}
                  title="Delete"
                >
                  <Trash size={12} />
                </IconButton>
              </Flex>
            )}
          </Flex>

          {/* Content - either editing or displaying */}
          {isEditing ? (
            <Box>
              <TextArea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={handleKeyDown}
                size="1"
                autoFocus
                style={{ minHeight: "60px", resize: "vertical" }}
              />
              <Flex gap="2" mt="2" justify="between">
                <Box style={{ fontSize: "11px", color: "var(--gray-9)" }}>
                  ⌘+Enter to save · Esc to cancel
                </Box>
                <Flex gap="2">
                  <Button
                    size="1"
                    variant="soft"
                    color="gray"
                    onClick={handleCancelEdit}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="1"
                    variant="solid"
                    onClick={handleSaveEdit}
                    disabled={!editContent.trim()}
                  >
                    Save
                  </Button>
                </Flex>
              </Flex>
            </Box>
          ) : (
            <Box>
              <MarkdownRenderer content={comment.content} />
            </Box>
          )}
        </Box>
      </Flex>
    </Box>
  );
}
