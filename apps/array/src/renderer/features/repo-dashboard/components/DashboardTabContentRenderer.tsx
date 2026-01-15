import { CodeEditorPanel } from "@features/code-editor/components/CodeEditorPanel";
import { DiffEditorPanel } from "@features/code-editor/components/DiffEditorPanel";
import type { Tab } from "@features/panels/store/panelTypes";
import { ShellTerminal } from "@features/terminal/components/ShellTerminal";
import { File } from "@phosphor-icons/react";
import { Flex, Text } from "@radix-ui/themes";
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

    case "diff":
      return (
        <DiffEditorPanel
          taskId={layoutId}
          task={null}
          absolutePath={data.absolutePath}
          repoPath={repoPath}
          skipAutoClose
        />
      );

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
