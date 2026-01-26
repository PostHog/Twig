import { useAuthStore } from "@features/auth/stores/authStore";
import {
  ArrowLeftIcon,
  CircleNotchIcon,
  SparkleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import {
  Box,
  Button,
  Callout,
  Flex,
  Heading,
  Link,
  Text,
} from "@radix-ui/themes";
import { get } from "@renderer/di/container";
import { RENDERER_TOKENS } from "@renderer/di/tokens";
import type { TaskService } from "@renderer/services/task/service";
import { useNavigationStore } from "@renderer/stores/navigationStore";
import { useTaskDirectoryStore } from "@renderer/stores/taskDirectoryStore";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { SETUP_TASK_PROMPT } from "@/renderer/features/autonomy/utils/createPostHogSetupTask";

export function AutonomyOnboarding() {
  const client = useAuthStore((state) => state.client);
  const projectId = useAuthStore((state) => state.projectId);
  const queryClient = useQueryClient();
  const { navigateToTask, navigateToTaskInput } = useNavigationStore();
  const lastUsedDirectory = useTaskDirectoryStore(
    (state) => state.lastUsedDirectory,
  );

  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);

  const handleSetupAutonomy = useCallback(async () => {
    if (!client || !lastUsedDirectory) return;

    setIsCreatingTask(true);
    setTaskError(null);

    try {
      await client.updateTeam({ proactive_tasks_enabled: true });

      // Force refetch of project query to get updated team data
      if (projectId) {
        await queryClient.refetchQueries({
          queryKey: ["project", projectId],
        });
      }

      const taskService = get<TaskService>(RENDERER_TOKENS.TaskService);
      const result = await taskService.createTask({
        content: SETUP_TASK_PROMPT,
        repoPath: lastUsedDirectory,
        workspaceMode: "worktree",
      });

      if (result.success) {
        navigateToTask(result.data.task);
      } else {
        setTaskError(result.error);
        setIsCreatingTask(false);
      }
    } catch (err) {
      setTaskError(
        err instanceof Error ? err.message : "Failed to create setup task",
      );
      setIsCreatingTask(false);
    }
  }, [client, projectId, lastUsedDirectory, navigateToTask, queryClient]);

  const handleBack = useCallback(() => {
    setTaskError(null);
    navigateToTaskInput();
  }, [navigateToTaskInput]);

  const repoName = lastUsedDirectory?.split("/").pop() ?? null;
  const isDisabled = !lastUsedDirectory || isCreatingTask;

  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      className="h-full w-full p-8"
    >
      <Box className="w-full max-w-md">
        <Box className="space-y-4">
          <Flex align="center" gap="2">
            <Heading size="5">Welcome to Autonomy</Heading>
            <SparkleIcon size={28} className="text-accent-9" />
          </Flex>

          <Flex direction="column" gap="2" className="my-4">
            <Callout.Root size="1" color="gray" className="-ml-2 mr-2">
              <Callout.Text>
                <strong>
                  Twig Autonomy hands you ready-to-run fixes for real user
                  problems.
                </strong>{" "}
                Just approve or reject tasks - each one comes with hard evidence
                and impact numbers, so you know exactly what you're addressing
                and why.
              </Callout.Text>
            </Callout.Root>

            <Text size="1" color="gray" weight="bold" className="ml-2">
              But how does it know what needs fixing or improving?
            </Text>

            <Callout.Root size="1" color="gray" className="-mr-2 ml-2">
              <Callout.Text>
                <strong>
                  It spots patterns in usage that would take you hours to find.
                </strong>{" "}
                Confusing flows, silently broken buttons, full-on crashes -
                Autonomy connects the dots to surface what matters.
              </Callout.Text>
            </Callout.Root>

            <Text size="1" color="gray" weight="bold" className="-ml-2">
              Where is it getting those insights from?
            </Text>

            <Callout.Root size="1" color="gray" className="-ml-2 mr-2">
              <Callout.Text>
                <strong>It watches every session and analyzes it.</strong> Each
                user interaction, error, and visual glitch gets dissected
                automatically. No more hunting through logs or waiting for bug
                reports.
              </Callout.Text>
            </Callout.Root>

            <Text size="1" color="gray" weight="bold" className="ml-2">
              What makes this possible?
            </Text>

            <Callout.Root size="1" color="gray" className="-mr-2 ml-2">
              <Callout.Text>
                <strong>
                  First, we ensure a full tracking setup with{" "}
                  <Link
                    href="https://posthog.com/"
                    color="gray"
                    underline="always"
                  >
                    PostHog
                  </Link>
                  .
                </strong>{" "}
                Session recordings, analytics, and error tracking - this is what
                we'll set up now (if not in place yet). Once the data's flowing,
                Autonomy begins its work.
              </Callout.Text>
            </Callout.Root>
          </Flex>

          {taskError && (
            <Callout.Root color="red" size="1">
              <Callout.Icon>
                <WarningCircleIcon />
              </Callout.Icon>
              <Callout.Text>{taskError}</Callout.Text>
            </Callout.Root>
          )}

          <Flex gap="3" justify="end">
            <Button variant="soft" color="gray" onClick={handleBack}>
              <ArrowLeftIcon size={16} />
              Back
            </Button>
            <Button
              onClick={handleSetupAutonomy}
              disabled={isDisabled}
              title={
                !lastUsedDirectory ? "Select a repository first" : undefined
              }
            >
              {isCreatingTask ? (
                <CircleNotchIcon size={16} className="animate-spin" />
              ) : (
                <SparkleIcon size={16} />
              )}
              {repoName
                ? `Set up Autonomy for ${repoName} (8 min)`
                : "Set up Autonomy (8 min)"}
            </Button>
          </Flex>
        </Box>
      </Box>
    </Flex>
  );
}
