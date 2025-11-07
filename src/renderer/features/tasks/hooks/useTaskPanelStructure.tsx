import { ListIcon, NotePencilIcon, TerminalIcon } from "@phosphor-icons/react";
import type { PanelNode, Tab } from "@stores/panelStore";
import { useMemo } from "react";

interface PanelContent {
  logsContent: React.ReactNode;
  shellContent: React.ReactNode;
  artifactsContent: React.ReactNode;
  taskDetailContent: React.ReactNode;
  createArtifactEditorContent: (fileName: string) => React.ReactNode;
}

interface UseTaskPanelStructureParams {
  taskId: string;
  openArtifacts: string[];
  activeArtifactId: string | null;
  onCloseArtifact: (fileName: string) => void;
  onTabSelect: (tabId: string) => void;
  content: PanelContent;
}

function createTab(
  id: string,
  label: string,
  component: React.ReactNode,
  options: {
    closeable?: boolean;
    onClose?: () => void;
    onSelect?: () => void;
    icon?: React.ReactNode;
  } = {},
): Tab {
  return {
    id,
    label,
    component,
    ...options,
  };
}

function createLeafNode(
  id: string,
  tabs: Tab[],
  activeTabId: string,
  options: { showTabs?: boolean; droppable?: boolean } = {},
): PanelNode {
  return {
    type: "leaf",
    id,
    content: {
      id,
      tabs,
      activeTabId,
      ...options,
    },
  };
}

function createGroupNode(
  id: string,
  direction: "horizontal" | "vertical",
  children: PanelNode[],
  sizes?: number[],
): PanelNode {
  return {
    type: "group",
    id,
    direction,
    children,
    ...(sizes && { sizes }),
  };
}

export function useTaskPanelStructure({
  taskId,
  openArtifacts,
  activeArtifactId,
  onCloseArtifact,
  onTabSelect,
  content,
}: UseTaskPanelStructureParams): PanelNode {
  const panelId = `task-detail-${taskId}`;

  return useMemo(() => {
    const logsTabs: Tab[] = [
      createTab("logs", "Logs", content.logsContent, {
        closeable: false,
        icon: <ListIcon size={12} weight="bold" color="var(--gray-11)" />,
        onSelect: () => onTabSelect("logs"),
      }),
    ];

    openArtifacts.forEach((fileName) => {
      const artifactContent = content.createArtifactEditorContent(fileName);
      if (artifactContent) {
        logsTabs.push(
          createTab(`artifact-${fileName}`, fileName, artifactContent, {
            closeable: true,
            onClose: () => onCloseArtifact(fileName),
            onSelect: () => onTabSelect(`artifact-${fileName}`),
            icon: (
              <NotePencilIcon size={12} weight="bold" color="var(--gray-11)" />
            ),
          }),
        );
      }
    });

    const activeLogTabId = activeArtifactId
      ? `artifact-${activeArtifactId}`
      : "logs";

    const leftGroup = createGroupNode(
      `${panelId}-left-group`,
      "vertical",
      [
        createLeafNode(`${panelId}-left-top`, logsTabs, activeLogTabId),
        createLeafNode(
          `${panelId}-left-bottom`,
          [
            createTab("shell", "Shell", content.shellContent, {
              icon: (
                <TerminalIcon size={12} weight="bold" color="var(--gray-11)" />
              ),
            }),
          ],
          "shell",
          { showTabs: false },
        ),
      ],
      [70, 30],
    );

    const rightGroup = createGroupNode(
      `${panelId}-right-group`,
      "vertical",
      [
        createLeafNode(
          `${panelId}-right-top`,
          [createTab("task-detail", "Task detail", content.taskDetailContent)],
          "task-detail",
          { showTabs: false, droppable: false },
        ),
        createLeafNode(
          `${panelId}-right-bottom`,
          [createTab("artifacts", "Artifacts", content.artifactsContent)],
          "artifacts",
          { showTabs: false, droppable: false },
        ),
      ],
      [50, 50],
    );

    return createGroupNode(
      `${panelId}-root`,
      "horizontal",
      [leftGroup, rightGroup],
      [75, 25],
    );
  }, [
    panelId,
    openArtifacts,
    activeArtifactId,
    onCloseArtifact,
    onTabSelect,
    content.logsContent,
    content.shellContent,
    content.artifactsContent,
    content.taskDetailContent,
    content.createArtifactEditorContent,
  ]);
}
