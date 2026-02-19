import { useAuthStore } from "@features/auth/stores/authStore";
import { useTwigAuthStore } from "@features/auth/stores/twigAuthStore";
import { Command } from "@features/command/components/Command";
import { useProjects } from "@features/projects/hooks/useProjects";
import {
  CaretDown,
  Check,
  FolderSimple,
  Plus,
  SignOut,
} from "@phosphor-icons/react";
import { Box, Dialog, Flex, Popover, Spinner, Text } from "@radix-ui/themes";
import { trpcVanilla } from "@renderer/trpc/client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getCloudUrlFromRegion } from "@/constants/oauth";
import "./ProjectSwitcher.css";

export function ProjectSwitcher() {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const cloudRegion = useAuthStore((s) => s.cloudRegion);
  const selectProject = useAuthStore((s) => s.selectProject);
  const logout = useAuthStore((s) => s.logout);
  const client = useAuthStore((s) => s.client);
  const { groupedProjects, currentProject, currentProjectId, isLoading } =
    useProjects();

  const { data: currentUser } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => client?.getCurrentUser(),
    enabled: !!client,
  });

  const handleProjectSelect = (projectId: number) => {
    if (projectId !== currentProjectId) {
      selectProject(projectId);
    }
    setPopoverOpen(false);
    setDialogOpen(false);
  };

  const handleCreateProject = async () => {
    if (cloudRegion) {
      const cloudUrl = getCloudUrlFromRegion(cloudRegion);
      await trpcVanilla.oauth.openExternalUrl.mutate({
        url: `${cloudUrl}/organization/create-project`,
      });
    }
    setPopoverOpen(false);
  };

  const handleAllProjects = () => {
    setPopoverOpen(false);
    setDialogOpen(true);
  };

  const handleLogout = () => {
    setPopoverOpen(false);
    logout();
    useTwigAuthStore.getState().logout();
  };

  return (
    <>
      <Popover.Root open={popoverOpen} onOpenChange={setPopoverOpen}>
        <Popover.Trigger>
          <button
            type="button"
            className="flex w-full cursor-pointer items-center justify-between border-none bg-transparent px-3 py-2 transition-colors hover:bg-gray-3"
          >
            <Flex
              direction="column"
              align="start"
              style={{ minWidth: 0, flex: 1 }}
            >
              {isLoading ? (
                <Spinner size="1" />
              ) : (
                <>
                  <Text size="1" weight="medium" className="truncate">
                    {currentProject?.name ?? "Select project"}
                  </Text>
                  {currentUser?.email && (
                    <Text size="1" className="truncate text-gray-10">
                      {currentUser.email}
                    </Text>
                  )}
                </>
              )}
            </Flex>
            <CaretDown size={14} className="shrink-0 text-gray-10" />
          </button>
        </Popover.Trigger>

        <Popover.Content
          align="start"
          side="bottom"
          style={{ padding: 0, width: "var(--radix-popover-trigger-width)" }}
          sideOffset={4}
        >
          <Box>
            <Box className="border-gray-6 border-b px-3 py-2">
              {currentUser?.first_name && (
                <Text size="1" weight="medium" className="mt-1 block">
                  {currentUser.first_name}
                  {currentUser.last_name && ` ${currentUser.last_name}`}
                </Text>
              )}
              <Text size="1" className="text-gray-10">
                {currentUser?.email}
              </Text>
            </Box>

            <Box className="py-1">
              <button
                type="button"
                onClick={handleAllProjects}
                className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-3 py-1.5 text-left transition-colors hover:bg-gray-3"
              >
                <FolderSimple size={14} className="text-gray-11" />
                <Text size="1">All projects</Text>
              </button>

              <button
                type="button"
                onClick={handleCreateProject}
                className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-3 py-1.5 text-left transition-colors hover:bg-gray-3"
              >
                <Plus size={14} className="text-gray-11" />
                <Text size="1">Create project</Text>
              </button>

              <Box className="mx-3 my-1 h-px bg-gray-6" />

              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-3 py-1.5 text-left transition-colors hover:bg-gray-3"
              >
                <SignOut size={14} className="text-gray-11" />
                <Text size="1">Log out</Text>
              </button>
            </Box>
          </Box>
        </Popover.Content>
      </Popover.Root>

      <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
        <Dialog.Content
          className="project-picker-dialog"
          style={{ maxWidth: 600, padding: 0 }}
        >
          <Command.Root shouldFilter={true} label="Project picker">
            <Command.Input placeholder="Search projects..." autoFocus={true} />
            <Command.List>
              <Command.Empty>No projects found.</Command.Empty>
              {groupedProjects.map((group) =>
                group.projects.map((project) => (
                  <Command.Item
                    key={project.id}
                    value={`${project.name} ${project.id}`}
                    onSelect={() => handleProjectSelect(project.id)}
                  >
                    <Flex align="center" justify="between" width="100%">
                      <Text size="1">{project.name}</Text>
                      {project.id === currentProjectId && (
                        <Check size={14} className="text-accent-11" />
                      )}
                    </Flex>
                  </Command.Item>
                )),
              )}
            </Command.List>
          </Command.Root>
        </Dialog.Content>
      </Dialog.Root>
    </>
  );
}
