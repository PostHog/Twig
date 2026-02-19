import { useAuthStore } from "@features/auth/stores/authStore";
import { Command } from "@features/command/components/Command";
import { useProjects } from "@features/projects/hooks/useProjects";
import { useSettingsDialogStore } from "@features/settings/stores/settingsDialogStore";
import {
  ArrowSquareOut,
  CaretDown,
  CaretRight,
  CaretUp,
  Check,
  DiscordLogo,
  FolderSimple,
  Gear,
  Info,
  Keyboard,
  Plus,
  ShieldCheck,
  SignOut,
} from "@phosphor-icons/react";
import {
  Box,
  Dialog,
  DropdownMenu,
  Flex,
  Popover,
  Text,
} from "@radix-ui/themes";
import { trpcVanilla } from "@renderer/trpc/client";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { getCloudUrlFromRegion } from "@/constants/oauth";
import { isMac } from "@utils/platform";
import "./ProjectSwitcher.css";

export function ProjectSwitcher() {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [learnMoreOpen, setLearnMoreOpen] = useState(false);
  const learnMoreTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const openLearnMore = useCallback(() => {
    clearTimeout(learnMoreTimeout.current);
    setLearnMoreOpen(true);
  }, []);

  const closeLearnMore = useCallback(() => {
    learnMoreTimeout.current = setTimeout(() => setLearnMoreOpen(false), 150);
  }, []);

  useEffect(() => {
    if (!popoverOpen) {
      clearTimeout(learnMoreTimeout.current);
      setLearnMoreOpen(false);
    }
  }, [popoverOpen]);
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

  const openSettings = useSettingsDialogStore((s) => s.open);

  const handleSettings = () => {
    setPopoverOpen(false);
    openSettings();
  };

  const handleKeyboardShortcuts = () => {
    setPopoverOpen(false);
    openSettings("shortcuts");
  };

  const handleOpenExternal = async (url: string) => {
    await trpcVanilla.oauth.openExternalUrl.mutate({ url });
    setPopoverOpen(false);
  };

  const handleDiscord = async () => {
    await trpcVanilla.oauth.openExternalUrl.mutate({
      url: "https://discord.gg/c3qYyJXSWp",
    });
    setPopoverOpen(false);
  };

  const handleLogout = () => {
    setPopoverOpen(false);
    logout();
  };

  return (
    <>
      <Popover.Root
        open={popoverOpen}
        onOpenChange={(open) => {
          setPopoverOpen(open);
          if (!open) setLearnMoreOpen(false);
        }}
      >
        <Popover.Trigger>
          <button
            type="button"
            className="flex w-full cursor-pointer items-center justify-between border-none bg-transparent px-3 py-2.5 transition-colors hover:bg-gray-3"
          >
            <Flex
              direction="column"
              align="start"
              gap="1"
              style={{ minWidth: 0, flex: 1, maxWidth: "calc(100% - 24px)" }}
            >
              {isLoading ? (
                <>
                  <Box className="h-4 w-24 animate-pulse rounded bg-gray-6" />
                  <Box className="h-3.5 w-32 animate-pulse rounded bg-gray-5" />
                </>
              ) : (
                <>
                  <Text
                    size="2"
                    weight="medium"
                    className="w-full truncate text-left"
                  >
                    {currentProject?.name ?? "Select project"}
                  </Text>
                  {currentUser?.email && (
                    <Text
                      size="1"
                      className="w-full truncate text-left text-gray-10"
                    >
                      {currentUser.email}
                    </Text>
                  )}
                </>
              )}
            </Flex>
            {popoverOpen ? (
              <CaretUp size={14} className="shrink-0 text-gray-10" />
            ) : (
              <CaretDown size={14} className="shrink-0 text-gray-10" />
            )}
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
              {currentUser ? (
                <>
                  {currentUser.first_name && (
                    <Text size="1" weight="medium" className="mt-1 block">
                      {currentUser.first_name}
                      {currentUser.last_name && ` ${currentUser.last_name}`}
                    </Text>
                  )}
                  <Text size="1" className="text-gray-10">
                    {currentUser.email}
                  </Text>
                </>
              ) : (
                <>
                  <Box className="mt-1 h-3.5 w-20 animate-pulse rounded bg-gray-6" />
                  <Box className="mt-1 h-3 w-32 animate-pulse rounded bg-gray-5" />
                </>
              )}
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
                onClick={handleDiscord}
                className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-3 py-1.5 text-left transition-colors hover:bg-gray-3"
              >
                <DiscordLogo size={14} className="text-gray-11" />
                <Text size="1">Join our Discord</Text>
              </button>

              <DropdownMenu.Root open={learnMoreOpen} modal={false}>
                <DropdownMenu.Trigger>
                  <button
                    type="button"
                    onMouseEnter={openLearnMore}
                    onMouseLeave={closeLearnMore}
                    className="flex w-full cursor-pointer items-center justify-between border-none bg-transparent px-3 py-1.5 text-left transition-colors hover:bg-gray-3"
                  >
                    <Flex align="center" gap="2">
                      <Info size={14} className="text-gray-11" />
                      <Text size="1">Learn more</Text>
                    </Flex>
                    <CaretRight size={12} className="text-gray-9" />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Content
                  side="right"
                  sideOffset={4}
                  size="1"
                  onMouseEnter={openLearnMore}
                  onMouseLeave={closeLearnMore}
                >
                  <DropdownMenu.Item
                    className="cursor-pointer"
                    onClick={() => handleOpenExternal("https://twig.com")}
                  >
                    <ArrowSquareOut size={14} className="text-gray-11" />
                    <Text size="1">Twig Website</Text>
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator />
                  <DropdownMenu.Item
                    className="cursor-pointer"
                    onClick={() =>
                      handleOpenExternal("https://twig.com/privacy")
                    }
                  >
                    <ShieldCheck size={14} className="text-gray-11" />
                    <Text size="1">Privacy Policy</Text>
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator />
                  <DropdownMenu.Item
                    className="cursor-pointer"
                    onClick={handleKeyboardShortcuts}
                  >
                    <Keyboard size={14} className="text-gray-11" />
                    <Flex align="center" justify="between" style={{ flex: 1 }}>
                      <Text size="1">Keyboard Shortcuts</Text>
                      <Text size="1" className="ml-4 text-gray-9">
                        {isMac ? "⌘/" : "Ctrl+/"}
                      </Text>
                    </Flex>
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Root>

              <button
                type="button"
                onClick={handleSettings}
                className="flex w-full cursor-pointer items-center justify-between border-none bg-transparent px-3 py-1.5 text-left transition-colors hover:bg-gray-3"
              >
                <Flex align="center" gap="2">
                  <Gear size={14} className="text-gray-11" />
                  <Text size="1">Settings</Text>
                </Flex>
                <Text size="1" className="text-gray-9">
                  {isMac ? "⌘," : "Ctrl+,"}
                </Text>
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
