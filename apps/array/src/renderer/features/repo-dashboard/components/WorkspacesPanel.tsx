import { DotPattern } from "@components/ui/DotPattern";
import { useFocus } from "@features/sidebar/hooks/useFocus";
import { useTasks } from "@features/tasks/hooks/useTasks";
import { useWorkspaceStore } from "@features/workspace/stores/workspaceStore";
import { Warning } from "@phosphor-icons/react";
import { Box, Button, Card, Flex, ScrollArea, Text } from "@radix-ui/themes";
import { trpcReact } from "@renderer/trpc";
import { useNavigationStore } from "@stores/navigationStore";
import { useMemo, useState } from "react";
import { ConflictResolutionModal } from "./ConflictResolutionModal";
import { UnassignedLane } from "./UnassignedLane";
import { WorkspaceLane } from "./WorkspaceLane";

interface ConflictBannerProps {
  conflicts: Array<{ file: string; workspaces: string[] }>;
  onResolve: () => void;
}

function ConflictBanner({ conflicts, onResolve }: ConflictBannerProps) {
  if (conflicts.length === 0) return null;

  return (
    <Card
      style={{
        backgroundColor: "var(--red-3)",
        borderColor: "var(--red-6)",
      }}
    >
      <Flex justify="between" align="center" gap="3">
        <Flex align="center" gap="2">
          <Warning size={18} style={{ color: "var(--red-9)" }} />
          <Text size="2" weight="medium" style={{ color: "var(--red-11)" }}>
            {conflicts.length} conflict{conflicts.length !== 1 ? "s" : ""}{" "}
            detected
          </Text>
        </Flex>
        <Button size="1" color="red" variant="soft" onClick={onResolve}>
          Resolve
        </Button>
      </Flex>
    </Card>
  );
}

interface WorkspacesPanelProps {
  repoPath: string;
}

export function WorkspacesPanel({ repoPath }: WorkspacesPanelProps) {
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const { navigateToTask } = useNavigationStore();
  const { data: allTasks = [] } = useTasks();
  const workspaceInfos = useWorkspaceStore.use.workspaces();

  const { focusStatus, isWorkspaceFocused, toggleFocus } = useFocus(repoPath);

  const { data: workspaceStatuses } = trpcReact.arr.workspaceStatus.useQuery(
    { cwd: repoPath },
    { enabled: !!repoPath, staleTime: 5000 },
  );

  const { data: unassignedFiles } = trpcReact.arr.listUnassigned.useQuery(
    { cwd: repoPath },
    { enabled: !!repoPath, staleTime: 5000 },
  );

  const submitMutation = trpcReact.arr.workspaceSubmit.useMutation();

  const handleSubmit = (workspaceName: string) => {
    submitMutation.mutate({ workspace: workspaceName, cwd: repoPath });
  };

  // Build a map from workspace name to task
  const workspaceToTask = useMemo(() => {
    const map = new Map<string, (typeof allTasks)[0]>();
    for (const task of allTasks) {
      const wsInfo = workspaceInfos[task.id];
      if (wsInfo?.workspaceName && wsInfo.repoPath === repoPath) {
        map.set(wsInfo.workspaceName, task);
      }
    }
    return map;
  }, [allTasks, workspaceInfos, repoPath]);

  const handleWorkspaceClick = (workspaceName: string) => {
    const task = workspaceToTask.get(workspaceName);
    if (task) {
      navigateToTask(task);
    }
  };

  const handleResolveConflicts = () => {
    setConflictModalOpen(true);
  };

  const unassignedFilesList = unassignedFiles?.files ?? [];
  const unassignedStats = workspaceStatuses?.find(
    (s) => s.name === "unassigned",
  )?.stats;
  const workspaces = (focusStatus?.allWorkspaces ?? []).filter(
    (ws) => ws.name !== "unassigned",
  );

  return (
    <Flex direction="column" height="100%" overflow="hidden">
      {/* Conflict Banner */}
      {focusStatus?.conflicts && focusStatus.conflicts.length > 0 && (
        <Box px="3" py="2">
          <ConflictBanner
            conflicts={focusStatus.conflicts}
            onResolve={handleResolveConflicts}
          />
        </Box>
      )}

      {/* Main Content: Fixed Unassigned + Scrollable Lanes */}
      <Flex style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {/* Background dot pattern */}
        <DotPattern
          id="workspaces-panel-dots"
          opacity={0.5}
          color="var(--gray-5)"
        />

        {/* Fixed Unassigned Lane */}
        <UnassignedLane
          files={unassignedFilesList}
          repoPath={repoPath}
          layoutId={`dashboard-${repoPath}`}
          stats={unassignedStats}
        />

        {/* Scrollable Workspace Lanes */}
        <Box style={{ flex: 1, overflow: "hidden" }}>
          <ScrollArea
            type="always"
            scrollbars="horizontal"
            style={{ height: "100%" }}
          >
            <Flex
              style={{
                height: "100%",
                minHeight: "300px",
                width: "fit-content",
              }}
            >
              {workspaces.map((workspace) => {
                const status = workspaceStatuses?.find(
                  (s) => s.name === workspace.name,
                );
                const task = workspaceToTask.get(workspace.name);
                return (
                  <WorkspaceLane
                    key={workspace.name}
                    name={workspace.name}
                    taskTitle={task?.title}
                    isFocused={isWorkspaceFocused(workspace.name)}
                    onToggleFocus={() => toggleFocus(workspace.name)}
                    onSubmit={() => handleSubmit(workspace.name)}
                    changes={status?.changes ?? []}
                    stats={status?.stats}
                    repoPath={repoPath}
                    layoutId={`dashboard-${repoPath}`}
                    onTitleClick={
                      task
                        ? () => handleWorkspaceClick(workspace.name)
                        : undefined
                    }
                  />
                );
              })}
            </Flex>
          </ScrollArea>
        </Box>
      </Flex>

      {/* Conflict Modal */}
      {focusStatus?.conflicts && (
        <ConflictResolutionModal
          open={conflictModalOpen}
          onOpenChange={setConflictModalOpen}
          conflicts={focusStatus.conflicts}
          repoPath={repoPath}
        />
      )}
    </Flex>
  );
}
