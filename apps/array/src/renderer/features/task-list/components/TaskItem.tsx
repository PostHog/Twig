import { RenameTaskDialog } from "@components/RenameTaskDialog";
import { useTaskStore } from "@features/tasks/stores/taskStore";
import { useTaskContextMenu } from "@hooks/useTaskContextMenu";
import { Cloud, GitPullRequest } from "@phosphor-icons/react";
import { Badge, Box, Code, Flex, Text } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { differenceInHours, format, formatDistanceToNow } from "date-fns";
import { memo } from "react";
import {
  selectWorktreeName,
  useWorkspaceStore,
} from "@/renderer/features/workspace/stores/workspaceStore";

interface TaskItemProps {
  task: Task;
  index: number;
  isHighlighted: boolean;
  onSelectTask: (task: Task) => void;
}

function TaskItemComponent({
  task,
  index,
  isHighlighted,
  onSelectTask,
}: TaskItemProps) {
  // Get store actions and hooks
  const setSelectedIndex = useTaskStore((state) => state.setSelectedIndex);
  const setHoveredIndex = useTaskStore((state) => state.setHoveredIndex);
  const selectedIndex = useTaskStore((state) => state.selectedIndex);
  const { showContextMenu, renameTask, renameDialogOpen, setRenameDialogOpen } =
    useTaskContextMenu();
  const worktreeName = useWorkspaceStore(selectWorktreeName(task.id));
  const createdAt = new Date(task.created_at);
  const hoursSinceCreated = differenceInHours(new Date(), createdAt);
  const timeDisplay =
    hoursSinceCreated < 24
      ? formatDistanceToNow(createdAt, { addSuffix: true })
      : format(createdAt, "MMM d");

  // Determine status: If PR exists, mark as completed, otherwise use latest_run status
  const prUrl = task.latest_run?.output?.pr_url as string | undefined;
  const hasPR = !!prUrl;
  const status = hasPR ? "completed" : task.latest_run?.status || "backlog";
  const isCloudTask = task.latest_run?.environment === "cloud";

  const handleOpenPR = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (prUrl) {
      window.electronAPI.openExternal(prUrl);
    }
  };

  const statusColorMap: Record<
    string,
    "green" | "red" | "blue" | "amber" | "gray"
  > = {
    completed: "green",
    failed: "red",
    in_progress: "blue",
    started: "amber",
    backlog: "gray",
  };

  const statusDisplayMap: Record<string, string> = {
    completed: "Completed",
    failed: "Failed",
    in_progress: "In progress",
    started: "Started",
    backlog: "Backlog",
  };

  return (
    <>
      <RenameTaskDialog
        task={renameTask}
        open={renameDialogOpen}
        onOpenChange={setRenameDialogOpen}
      />

      <Box
        p="2"
        className={`relative cursor-pointer border-gray-6 border-b font-mono ${
          isHighlighted ? "bg-gray-3" : ""
        }`}
        data-task-item="true"
        onClick={() => {
          setSelectedIndex(index);
          onSelectTask(task);
        }}
        onContextMenu={(e) => showContextMenu(task, e)}
        onMouseEnter={() => setHoveredIndex(index)}
        onMouseLeave={() => setHoveredIndex(null)}
        onMouseMove={() => {
          if (selectedIndex !== null) {
            setSelectedIndex(null);
            setHoveredIndex(index);
          }
        }}
      >
        <Flex align="center" gap="2" style={{ minWidth: 0 }}>
          <Text color="gray" size="1" style={{ flexShrink: 0 }}>
            {isHighlighted ? "[•]" : "[ ]"}
          </Text>

          <Code size="1" color="gray" variant="ghost" style={{ flexShrink: 0 }}>
            {task.slug}
          </Code>

          <Badge
            color={statusColorMap[status] || "gray"}
            size="1"
            style={{ flexShrink: 0 }}
          >
            {statusDisplayMap[status] ||
              status.charAt(0).toUpperCase() + status.slice(1)}
          </Badge>

          <Flex
            align="center"
            gap="2"
            className="flex-1"
            style={{ minWidth: 0 }}
          >
            <Text
              size="1"
              className="overflow-hidden text-ellipsis whitespace-nowrap"
              style={{ minWidth: 0 }}
            >
              {task.title}
            </Text>
            {isCloudTask && (
              <Flex
                align="center"
                gap="1"
                style={{ flexShrink: 0, opacity: 0.7 }}
              >
                <Cloud size={12} className="text-gray-10" />
                <Text size="1" color="gray">
                  Cloud
                </Text>
              </Flex>
            )}
            {worktreeName && (
              <Text
                size="1"
                color="gray"
                className="overflow-hidden text-ellipsis whitespace-nowrap"
                style={{ fontStyle: "italic", opacity: 0.7, minWidth: 0 }}
              >
                {worktreeName}
              </Text>
            )}
            {hasPR && (
              <Flex
                align="center"
                gap="1"
                onClick={isHighlighted ? handleOpenPR : undefined}
                className={
                  isHighlighted
                    ? "cursor-pointer rounded border border-gray-6 px-1"
                    : ""
                }
                style={{
                  flexShrink: 0,
                  fontFamily: "var(--font-mono)",
                  opacity: isHighlighted ? 1 : 0,
                  pointerEvents: isHighlighted ? "auto" : "none",
                }}
              >
                <GitPullRequest
                  size={14}
                  weight="light"
                  className="text-gray-11"
                />
                <Text size="1" color="gray">
                  Open pull request
                </Text>
              </Flex>
            )}
          </Flex>

          {task.repository && (
            <Text
              size="1"
              color="gray"
              className="whitespace-nowrap"
              style={{ flexShrink: 0 }}
            >
              {task.repository}
            </Text>
          )}

          <Text
            size="1"
            color="gray"
            className="whitespace-nowrap text-gray-8"
            style={{ flexShrink: 0 }}
          >
            {timeDisplay}
          </Text>
        </Flex>
      </Box>
    </>
  );
}

export const TaskItem = memo(TaskItemComponent);
