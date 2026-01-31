import { useAuthStore } from "@features/auth/stores/authStore";
import { useProjects } from "@features/projects/hooks/useProjects";
import { Buildings, CaretUpDown, Check, Plus } from "@phosphor-icons/react";
import { Box, DropdownMenu, Flex, Spinner, Text } from "@radix-ui/themes";
import { trpcVanilla } from "@renderer/trpc/client";
import { useQuery } from "@tanstack/react-query";
import { getCloudUrlFromRegion } from "@/constants/oauth";

export function ProjectSwitcher() {
  const cloudRegion = useAuthStore((s) => s.cloudRegion);
  const selectProject = useAuthStore((s) => s.selectProject);
  const client = useAuthStore((s) => s.client);
  const { groupedProjects, currentProject, currentProjectId, isLoading } =
    useProjects();

  const { data: currentUser } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => client?.getCurrentUser(),
    enabled: !!client,
  });

  // Don't show the switcher if there's only one project
  if (!isLoading && groupedProjects.length === 0) {
    return null;
  }

  const handleProjectSelect = (projectId: number) => {
    if (projectId !== currentProjectId) {
      selectProject(projectId);
    }
  };

  const handleAddProject = async () => {
    // Open PostHog in browser to add a new project
    if (cloudRegion) {
      const cloudUrl = getCloudUrlFromRegion(cloudRegion);
      await trpcVanilla.oauth.openExternalUrl.mutate({
        url: `${cloudUrl}/organization/create-project`,
      });
    }
  };

  return (
    <Box px="2" py="2">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-md px-2 py-1.5 transition-colors hover:bg-gray-3"
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            <Flex align="center" gap="2" style={{ minWidth: 0 }}>
              <Buildings
                size={16}
                weight="regular"
                className="shrink-0 text-gray-11"
              />
              {isLoading ? (
                <Spinner size="1" />
              ) : (
                <Flex direction="column" align="start" style={{ minWidth: 0 }}>
                  <Text
                    size="2"
                    weight="medium"
                    className="truncate"
                    style={{ maxWidth: "180px" }}
                  >
                    {currentProject?.name ?? "Select project"}
                  </Text>
                  {currentUser?.email && (
                    <Text
                      size="1"
                      className="truncate text-gray-10"
                      style={{ maxWidth: "180px" }}
                    >
                      {currentUser.email}
                    </Text>
                  )}
                </Flex>
              )}
            </Flex>
            <CaretUpDown size={14} className="shrink-0 text-gray-10" />
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Content
          align="start"
          style={{ minWidth: "220px" }}
          size="2"
        >
          {currentUser?.email && (
            <DropdownMenu.Label>
              <Text size="1" className="text-gray-10">
                {currentUser.email}
              </Text>
            </DropdownMenu.Label>
          )}
          {groupedProjects.flatMap((group) =>
            group.projects.map((project) => (
              <DropdownMenu.Item
                key={project.id}
                onSelect={() => handleProjectSelect(project.id)}
              >
                <Flex align="center" justify="between" gap="2" width="100%">
                  <Text size="2">{project.name}</Text>
                  {project.id === currentProjectId && (
                    <Check size={14} className="text-accent-11" />
                  )}
                </Flex>
              </DropdownMenu.Item>
            )),
          )}

          <DropdownMenu.Separator />

          <DropdownMenu.Item onSelect={handleAddProject}>
            <Flex align="center" gap="2">
              <Plus size={14} />
              <Text size="2">Add project</Text>
            </Flex>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </Box>
  );
}
