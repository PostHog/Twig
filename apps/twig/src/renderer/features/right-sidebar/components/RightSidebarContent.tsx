import { ChangesPanel } from "@features/task-detail/components/ChangesPanel";
import { FileTreePanel } from "@features/task-detail/components/FileTreePanel";
import { FolderSimple, GitDiff } from "@phosphor-icons/react";
import { Box, Flex, Text } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import type React from "react";
import { useState } from "react";

interface RightSidebarContentProps {
  taskId: string;
  task: Task;
}

type TabId = "changes" | "files";

interface TabProps {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
}

function Tab({ label, icon, isActive, onClick }: TabProps) {
  return (
    <Flex
      onClick={onClick}
      align="center"
      gap="1"
      pl="3"
      pr="3"
      className="flex-shrink-0 cursor-pointer select-none border-r border-b-2"
      style={{
        borderRightColor: "var(--gray-6)",
        borderBottomColor: isActive ? "var(--accent-10)" : "transparent",
        color: isActive ? "var(--accent-12)" : "var(--gray-11)",
        height: "31px",
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.color = "var(--gray-12)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.color = "var(--gray-11)";
        }
      }}
    >
      <Box style={{ display: "flex", alignItems: "center" }}>{icon}</Box>
      <Text size="1">{label}</Text>
    </Flex>
  );
}

export function RightSidebarContent({
  taskId,
  task,
}: RightSidebarContentProps) {
  const [activeTab, setActiveTab] = useState<TabId>("changes");

  return (
    <Flex
      direction="column"
      height="100%"
      style={{ backgroundColor: "var(--color-background)" }}
    >
      <Flex
        style={{
          borderBottom: "1px solid var(--gray-6)",
          flexShrink: 0,
        }}
      >
        <Tab
          id="changes"
          label="Changes"
          icon={<GitDiff size={14} />}
          isActive={activeTab === "changes"}
          onClick={() => setActiveTab("changes")}
        />
        <Tab
          id="files"
          label="Files"
          icon={<FolderSimple size={14} />}
          isActive={activeTab === "files"}
          onClick={() => setActiveTab("files")}
        />
      </Flex>
      <Box flexGrow="1" overflow="hidden">
        {activeTab === "changes" && (
          <ChangesPanel key={taskId} taskId={taskId} task={task} />
        )}
        {activeTab === "files" && (
          <FileTreePanel key={taskId} taskId={taskId} task={task} />
        )}
      </Box>
    </Flex>
  );
}
