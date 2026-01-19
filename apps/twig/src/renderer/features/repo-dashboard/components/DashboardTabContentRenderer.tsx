import { CodeEditorPanel } from "@features/code-editor/components/CodeEditorPanel";
import { DiffEditorPanel } from "@features/code-editor/components/DiffEditorPanel";
import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import type { Tab } from "@features/panels/store/panelTypes";
import { ShellTerminal } from "@features/terminal/components/ShellTerminal";
import { File, X } from "@phosphor-icons/react";
import { Box, Flex, IconButton, Text } from "@radix-ui/themes";
import { WorkspacesPanel } from "./WorkspacesPanel";

interface DashboardTabContentRendererProps {
  tab: Tab;
  repoPath: string;
}

export function DashboardTabContentRenderer({
  tab,
  repoPath,
}: DashboardTabContentRendererProps) {
  const { data } = tab;
  const layoutId = `dashboard-${repoPath}`;
  const clearPreviewDiff = usePanelLayoutStore((s) => s.clearPreviewDiff);

  switch (data.type) {
    case "workspaces":
      return <WorkspacesPanel repoPath={data.repoPath} />;

    case "terminal":
      return (
        <ShellTerminal cwd={data.cwd} stateKey={`dashboard-${data.cwd}`} />
      );

    case "file":
      return (
        <CodeEditorPanel
          taskId={layoutId}
          task={null}
          absolutePath={data.absolutePath}
          repoPath={repoPath}
        />
      );

    case "diff": {
      // For dashboard diffs, absolutePath may be empty - use relativePath with repoPath
      const absolutePath =
        data.absolutePath || `${repoPath}/${data.relativePath}`;
      return (
        <Box
          style={{ height: "100%", display: "flex", flexDirection: "column" }}
        >
          <Flex
            align="center"
            justify="between"
            px="3"
            py="1"
            style={{ borderBottom: "1px solid var(--gray-5)", flexShrink: 0 }}
          >
            <Text size="1" weight="medium">
              {data.relativePath}
            </Text>
            <IconButton
              size="1"
              variant="ghost"
              color="gray"
              onClick={() => clearPreviewDiff(layoutId)}
            >
              <X size={14} />
            </IconButton>
          </Flex>
          <Box style={{ flex: 1, minHeight: 0 }}>
            <DiffEditorPanel
              taskId={layoutId}
              task={null}
              absolutePath={absolutePath}
              repoPath={repoPath}
              skipAutoClose
              workspace={data.workspace}
              hideHeader
            />
          </Box>
        </Box>
      );
    }

    case "preview-placeholder":
      return (
        <Flex
          align="center"
          justify="center"
          direction="column"
          gap="2"
          height="100%"
          style={{ backgroundColor: "var(--gray-2)" }}
        >
          <File size={32} style={{ color: "var(--gray-8)" }} />
          <Text size="2" color="gray">
            Previewed changed files will appear here
          </Text>
        </Flex>
      );

    default:
      return <div>Unknown tab type: {data.type}</div>;
  }
}
