import { RichTextEditor } from "@features/editor/components/RichTextEditor";
import { TaskActions } from "@features/tasks/components/TaskActions";
import { TaskHeader } from "@features/tasks/components/TaskHeader";
import { TaskMetadata } from "@features/tasks/components/TaskMetadata";
import { Box, Flex } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import type { Control } from "react-hook-form";
import { Controller } from "react-hook-form";

interface TaskDetailPanelProps {
  task: Task;
  control: Control<{
    title: string;
    description: string;
  }>;
  onSubmit: () => void;
  repoPath: string | null;
  derivedPath: string | null;
  defaultWorkspace: string | null;
  progress?: { status: string };
  isRunning: boolean;
  isCloningRepo: boolean;
  runMode: "local" | "cloud";
  repoExists: boolean;
  hasRepositoryConfig: boolean;
  onRunTask: () => void;
  onCloneRepository: () => void;
  onCancel: () => void;
  onRunModeChange: (value: "local" | "cloud") => void;
}

export function TaskDetailPanel({
  task,
  control,
  onSubmit,
  repoPath,
  derivedPath,
  defaultWorkspace,
  progress,
  isRunning,
  isCloningRepo,
  runMode,
  repoExists,
  hasRepositoryConfig,
  onRunTask,
  onCloneRepository,
  onCancel,
  onRunModeChange,
}: TaskDetailPanelProps) {
  return (
    <Box height="100%" overflowY="auto">
      <Box p="4">
        <Flex direction="column" gap="4">
          <TaskHeader slug={task.slug} control={control} onSubmit={onSubmit} />

          <Flex direction="column">
            <Controller
              name="description"
              control={control}
              render={({ field }) => (
                <RichTextEditor
                  value={field.value}
                  onChange={field.onChange}
                  repoPath={repoPath}
                  placeholder="No description provided. Use @ to mention files, or format text with markdown."
                  onBlur={onSubmit}
                  showToolbar={true}
                  minHeight="100px"
                  style={{
                    minHeight: "100px",
                  }}
                />
              )}
            />
            <Box className="border-gray-6 border-t" mt="4" />
          </Flex>

          <TaskMetadata
            task={task}
            progress={progress}
            derivedPath={derivedPath}
            defaultWorkspace={defaultWorkspace}
          />
        </Flex>

        <Flex direction="column" gap="3" mt="4">
          <TaskActions
            isRunning={isRunning}
            isCloningRepo={isCloningRepo}
            runMode={runMode}
            repoExists={repoExists}
            hasRepositoryConfig={hasRepositoryConfig}
            onRunTask={onRunTask}
            onCloneRepository={onCloneRepository}
            onCancel={onCancel}
            onRunModeChange={onRunModeChange}
          />
        </Flex>
      </Box>
    </Box>
  );
}
