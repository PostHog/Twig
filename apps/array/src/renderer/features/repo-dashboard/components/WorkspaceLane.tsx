import type { ChangedFile } from "@components/ui/ChangedFileItem";
import { DiffStatsBadge } from "@components/ui/DiffStatsBadge";
import { DotPattern } from "@components/ui/DotPattern";
import { FocusToggleButton } from "@components/ui/FocusToggleButton";
import { useDroppable } from "@dnd-kit/react";
import {
  ArrowUp,
  Chat,
  CheckCircle,
  DotsThree,
  GitDiff,
  GitMerge,
  GitPullRequest,
  SidebarSimple,
  Warning,
} from "@phosphor-icons/react";
import {
  Badge,
  Button,
  Card,
  Flex,
  IconButton,
  Link,
  Spinner,
  Text,
} from "@radix-ui/themes";
import { trpcVanilla } from "@renderer/trpc/client";
import { formatRelativeTime } from "@renderer/utils/time";
import { useState } from "react";
import { DraggableFileItem } from "./DraggableFileItem";

interface DiffStats {
  added: number;
  removed: number;
  files: number;
}

interface PRInfo {
  number: number;
  url: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  title: string;
  reviewDecision?: "APPROVED" | "REVIEW_REQUIRED" | "CHANGES_REQUESTED" | null;
}

interface WorkspaceLaneProps {
  name: string;
  taskTitle?: string;
  isFocused: boolean;
  onToggleFocus: () => void;
  onSubmit: () => void;
  isSubmitting?: boolean;
  onChat: () => void;
  onDelete: () => void;
  changes: ChangedFile[];
  stats?: DiffStats;
  repoPath: string;
  layoutId?: string;
  onTitleClick?: () => void;
  pr?: PRInfo;
  /** When true, show radio instead of toggle (git mode = single selection) */
  isGitMode?: boolean;
  /** Unix timestamp (ms) of last modification */
  lastModified?: number;
}

function PRBadge({ pr }: { pr: PRInfo }) {
  const getStatusColor = () => {
    if (pr.state === "MERGED") return "purple";
    if (pr.state === "CLOSED") return "gray";
    if (pr.reviewDecision === "APPROVED") return "green";
    if (pr.reviewDecision === "CHANGES_REQUESTED") return "orange";
    return "blue";
  };

  const getStatusIcon = () => {
    if (pr.state === "MERGED") return <GitMerge size={12} weight="fill" />;
    if (pr.state === "CLOSED") return <GitPullRequest size={12} />;
    if (pr.reviewDecision === "APPROVED")
      return <CheckCircle size={12} weight="fill" />;
    if (pr.reviewDecision === "CHANGES_REQUESTED")
      return <Warning size={12} weight="fill" />;
    return <GitPullRequest size={12} />;
  };

  return (
    <Link
      href={pr.url}
      target="_blank"
      onClick={(e) => e.stopPropagation()}
      style={{ textDecoration: "none" }}
    >
      <Badge
        size="1"
        color={getStatusColor()}
        variant="soft"
        style={{ cursor: "pointer", gap: "4px" }}
      >
        {getStatusIcon()}#{pr.number}
      </Badge>
    </Link>
  );
}

