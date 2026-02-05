import { FileIcon } from "@components/ui/FileIcon";
import { PanelMessage } from "@components/ui/PanelMessage";
import { Tooltip } from "@components/ui/Tooltip";
import { isDiffTabActiveInTree, usePanelLayoutStore } from "@features/panels";
import { usePendingPermissionsForTask } from "@features/sessions/stores/sessionStore";
import { useCwd } from "@features/sidebar/hooks/useCwd";
import { useFocusWorkspace } from "@features/workspace/hooks/useFocusWorkspace";
import {
  ArrowCounterClockwiseIcon,
  ArrowsClockwise,
  CaretDownIcon,
  CaretUpIcon,
  CodeIcon,
  CopyIcon,
  FilePlus,
} from "@phosphor-icons/react";
import {
  Badge,
  Box,
  Button,
  DropdownMenu,
  Flex,
  IconButton,
  Spinner,
  Text,
} from "@radix-ui/themes";
import { trpcVanilla } from "@renderer/trpc/client";
import type { ChangedFile, GitFileStatus, Task } from "@shared/types";
import { useExternalAppsStore } from "@stores/externalAppsStore";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { showMessageBox } from "@utils/dialog";
import { handleExternalAppAction } from "@utils/handleExternalAppAction";
import { useCallback, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useWorkspaceStore } from "@/renderer/features/workspace/stores/workspaceStore";

interface ChangesPanelProps {
  taskId: string;
  task: Task;
}

interface ChangedFileItemProps {
  file: ChangedFile;
  taskId: string;
  repoPath: string;
  isActive: boolean;
  mainRepoPath?: string;
}

function getStatusIndicator(status: GitFileStatus): {
  label: string;
  fullLabel: string;
  color: "green" | "orange" | "red" | "blue" | "gray";
} {
  switch (status) {
    case "added":
    case "untracked":
      return { label: "A", fullLabel: "Added", color: "green" };
    case "deleted":
      return { label: "D", fullLabel: "Deleted", color: "red" };
    case "modified":
      return { label: "M", fullLabel: "Modified", color: "orange" };
    case "renamed":
      return { label: "R", fullLabel: "Renamed", color: "blue" };
    default:
      return { label: "?", fullLabel: "Unknown", color: "gray" };
  }
}

function getDiscardInfo(
  file: ChangedFile,
  fileName: string,
): { message: string; action: string } {
  switch (file.status) {
    case "modified":
      return {
        message: `Are you sure you want to discard changes in '${fileName}'?`,
        action: "Discard File",
      };
    case "deleted":
      return {
        message: `Are you sure you want to restore '${fileName}'?`,
        action: "Restore File",
      };
    case "added":
      return {
        message: `Are you sure you want to remove '${fileName}'?`,
        action: "Remove File",
      };
    case "untracked":
      return {
        message: `Are you sure you want to delete '${fileName}'?`,
        action: "Delete File",
      };
    case "renamed":
      return {
        message: `Are you sure you want to undo the rename of '${fileName}'?`,
        action: "Undo Rename File",
      };
    default:
      return {
        message: `Are you sure you want to discard changes in '${fileName}'?`,
        action: "Discard File",
      };
  }
}

