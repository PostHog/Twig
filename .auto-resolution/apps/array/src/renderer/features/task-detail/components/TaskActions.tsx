import { GearIcon, GlobeIcon } from "@radix-ui/react-icons";
import { Button, Flex, IconButton, Progress, Tooltip } from "@radix-ui/themes";
import type React from "react";

interface TaskActionsProps {
  isRunning: boolean;
  isCloningRepo: boolean;
  cloneProgress: { message: string; percent: number } | null;
  runMode: "local" | "cloud";
  hasRepositoryConfig: boolean;
  onRunTask: () => void;
  onCancel: () => void;
  onRunModeChange: (mode: "local" | "cloud") => void;
}

export const TaskActions: React.FC<TaskActionsProps> = ({
  isRunning,
  isCloningRepo,
  cloneProgress,
  runMode,
  hasRepositoryConfig,
  onRunTask,
  onCancel,
  onRunModeChange,
}) => {
  const getRunButtonLabel = () => {
    if (isRunning) return "Running...";
    if (isCloningRepo && cloneProgress) {
      // Extract just the action part (e.g., "Receiving objects" from "Receiving objects: 45% (1234/5678)")
      // Handles various git progress formats
      const actionMatch = cloneProgress.message.match(
        /^(remote:\s*)?(.+?):\s*\d+%/,
      );
      if (actionMatch) {
        return actionMatch[2].trim();
      }
      // Fallback: if no percentage, return message as-is (e.g., "Cloning into...")
      return cloneProgress.message;
    }
    if (isCloningRepo) return "Cloning...";
    if (runMode === "cloud") return "Run (Cloud)";
    return "Run (Local)";
  };

  const handleRunClick = () => {
    onRunTask();
  };

  return (
    <Flex direction="column" gap="3">
      <Flex direction="column" gap="1" style={{ flex: 1 }}>
        <Flex gap="2">
          <Button
            variant="classic"
            onClick={handleRunClick}
            disabled={isRunning || isCloningRepo}
            size="2"
            style={{ flex: 1 }}
            className="truncate"
          >
            <span className="truncate">{getRunButtonLabel()}</span>
          </Button>
          <Tooltip
            content={
              !hasRepositoryConfig
                ? "Cloud mode requires a connected repository"
                : "Toggle between Local or Cloud Agent"
            }
          >
            <IconButton
              size="2"
              variant="classic"
              color={runMode === "cloud" ? "blue" : "gray"}
              disabled={isRunning || isCloningRepo || !hasRepositoryConfig}
              onClick={() =>
                onRunModeChange(runMode === "local" ? "cloud" : "local")
              }
            >
              {runMode === "cloud" ? <GlobeIcon /> : <GearIcon />}
            </IconButton>
          </Tooltip>
        </Flex>
        {/* Progress bar underneath the button */}
        {isCloningRepo && cloneProgress && (
          <Progress
            value={cloneProgress.percent}
            size="1"
            aria-label={`Clone progress: ${cloneProgress.percent}%`}
          />
        )}
      </Flex>

      {isRunning && (
        <Button onClick={onCancel} color="red" size="2" variant="outline">
          Cancel
        </Button>
      )}
    </Flex>
  );
};
