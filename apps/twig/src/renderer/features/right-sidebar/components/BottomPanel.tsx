import { TabbedPanel } from "@features/panels/components/TabbedPanel";
import type { PanelContent, Tab } from "@features/panels/store/panelTypes";
import { ShellTerminal } from "@features/terminal/components/ShellTerminal";
import { FocusWorkspaceButton } from "@features/workspace/components/FocusWorkspaceButton";
import { useFocusWorkspace } from "@features/workspace/hooks/useFocusWorkspace";
import {
  ArrowsClockwise,
  Terminal as TerminalIcon,
} from "@phosphor-icons/react";
import { Box, Flex, Text } from "@radix-ui/themes";
import { compactHomePath } from "@utils/path";
import { useEffect, useMemo, useRef, useState } from "react";
import { FocusEmptyState } from "./FocusEmptyState";

interface BottomPanelProps {
  taskId: string;
}

export function BottomPanel({ taskId }: BottomPanelProps) {
  const {
    workspace,
    isFocusLoading,
    isFocused,
    focusTerminalKey,
    handleFocus,
  } = useFocusWorkspace(taskId);

  const isWorktree = workspace?.mode === "worktree";
  const workspacePath = workspace?.worktreePath ?? workspace?.folderPath;
  const mainRepoPath = workspace?.folderPath;
  const displayPath = compactHomePath(mainRepoPath ?? "");

  const [activeTabId, setActiveTabId] = useState("terminal");
  const hasSetInitialTab = useRef(false);

  useEffect(() => {
    if (!hasSetInitialTab.current && workspace) {
      setActiveTabId(isWorktree ? "focus" : "terminal");
      hasSetInitialTab.current = true;
    }
  }, [workspace, isWorktree]);

  const content: PanelContent = useMemo(() => {
    const tabs: Tab[] = [];

    if (isWorktree) {
      tabs.push({
        id: "focus",
        label: "Focus",
        icon: <ArrowsClockwise size={14} />,
        data: { type: "other" },
        draggable: false,
        closeable: false,
        component:
          isFocused && mainRepoPath && focusTerminalKey ? (
            <ShellTerminal
              cwd={mainRepoPath}
              stateKey={focusTerminalKey}
              taskId={taskId}
            />
          ) : (
            <FocusEmptyState
              displayPath={displayPath}
              isFocusLoading={isFocusLoading}
              isDisabled={isFocusLoading || !workspace}
              onFocus={handleFocus}
            />
          ),
      });
    }

    tabs.push({
      id: "terminal",
      label: "Terminal",
      icon: <TerminalIcon size={14} />,
      data: { type: "other" },
      draggable: false,
      closeable: false,
      component: workspacePath ? (
        <ShellTerminal
          cwd={workspacePath}
          stateKey={`right-sidebar-${taskId}`}
          taskId={taskId}
        />
      ) : null,
    });

    return {
      id: `bottom-panel-${taskId}`,
      activeTabId,
      tabs,
    };
  }, [
    taskId,
    activeTabId,
    isWorktree,
    isFocused,
    mainRepoPath,
    focusTerminalKey,
    displayPath,
    isFocusLoading,
    workspace,
    handleFocus,
    workspacePath,
  ]);

  const rightContent = isWorktree ? (
    <Flex align="center" gap="3" px="2">
      {isFocused && (
        <Flex align="center" gap="1">
          <Box
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: "var(--green-9)",
            }}
          />
          <Text size="1" style={{ color: "var(--gray-11)" }}>
            Syncing
          </Text>
        </Flex>
      )}
      <FocusWorkspaceButton taskId={taskId} />
    </Flex>
  ) : undefined;

  return (
    <TabbedPanel
      panelId={`bottom-panel-${taskId}`}
      content={content}
      onActiveTabChange={(_, tabId) => setActiveTabId(tabId)}
      rightContent={rightContent}
    />
  );
}
