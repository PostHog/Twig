import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { findTabInTree } from "@features/panels/store/panelTree";
import { PlayIcon, StopIcon } from "@phosphor-icons/react";
import { Button, Tooltip } from "@radix-ui/themes";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useWorkspaceStatus } from "../hooks/useWorkspaceStatus";
import { selectWorkspace, useWorkspaceStore } from "../stores/workspaceStore";
import { useWorkspaceTerminalStore } from "../stores/workspaceTerminalStore";

interface WorkspaceControlsProps {
  taskId: string;
}

export function WorkspaceControls({ taskId }: WorkspaceControlsProps) {
  const workspace = useWorkspaceStore(selectWorkspace(taskId));
  const runStartScripts = useWorkspaceStore.use.runStartScripts();
  const stopWorkspace = useWorkspaceStore.use.stopWorkspace();
  const { isRunning, isCheckingStatus } = useWorkspaceStatus(taskId);

  const getTerminalSessionIds = useWorkspaceTerminalStore(
    (s) => () => s.workspaceTerminals[taskId] || [],
  );
  const clearWorkspaceTerminals = useWorkspaceTerminalStore(
    (s) => s.clearWorkspaceTerminals,
  );
  const closeTab = usePanelLayoutStore((s) => s.closeTab);
  const getLayout = usePanelLayoutStore((s) => s.getLayout);

  const [isLoading, setIsLoading] = useState(false);

  const closeWorkspaceTerminalTabs = useCallback(() => {
    const sessionIds = getTerminalSessionIds();
    const layout = getLayout(taskId);
    if (!layout) return;

    for (const sessionId of sessionIds) {
      const tabId = `workspace-terminal-${sessionId}`;
      const tabLocation = findTabInTree(layout.panelTree, tabId);
      if (tabLocation) {
        closeTab(taskId, tabLocation.panelId, tabId);
      }
    }
    clearWorkspaceTerminals(taskId);
  }, [
    taskId,
    getTerminalSessionIds,
    getLayout,
    closeTab,
    clearWorkspaceTerminals,
  ]);

  const handleToggle = useCallback(async () => {
    if (!workspace) return;

    setIsLoading(true);
    try {
      if (isRunning) {
        await stopWorkspace(taskId);
        closeWorkspaceTerminalTabs();
      } else {
        const result = await runStartScripts(taskId);
        if (!result.success && result.errors?.length) {
          toast.error("Start failed", {
            description: result.errors.join(", "),
          });
        }
      }
    } catch (error) {
      toast.error(isRunning ? "Failed to stop" : "Failed to start", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsLoading(false);
    }
  }, [
    taskId,
    workspace,
    isRunning,
    runStartScripts,
    stopWorkspace,
    closeWorkspaceTerminalTabs,
  ]);

  if (!workspace || !workspace.hasStartScripts) {
    return null;
  }

  const disabled = isLoading || isCheckingStatus;

  return (
    <Tooltip content={isRunning ? "Stop workspace" : "Start workspace"}>
      <Button
        size="1"
        variant="soft"
        color={isRunning ? "red" : undefined}
        onClick={handleToggle}
        disabled={disabled}
        style={
          { flexShrink: 0, WebkitAppRegion: "no-drag" } as React.CSSProperties
        }
      >
        {isRunning ? <StopIcon size={14} /> : <PlayIcon size={14} />}
        {isLoading
          ? isRunning
            ? "Stopping..."
            : "Starting..."
          : isRunning
            ? "Stop"
            : "Start"}
      </Button>
    </Tooltip>
  );
}
