import { FolderPicker } from "@features/folder-picker/components/FolderPicker";
import { useTaskExecutionStore } from "@features/task-detail/stores/taskExecutionStore";
import { Button, Code, DataList, Link, Text, Tooltip } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { format, formatDistanceToNow } from "date-fns";
import type React from "react";

interface TaskMetadataProps {
  task: Task;
  progress?: { status: string };
  derivedPath: string | null;
  defaultWorkspace: string | null;
}

export const TaskMetadata: React.FC<TaskMetadataProps> = ({
  task,
  progress,
  derivedPath,
  defaultWorkspace,
}) => {
  const { setRepoPath, revalidateRepo } = useTaskExecutionStore();

  const handleWorkingDirectoryChange = async (newPath: string) => {
    setRepoPath(task.id, newPath);
    await revalidateRepo(task.id);
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
            {task.repository_config ? (
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
            <FolderPicker
              value={derivedPath || ""}
              onChange={handleWorkingDirectoryChange}
              placeholder={
                !defaultWorkspace
                  ? "No workspace configured"
                  : "Select working directory..."
              }
              size="2"
            />
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
