import { ChangesPanel } from "@features/task-detail/components/ChangesPanel";
import { FileTreePanel } from "@features/task-detail/components/FileTreePanel";
import { Box, Flex, Text } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { useState } from "react";

interface RightSidebarContentProps {
  taskId: string;
  task: Task;
}

type TabId = "changes" | "files";

interface TabProps {
  id: TabId;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

function Tab({ label, isActive, onClick }: TabProps) {
  return (
    <Box
      onClick={onClick}
      px="3"
      py="2"
      style={{
        cursor: "pointer",
        borderBottom: isActive
          ? "2px solid var(--accent-9)"
          : "2px solid transparent",
        color: isActive ? "var(--gray-12)" : "var(--gray-11)",
        userSelect: "none",
      }}
      className={isActive ? "" : "hover:bg-gray-2"}
    >
      <Text size="2" weight={isActive ? "medium" : "regular"}>
        {label}
      </Text>
    </Box>
  );
}

export function RightSidebarContent({
  taskId,
  task,
}: RightSidebarContentProps) {
  const [activeTab, setActiveTab] = useState<TabId>("changes");

  return (
    <Flex direction="column" height="100%">
      <Flex
        style={{
          borderBottom: "1px solid var(--gray-6)",
          flexShrink: 0,
        }}
      >
        <Tab
          id="changes"
          label="Changes"
          isActive={activeTab === "changes"}
          onClick={() => setActiveTab("changes")}
        />
        <Tab
          id="files"
          label="Files"
          isActive={activeTab === "files"}
          onClick={() => setActiveTab("files")}
        />
      </Flex>
      <Box flexGrow="1" overflow="hidden">
        {activeTab === "changes" && (
          <ChangesPanel taskId={taskId} task={task} />
        )}
        {activeTab === "files" && <FileTreePanel taskId={taskId} task={task} />}
      </Box>
    </Flex>
  );
}
