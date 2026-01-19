import { PlayIcon } from "@phosphor-icons/react";
import { Button, Tooltip } from "@radix-ui/themes";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useWorkspaceStatus } from "../hooks/useWorkspaceStatus";
import { selectWorkspace, useWorkspaceStore } from "../stores/workspaceStore";

interface StartWorkspaceButtonProps {
  taskId: string;
}

export function StartWorkspaceButton({ taskId }: StartWorkspaceButtonProps) {
  const workspace = useWorkspaceStore(selectWorkspace(taskId));
  const runStartScripts = useWorkspaceStore.use.runStartScripts();
  const { isRunning, isCheckingStatus } = useWorkspaceStatus(taskId);

  const [isStarting, setIsStarting] = useState(false);

  const handleStart = useCallback(async () => {
    if (!workspace) return;

    setIsStarting(true);
    try {
      const result = await runStartScripts(taskId);

      if (!result.success && result.errors?.length) {
        toast.error("Start scripts failed", {
          description: result.errors.join(", "),
        });
      } else if (result.terminalSessionIds.length > 0) {
        toast.success("Workspace started", {
          description: `${result.terminalSessionIds.length} terminal(s) opened`,
        });
      }
    } catch (error) {
      toast.error("Failed to start workspace", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsStarting(false);
    }
  }, [taskId, workspace, runStartScripts]);

  if (!workspace || !workspace.hasStartScripts) {
    return null;
  }

  if (isRunning || isCheckingStatus) {
    return null;
  }

  return (
    <Tooltip content="Start workspace scripts">
      <Button
        size="1"
        variant="soft"
        onClick={handleStart}
        disabled={isStarting}
        style={
          { flexShrink: 0, WebkitAppRegion: "no-drag" } as React.CSSProperties
        }
      >
        <PlayIcon size={14} />
        {isStarting ? "Starting..." : "Start"}
      </Button>
    </Tooltip>
  );
}
