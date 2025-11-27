import { FolderPicker } from "@features/folder-picker/components/FolderPicker";
import { useTaskExecutionStore } from "@features/task-detail/stores/taskExecutionStore";
import { Cross2Icon } from "@radix-ui/react-icons";
import {
  Box,
  Button,
  Code,
  DataList,
  Flex,
  IconButton,
  Link,
  Text,
  Tooltip,
} from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { format, formatDistanceToNow } from "date-fns";
import type React from "react";

interface TaskMetadataProps {
  task: Task;
  progress?: { status: string };
}

export const TaskMetadata: React.FC<TaskMetadataProps> = ({
  task,
  progress,
}) => {
  const { setRepoPath, revalidateRepo, getTaskState } = useTaskExecutionStore();
  const taskState = getTaskState(task.id);

  const handleWorkingDirectoryChange = async (newPath: string) => {
    setRepoPath(task.id, newPath);
    await revalidateRepo(task.id);
  };

  const handleClearDirectory = () => {
    setRepoPath(task.id, null);
  };

  return (
    <>
      <DataList.Root>
        {progress && (
          <DataList.Item>
            <DataList.Label>Run Status</DataList.Label>
            <DataList.Value>
              <Text size="2">{progress.status.replace(/_/g, " ")}</Text>
            </DataList.Value>
          </DataList.Item>
        )}

        <DataList.Item>
          <DataList.Label>Author</DataList.Label>
          <DataList.Value>
            {task.created_by ? (
              <Text size="2">
                {task.created_by.first_name && task.created_by.last_name
                  ? `${task.created_by.first_name} ${task.created_by.last_name}`
                  : task.created_by.email}
              </Text>
            ) : (
              <Text size="2" color="gray">
                Unknown
              </Text>
            )}
          </DataList.Value>
        </DataList.Item>

        <DataList.Item>
          <DataList.Label>Repository</DataList.Label>
          <DataList.Value>
            {task.repository_config &&
            Object.keys(task.repository_config).length > 0 ? (
              <Code size="2" color="gray">
                {task.repository_config.organization}/
                {task.repository_config.repository}
              </Code>
            ) : (
              <Text size="2" color="gray">
                No repository connected
              </Text>
            )}
          </DataList.Value>
        </DataList.Item>

        <DataList.Item>
          <DataList.Label>Working directory</DataList.Label>
          <DataList.Value>
            <Flex gap="2" align="center" width="100%">
              <Box style={{ flex: 1, minWidth: 0 }}>
                <FolderPicker
                  value={taskState.repoPath || ""}
                  onChange={handleWorkingDirectoryChange}
                  placeholder="Not set - click Run to select"
                  size="2"
                />
              </Box>
              {taskState.repoPath && (
                <Tooltip content="Clear directory selection">
                  <IconButton
                    size="2"
                    variant="ghost"
                    color="gray"
                    onClick={handleClearDirectory}
                  >
                    <Cross2Icon />
                  </IconButton>
                </Tooltip>
              )}
            </Flex>
          </DataList.Value>
        </DataList.Item>

        {task.github_branch && (
          <DataList.Item>
            <DataList.Label>Branch</DataList.Label>
            <DataList.Value>
              <Code size="2" color="gray">
                {task.github_branch}
              </Code>
            </DataList.Value>
          </DataList.Item>
        )}
      </DataList.Root>

      {task.github_pr_url && (
        <Link href={task.github_pr_url} target="_blank" size="2">
          View Pull Request
        </Link>
      )}

      <Tooltip content={format(new Date(task.created_at), "PPP p")}>
        <Button
          size="1"
          variant="ghost"
          color="gray"
          style={{ width: "fit-content" }}
        >
          Created{" "}
          {formatDistanceToNow(new Date(task.created_at), {
            addSuffix: true,
          })}
        </Button>
      </Tooltip>
    </>
  );
};
