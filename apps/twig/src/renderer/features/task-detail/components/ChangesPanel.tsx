import type { SessionNotification } from "@agentclientprotocol/sdk";
import { FileIcon } from "@components/ui/FileIcon";
import { PanelMessage } from "@components/ui/PanelMessage";
import { Tooltip } from "@components/ui/Tooltip";
import { isDiffTabActiveInTree, usePanelLayoutStore } from "@features/panels";
import {
  usePendingPermissionsForTask,
  useSessionStore,
} from "@features/sessions/stores/sessionStore";
import { useCwd } from "@features/sidebar/hooks/useCwd";
import { useFocusWorkspace } from "@features/workspace/hooks/useFocusWorkspace";
import {
  ArrowCounterClockwiseIcon,
  ArrowsClockwise,
  CaretDownIcon,
  CaretUpIcon,
  CheckIcon,
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
import type { AcpMessage } from "@shared/types/session-events";
import {
  isJsonRpcNotification,
  isJsonRpcRequest,
  isJsonRpcResponse,
} from "@shared/types/session-events";
import { useExternalAppsStore } from "@stores/externalAppsStore";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { showMessageBox } from "@utils/dialog";
import { handleExternalAppAction } from "@utils/handleExternalAppAction";
import { useCallback, useMemo, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useWorkspaceStore } from "@/renderer/features/workspace/stores/workspaceStore";
import {
  type ComparisonMode,
  resolveGitDiffMode,
  useChangesModeStore,
} from "../stores/changesModeStore";

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
    queryClient.invalidateQueries({
      queryKey: ["changed-files-mode", repoPath],
    });
    queryClient.invalidateQueries({
      queryKey: ["diff-stats", repoPath],
    });
    queryClient.invalidateQueries({
      queryKey: ["diff-stats-mode", repoPath],
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

const COMPARISON_MODE_LABELS: Record<ComparisonMode, string> = {
  branch: "All branch changes",
  lastTurn: "Last turn changes",
};

function extractLastTurnFilePaths(events: AcpMessage[]): Set<string> {
  const paths = new Set<string>();

  // Walk events backward: find the last completed turn's tool calls
  let inLastTurn = false;

  for (let i = events.length - 1; i >= 0; i--) {
    const msg = events[i].message;

    // Find the last response (turn completion)
    if (!inLastTurn && isJsonRpcResponse(msg)) {
      inLastTurn = true;
      continue;
    }

    // Find the matching prompt request — once found, we've scanned the whole turn
    if (
      inLastTurn &&
      isJsonRpcRequest(msg) &&
      msg.method === "session/prompt"
    ) {
      break;
    }

    // Collect file paths from tool call notifications in this turn
    if (
      inLastTurn &&
      isJsonRpcNotification(msg) &&
      msg.method === "session/update"
    ) {
      const update = (msg.params as SessionNotification | undefined)?.update;
      if (
        update &&
        "sessionUpdate" in update &&
        update.sessionUpdate === "tool_call"
      ) {
        const toolCall = update as {
          kind?: string | null;
          locations?: { path: string }[];
        };
        const kind = toolCall.kind;
        if (kind === "edit" || kind === "delete" || kind === "move") {
          for (const loc of toolCall.locations ?? []) {
            if (loc.path) paths.add(loc.path);
          }
        }
      }
    }
  }

  return paths;
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

  // Comparison mode state
  const mode = useChangesModeStore((s) => s.mode);
  const setMode = useChangesModeStore((s) => s.setMode);
  const gitDiffMode = resolveGitDiffMode(mode);

  // Session events for last turn mode
  const taskIdIndex = useSessionStore((s) => s.taskIdIndex);
  const sessions = useSessionStore((s) => s.sessions);
  const sessionEvents = useMemo(() => {
    const taskRunId = taskIdIndex[taskId];
    if (!taskRunId) return [];
    return sessions[taskRunId]?.events ?? [];
  }, [taskIdIndex, taskId, sessions]);

  const lastTurnPaths = useMemo(
    () => extractLastTurnFilePaths(sessionEvents),
    [sessionEvents],
  );

  // Mode-aware file query
  const { data: changedFiles = [], isLoading } = useQuery({
    queryKey: ["changed-files-mode", repoPath, gitDiffMode],
    queryFn: () =>
      trpcVanilla.git.getChangedFilesByMode.query({
        directoryPath: repoPath as string,
        mode: gitDiffMode === "lastTurn" ? "uncommitted" : gitDiffMode,
      }),
    enabled: !!repoPath,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    placeholderData: (prev) => prev,
  });

  // For last turn mode, filter by paths from the last turn
  const displayFiles = useMemo(() => {
    if (mode !== "lastTurn") return changedFiles;
    if (lastTurnPaths.size === 0) return [];

    return changedFiles.filter((file) => {
      const fullPath = repoPath ? `${repoPath}/${file.path}` : file.path;
      return lastTurnPaths.has(fullPath) || lastTurnPaths.has(file.path);
    });
  }, [changedFiles, mode, lastTurnPaths, repoPath]);

  const getActiveIndex = useCallback((): number => {
    if (!layout) return -1;
    return displayFiles.findIndex((file) =>
      isDiffTabActiveInTree(layout.panelTree, file.path, file.status),
    );
  }, [layout, displayFiles]);

  const handleKeyNavigation = useCallback(
    (direction: "up" | "down") => {
      if (displayFiles.length === 0) return;

      const currentIndex = getActiveIndex();
      const startIndex =
        currentIndex === -1
          ? direction === "down"
            ? -1
            : displayFiles.length
          : currentIndex;
      const newIndex =
        direction === "up"
          ? Math.max(0, startIndex - 1)
          : Math.min(displayFiles.length - 1, startIndex + 1);

      const file = displayFiles[newIndex];
      if (file) {
        openDiffInSplit(taskId, file.path, file.status);
      }
    },
    [displayFiles, getActiveIndex, openDiffInSplit, taskId],
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

  const comparisonControls = (
    <Box px="2" pb="2">
      <Flex direction="column" gap="2">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            <Button
              size="1"
              variant="soft"
              color="gray"
              style={{ width: "100%", justifyContent: "space-between" }}
            >
              <Text size="1">{COMPARISON_MODE_LABELS[mode]}</Text>
              <CaretDownIcon size={12} />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content size="1">
            {(
              Object.entries(COMPARISON_MODE_LABELS) as [
                ComparisonMode,
                string,
              ][]
            ).map(([value, label]) => (
              <DropdownMenu.Item key={value} onSelect={() => setMode(value)}>
                <Flex align="center" gap="2">
                  {mode === value && <CheckIcon size={12} />}
                  <Text size="1">{label}</Text>
                </Flex>
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </Flex>
    </Box>
  );

  if (!repoPath) {
    return <PanelMessage>No repository path available</PanelMessage>;
  }

  if (isLoading) {
    return <PanelMessage>Loading changes...</PanelMessage>;
  }

  const hasChanges = displayFiles.length > 0;

  if (!hasChanges) {
    return (
      <Box height="100%" overflowY="auto" py="2">
        <Flex direction="column" height="100%">
          {focusCta}
          {comparisonControls}
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
        {comparisonControls}
        {displayFiles.map((file) => (
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