export function WorkspaceLane({
  name,
  taskTitle,
  isFocused,
  onToggleFocus,
  onSubmit,
  isSubmitting = false,
  onChat,
  onDelete,
  changes,
  stats,
  repoPath,
  layoutId,
  onTitleClick,
  pr,
  isGitMode = false,
  lastModified,
}: WorkspaceLaneProps) {
  const [collapsed, setCollapsed] = useState(false);

  const handleContextMenu = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const result =
      await trpcVanilla.contextMenu.showWorkspaceContextMenu.mutate({
        workspaceName: name,
      });
    if (result.action?.type === "delete") {
      onDelete();
    } else if (result.action?.type === "copy-path") {
      // Get workspace path from ~/.array/workspaces/<repo>/<workspace>
      const workspacePath = await trpcVanilla.arr.getWorkspacePath.query({
        workspace: name,
        cwd: repoPath,
      });
      await navigator.clipboard.writeText(workspacePath);
    }
  };

  const { ref, isDropTarget } = useDroppable({
    id: `workspace-${name}`,
    data: { type: "workspace", workspace: name },
    accept: ["file"],
  });

  if (collapsed) {
    return (
      <Flex
        direction="column"
        align="center"
        gap="2"
        py="2"
        style={{
          width: "32px",
          minWidth: "32px",
          height: "100%",
          borderRight: "1px solid var(--gray-5)",
          backgroundColor: "var(--color-background)",
          cursor: "pointer",
        }}
        onClick={() => setCollapsed(false)}
      >
        <IconButton size="1" variant="ghost" color="gray">
          <SidebarSimple size={16} />
        </IconButton>
        <Text
          size="1"
          weight="medium"
          style={{
            writingMode: "vertical-rl",
            textOrientation: "mixed",
            color: "var(--gray-11)",
            letterSpacing: "0.5px",
          }}
        >
          {taskTitle || name}
        </Text>
        {changes.length > 0 && (
          <DiffStatsBadge
            added={stats?.added}
            removed={stats?.removed}
            files={changes.length}
            vertical
          />
        )}
      </Flex>
    );
  }

  const hasChanges = changes.length > 0;

  return (
    <Flex
      ref={ref}
      direction="column"
      gap="3"
      px="3"
      py="2"
      style={{
        width: "304px",
        minWidth: "304px",
        height: "100%",
        borderRight: "1px solid var(--gray-5)",
        backgroundColor: isDropTarget ? "var(--green-2)" : "transparent",
        transition: "background-color 150ms ease, opacity 150ms ease",
        position: "relative",
      }}
    >
      {/* Background grid pattern */}
      <DotPattern
        id={`lane-grid-${name}`}
        opacity={isFocused ? 0.6 : 0.2}
        color="var(--gray-5)"
      />

      {/* Collapse Button */}
      <IconButton
        size="1"
        variant="ghost"
        color="gray"
        onClick={() => setCollapsed(true)}
        style={{ alignSelf: "flex-start" }}
      >
        <SidebarSimple size={14} />
      </IconButton>

      {/* Task Card */}
      <Card
        size="1"
        className="overflow-hidden"
        style={{
          padding: 0,
          opacity: isFocused ? 1 : 0.6,
          backgroundColor: isFocused
            ? "var(--color-background)"
            : "var(--gray-2)",
          borderColor: isFocused ? "var(--accent-7)" : "var(--gray-6)",
          transition:
            "opacity 150ms ease, background-color 150ms ease, border-color 150ms ease",
        }}
      >
        <Flex
          direction="column"
          gap="2"
          p="2"
          className={
            onTitleClick
              ? "cursor-pointer transition-colors hover:bg-[var(--accent-3)]"
              : ""
          }
          onClick={onTitleClick}
        >
          <Text size="1" weight="medium" style={{ minWidth: 0 }}>
            {taskTitle || "No task"}
          </Text>
          <Text size="1" color="gray">
            {name}
          </Text>
          <Flex align="center" gap="2" style={{ minHeight: "20px" }}>
            {lastModified && (
              <Text size="1" color="gray">
                {formatRelativeTime(lastModified)}
              </Text>
            )}
            {pr && <PRBadge pr={pr} />}
          </Flex>
        </Flex>
        <Flex
          align="center"
          justify="between"
          px="2"
          py="1"
          style={{
            borderTop: "1px solid var(--gray-5)",
            backgroundColor: isFocused ? "var(--gray-3)" : "var(--gray-2)",
          }}
        >
          <FocusToggleButton
            isFocused={isFocused}
            onToggle={onToggleFocus}
            isRadio={isGitMode}
          />
          <Flex align="center" gap="2">
            <Button
              size="1"
              variant="surface"
              onClick={(e) => {
                e.stopPropagation();
                onChat();
              }}
            >
              Chat
              <Chat size={12} />
            </Button>
            <IconButton
              size="1"
              variant="ghost"
              color="gray"
              onClick={handleContextMenu}
            >
              <DotsThree size={14} weight="bold" />
            </IconButton>
          </Flex>
        </Flex>
      </Card>

      {/* Changes Card */}
      <Card
        size="1"
        style={{
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          maxHeight: "50%",
          backgroundColor: isFocused
            ? "var(--color-background)"
            : "var(--gray-2)",
          padding: 0,
          opacity: isFocused ? 1 : 0.6,
          transition: "opacity 150ms ease, background-color 150ms ease",
        }}
      >
        {hasChanges ? (
          <>
            {/* Stats Header */}
            <Flex
              align="center"
              justify="between"
              py="2"
              style={{ paddingLeft: "6px", paddingRight: "8px" }}
            >
              <Flex align="center" gap="2">
                <GitDiff
                  size={14}
                  style={{ color: "var(--gray-11)", flexShrink: 0 }}
                />
                <Text size="1" weight="medium">
                  Changes
                </Text>
              </Flex>
              <DiffStatsBadge
                added={stats?.added}
                removed={stats?.removed}
                files={changes.length}
              />
            </Flex>

            {/* Submit Button */}
            <Flex
              px="2"
              py="1"
              style={{
                borderBottom: "1px solid var(--gray-5)",
              }}
            >
              <Button
                size="1"
                variant="outline"
                disabled={isSubmitting}
                onClick={(e) => {
                  e.stopPropagation();
                  onSubmit();
                }}
                style={{ width: "100%" }}
              >
                {pr ? "Update PR" : "Create PR"}
                <Spinner loading={isSubmitting}>
                  <ArrowUp size={12} />
                </Spinner>
              </Button>
            </Flex>

            {/* File List */}
            <Flex direction="column" py="1" style={{ flex: 1 }}>
              {changes.map((change) => (
                <DraggableFileItem
                  key={change.path}
                  file={change}
                  repoPath={repoPath}
                  layoutId={layoutId}
                  workspace={name}
                />
              ))}
            </Flex>
          </>
        ) : (
          /* Empty Drop Zone */
          <Text
            size="1"
            color="gray"
            align="center"
            style={{ padding: "var(--space-4) var(--space-2)", flex: 1 }}
          >
            {isDropTarget ? "Drop to assign" : "Drop files to assign changes"}
          </Text>
        )}
      </Card>
    </Flex>
  );
}
