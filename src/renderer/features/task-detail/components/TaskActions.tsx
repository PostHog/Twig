import { GearIcon, GlobeIcon } from "@radix-ui/react-icons";
import { Button, Flex, IconButton, Tooltip } from "@radix-ui/themes";
import type React from "react";

interface TaskActionsProps {
  isRunning: boolean;
  isCloningRepo: boolean;
  runMode: "local" | "cloud";
  repoExists: boolean | null;
  hasRepositoryConfig: boolean;
  onRunTask: () => void;
  onCloneRepository: () => void;
  onCancel: () => void;
  onRunModeChange: (mode: "local" | "cloud") => void;
}

export const TaskActions: React.FC<TaskActionsProps> = ({
  isRunning,
  isCloningRepo,
  runMode,
  repoExists,
  hasRepositoryConfig,
  onRunTask,
  onCloneRepository,
  onCancel,
  onRunModeChange,
}) => {
  const getRunButtonLabel = () => {
    if (isRunning) return "Running...";
    if (isCloningRepo) return "Cloning...";
    if (runMode === "cloud") return "Run (Cloud)";
    return "Run (Local)";
  };

  const handleRunClick = () => {
    onRunTask();
  };

  return (
    <Flex direction="column" gap="3">
      <Flex gap="2">
        <Button
          variant="classic"
          onClick={handleRunClick}
          disabled={isRunning || isCloningRepo}
          size="2"
          style={{ flex: 1 }}
        >
          {getRunButtonLabel()}
        </Button>
        <Tooltip content="Toggle between Local or Cloud Agent">
          <IconButton
            size="2"
            variant="classic"
            color={runMode === "cloud" ? "blue" : "gray"}
            disabled={isRunning || isCloningRepo}
            onClick={() =>
              onRunModeChange(runMode === "local" ? "cloud" : "local")
            }
          >
            {runMode === "cloud" ? <GlobeIcon /> : <GearIcon />}
          </IconButton>
        </Tooltip>
      </Flex>

      {isRunning && (
        <Button onClick={onCancel} color="red" size="2" variant="outline">
          Cancel
        </Button>
      )}
    </Flex>
  );
};