function ChangedFileItem({
  file,
  taskId,
  repoPath,
  isActive,
  mainRepoPath,
}: ChangedFileItemProps) {
  const openDiffInSplit = usePanelLayoutStore((state) => state.openDiffInSplit);
  const closeDiffTabsForFile = usePanelLayoutStore(
    (state) => state.closeDiffTabsForFile,
  );
  const queryClient = useQueryClient();
  const { detectedApps } = useExternalAppsStore();
  const workspace = useWorkspaceStore((s) => s.workspaces[taskId] ?? null);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // show toolbar when hovered OR when dropdown is open
  const isToolbarVisible = isHovered || isDropdownOpen;

  const fileName = file.path.split("/").pop() || file.path;
  const fullPath = `${repoPath}/${file.path}`;
  const indicator = getStatusIndicator(file.status);

  const handleClick = () => {
    openDiffInSplit(taskId, file.path, file.status);
  };

  const handleDoubleClick = () => {
    openDiffInSplit(taskId, file.path, file.status, false);
  };

  const workspaceContext = {
    workspace,
    mainRepoPath,
  };

  const handleContextMenu = async (e: React.MouseEvent) => {
    e.preventDefault();
    const result = await trpcVanilla.contextMenu.showFileContextMenu.mutate({
      filePath: fullPath,
    });

    if (!result.action) return;

    if (result.action.type === "external-app") {
      await handleExternalAppAction(
        result.action.action,
        fullPath,
        fileName,
        workspaceContext,
      );
    }
  };

  const handleOpenWith = async (appId: string) => {
    await handleExternalAppAction(
      { type: "open-in-app", appId },
      fullPath,
      fileName,
      workspaceContext,
    );

    // blur active element to dismiss any open tooltip
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  const handleCopyPath = async () => {
    await handleExternalAppAction({ type: "copy-path" }, fullPath, fileName);
  };

  const handleDiscard = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const { message, action } = getDiscardInfo(file, fileName);

    const result = await showMessageBox({
      type: "warning",
      title: "Discard changes",
      message,
      buttons: ["Cancel", action],
      defaultId: 0,
      cancelId: 0,
    });

    if (result.response !== 1) return;

    await trpcVanilla.git.discardFileChanges.mutate({
      directoryPath: repoPath,
      filePath: file.originalPath ?? file.path, // For renames, use the original path
      fileStatus: file.status,
    });

    closeDiffTabsForFile(taskId, file.path);

    queryClient.invalidateQueries({
      queryKey: ["changed-files-head", repoPath],
    });
  };

  const hasLineStats =
    file.linesAdded !== undefined || file.linesRemoved !== undefined;

  const tooltipContent = `${file.path} - ${indicator.fullLabel}`;

  return (
    <Tooltip content={tooltipContent} side="top" delayDuration={500}>
      <Flex
        align="center"
        gap="1"
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={
          isActive
            ? "border-accent-8 border-y bg-accent-4"
            : "border-transparent border-y hover:bg-gray-3"
        }
        style={{
          cursor: "pointer",
          whiteSpace: "nowrap",
          overflow: "hidden",
          height: "26px",
          paddingLeft: "8px",
          paddingRight: "8px",
        }}
      >
        <FileIcon filename={fileName} size={14} />
        <Text
          size="1"
          style={{
            userSelect: "none",
            overflow: "hidden",
            textOverflow: "ellipsis",
            marginLeft: "2px",
            flexShrink: 1,
            minWidth: 0,
          }}
        >
          {fileName}
        </Text>
        <Text
          size="1"
          color="gray"
          style={{
            userSelect: "none",
            overflow: "hidden",
            textOverflow: "ellipsis",
            flex: 1,
            marginLeft: "4px",
            minWidth: 0,
          }}
        >
          {file.originalPath
            ? `${file.originalPath} → ${file.path}`
            : file.path}
        </Text>

        {hasLineStats && !isToolbarVisible && (
          <Flex
            align="center"
            gap="1"
            style={{ flexShrink: 0, fontSize: "10px", fontFamily: "monospace" }}
          >
            {(file.linesAdded ?? 0) > 0 && (
              <Text style={{ color: "var(--green-9)" }}>
                +{file.linesAdded}
              </Text>
            )}
            {(file.linesRemoved ?? 0) > 0 && (
              <Text style={{ color: "var(--red-9)" }}>
                -{file.linesRemoved}
              </Text>
            )}
          </Flex>
        )}

        {isToolbarVisible && (
          <Flex align="center" gap="1" style={{ flexShrink: 0 }}>
            <Tooltip content="Discard changes">
              <IconButton
                size="1"
                variant="ghost"
                color="gray"
                onClick={handleDiscard}
                style={{
                  flexShrink: 0,
                  width: "18px",
                  height: "18px",
                  padding: 0,
                  marginLeft: "2px",
                  marginRight: "2px",
                }}
              >
                <ArrowCounterClockwiseIcon size={12} />
              </IconButton>
            </Tooltip>

            <DropdownMenu.Root
              open={isDropdownOpen}
              onOpenChange={setIsDropdownOpen}
            >
              <Tooltip content="Open file">
                <DropdownMenu.Trigger>
                  <IconButton
                    size="1"
                    variant="ghost"
                    color="gray"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      flexShrink: 0,
                      width: "18px",
                      height: "18px",
                      padding: 0,
                    }}
                  >
                    <FilePlus size={12} weight="regular" />
                  </IconButton>
                </DropdownMenu.Trigger>
              </Tooltip>
              <DropdownMenu.Content size="1" align="end">
                {detectedApps
                  .filter((app) => app.type !== "terminal")
                  .map((app) => (
                    <DropdownMenu.Item
                      key={app.id}
                      onSelect={() => handleOpenWith(app.id)}
                    >
                      <Flex align="center" gap="2">
                        {app.icon ? (
                          <img
                            src={app.icon}
                            width={16}
                            height={16}
                            alt=""
                            style={{ borderRadius: "2px" }}
                          />
                        ) : (
                          <CodeIcon size={16} weight="regular" />
                        )}
                        <Text size="1">{app.name}</Text>
                      </Flex>
                    </DropdownMenu.Item>
                  ))}
                <DropdownMenu.Separator />
                <DropdownMenu.Item onSelect={handleCopyPath}>
                  <Flex align="center" gap="2">
                    <CopyIcon size={16} weight="regular" />
                    <Text size="1">Copy Path</Text>
                  </Flex>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          </Flex>
        )}

        <Badge
          size="1"
          color={indicator.color}
          style={{ flexShrink: 0, fontSize: "10px", padding: "0 4px" }}
        >
          {indicator.label}
        </Badge>
      </Flex>
    </Tooltip>
  );
}

export function ChangesPanel({ taskId, task: _task }: ChangesPanelProps) {
  const workspace = useWorkspaceStore((s) => s.workspaces[taskId]);
  const { isFocused, isFocusLoading, handleToggleFocus, handleUnfocus } =
    useFocusWorkspace(taskId);
  const repoPath = useCwd(taskId);
  const layout = usePanelLayoutStore((state) => state.getLayout(taskId));
  const openDiffInSplit = usePanelLayoutStore((state) => state.openDiffInSplit);
  const pendingPermissions = usePendingPermissionsForTask(taskId);
  const hasPendingPermissions = pendingPermissions.size > 0;

  const { data: changedFiles = [], isLoading } = useQuery({
    queryKey: ["changed-files-head", repoPath],
    queryFn: () =>
      trpcVanilla.git.getChangedFilesHead.query({
        directoryPath: repoPath as string,
      }),
    enabled: !!repoPath,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    placeholderData: (prev) => prev,
  });

  const getActiveIndex = useCallback((): number => {
    if (!layout) return -1;
    return changedFiles.findIndex((file) =>
      isDiffTabActiveInTree(layout.panelTree, file.path, file.status),
    );
  }, [layout, changedFiles]);

  const handleKeyNavigation = useCallback(
    (direction: "up" | "down") => {
      if (changedFiles.length === 0) return;

      const currentIndex = getActiveIndex();
      const startIndex =
        currentIndex === -1
          ? direction === "down"
            ? -1
            : changedFiles.length
          : currentIndex;
      const newIndex =
        direction === "up"
          ? Math.max(0, startIndex - 1)
          : Math.min(changedFiles.length - 1, startIndex + 1);

      const file = changedFiles[newIndex];
      if (file) {
        openDiffInSplit(taskId, file.path, file.status);
      }
    },
    [changedFiles, getActiveIndex, openDiffInSplit, taskId],
  );

  useHotkeys(
    "up",
    () => handleKeyNavigation("up"),
    { enabled: !hasPendingPermissions },
    [handleKeyNavigation, hasPendingPermissions],
  );
  useHotkeys(
    "down",
    () => handleKeyNavigation("down"),
    { enabled: !hasPendingPermissions },
    [handleKeyNavigation, hasPendingPermissions],
  );

  const isFileActive = (file: ChangedFile): boolean => {
    if (!layout) return false;
    return isDiffTabActiveInTree(layout.panelTree, file.path, file.status);
  };

  const showFocusCta = workspace?.mode === "worktree";
  const focusCta = showFocusCta ? (
    <Box px="2" pb="2">
      <Flex
        align="center"
        justify="between"
        gap="2"
        px="3"
        py="2"
        style={{
          borderRadius: "999px",
          border: "1px solid var(--gray-4)",
          backgroundColor: "var(--gray-2)",
        }}
      >
        <Flex align="center" gap="2">
          {isFocused ? (
            <Box
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "999px",
                backgroundColor: "var(--green-9)",
              }}
            />
          ) : (
            <ArrowsClockwise size={14} weight="bold" />
          )}
          <Text size="1" style={{ color: "var(--gray-11)" }}>
            {isFocused ? "Workspace synced" : "Focus workspace"}
          </Text>
        </Flex>
        {isFocused ? (
          <Button
            size="1"
            variant="ghost"
            color="gray"
            onClick={handleUnfocus}
            disabled={isFocusLoading}
            style={{
              textDecoration: "underline",
              textUnderlineOffset: "2px",
              color: "var(--gray-11)",
            }}
          >
            {isFocusLoading ? <Spinner size="1" /> : "Cancel"}
          </Button>
        ) : (
          <Button
            size="1"
            variant="ghost"
            color="gray"
            onClick={handleToggleFocus}
            disabled={isFocusLoading}
            style={{
              textDecoration: "underline",
              textUnderlineOffset: "2px",
              color: "var(--gray-11)",
            }}
          >
            {isFocusLoading ? <Spinner size="1" /> : "Focus"}
          </Button>
        )}
      </Flex>
    </Box>
  ) : null;

  if (!repoPath) {
    return <PanelMessage>No repository path available</PanelMessage>;
  }

  if (isLoading) {
    return <PanelMessage>Loading changes...</PanelMessage>;
  }

  const hasChanges = changedFiles.length > 0;

  if (!hasChanges) {
    return (
      <Box height="100%" overflowY="auto" py="2">
        <Flex direction="column" height="100%">
          {focusCta}
          <Box flexGrow="1">
            <PanelMessage>No file changes yet</PanelMessage>
          </Box>
        </Flex>
      </Box>
    );
  }

  return (
    <Box height="100%" overflowY="auto" py="2">
      <Flex direction="column">
        {focusCta}
        {changedFiles.map((file) => (
          <ChangedFileItem
            key={file.path}
            file={file}
            taskId={taskId}
            repoPath={repoPath}
            isActive={isFileActive(file)}
            mainRepoPath={workspace?.folderPath}
          />
        ))}
        <Flex align="center" justify="center" gap="1" py="2">
          <CaretUpIcon size={12} color="var(--gray-10)" />
          <Text size="1" className="text-gray-10">
            /
          </Text>
          <CaretDownIcon size={12} color="var(--gray-10)" />
          <Text size="1" className="text-gray-10" ml="1">
            to switch files
          </Text>
        </Flex>
      </Flex>
    </Box>
  );
}
