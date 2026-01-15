import {
  type ChangedFile,
  ChangedFileItem,
} from "@components/ui/ChangedFileItem";
import { DiffStatsBadge } from "@components/ui/DiffStatsBadge";
import { FocusToggleButton } from "@components/ui/FocusToggleButton";
import { useDroppable } from "@dnd-kit/react";
import { ArrowUp, GitBranch, SidebarSimple } from "@phosphor-icons/react";
import {
  Button,
  Card,
  Flex,
  IconButton,
  ScrollArea,
  Text,
} from "@radix-ui/themes";
import { useState } from "react";

interface DiffStats {
  added: number;
  removed: number;
  files: number;
}

interface WorkspaceLaneProps {
  name: string;
  taskTitle?: string;
  isFocused: boolean;
  onToggleFocus: () => void;
  onSubmit: () => void;
  changes: ChangedFile[];
  stats?: DiffStats;
  repoPath: string;
  layoutId?: string;
  onTitleClick?: () => void;
}

export function WorkspaceLane({
  name,
  taskTitle,
  isFocused,
  onToggleFocus,
  onSubmit,
  changes,
  stats,
  repoPath,
  layoutId,
  onTitleClick,
}: WorkspaceLaneProps) {
  const [collapsed, setCollapsed] = useState(false);

  const { ref, isDropTarget } = useDroppable({
    id: `workspace-${name}`,
    data: { type: "workspace", workspace: name },
    accept: ["file"],
  });

  if (collapsed) {
    return (
      <Flex
        direction="column"
        align="center"
        gap="2"
        py="2"
        style={{
          width: "32px",
          minWidth: "32px",
          height: "100%",
          borderRight: "1px solid var(--gray-5)",
          backgroundColor: "var(--color-background)",
          cursor: "pointer",
        }}
        onClick={() => setCollapsed(false)}
      >
        <IconButton size="1" variant="ghost" color="gray">
          <SidebarSimple size={16} />
        </IconButton>
        <Text
          size="1"
          weight="medium"
          style={{
            writingMode: "vertical-rl",
            textOrientation: "mixed",
            color: "var(--gray-11)",
            letterSpacing: "0.5px",
          }}
        >
          {taskTitle || name}
        </Text>
        {changes.length > 0 && (
          <DiffStatsBadge
            added={stats?.added}
            removed={stats?.removed}
            files={changes.length}
            vertical
          />
        )}
      </Flex>
    );
  }

  const hasChanges = changes.length > 0;

  return (
    <Flex
      ref={ref}
      direction="column"
      gap="3"
      px="3"
      py="2"
      style={{
        width: "304px",
        minWidth: "304px",
        height: "100%",
        borderRight: "1px solid var(--gray-5)",
        backgroundColor: isDropTarget ? "var(--green-2)" : "transparent",
        transition: "background-color 150ms ease",
      }}
    >
      {/* Collapse Button */}
      <IconButton
        size="1"
        variant="ghost"
        color="gray"
        onClick={() => setCollapsed(true)}
        style={{ alignSelf: "flex-start" }}
      >
        <SidebarSimple size={14} />
      </IconButton>

      {/* Task Card */}
      <Card
        size="1"
        className="overflow-hidden bg-[var(--color-background)]"
        style={{ padding: 0 }}
      >
        <Flex
          direction="column"
          gap="2"
          p="2"
          className={
            onTitleClick
              ? "cursor-pointer transition-colors hover:bg-[var(--accent-3)]"
              : ""
          }
          onClick={onTitleClick}
        >
          <Text size="1" weight="medium">
            {taskTitle || "No task"}
          </Text>
          <Flex align="center" gap="1">
            <span className="flex items-center justify-center rounded border border-gray-6 p-0.5">
              <GitBranch size={12} style={{ color: "var(--gray-11)" }} />
            </span>
            <Text size="1" color="gray">
              {name}
            </Text>
          </Flex>
        </Flex>
        <Flex
          align="center"
          justify="between"
          px="2"
          py="1"
          className="bg-gray-3"
          style={{
            borderTop: "1px solid var(--gray-5)",
          }}
        >
          <FocusToggleButton
            isFocused={isFocused}
            onToggle={onToggleFocus}
            size="md"
          />
          <Button
            size="1"
            variant="surface"
            onClick={(e) => {
              e.stopPropagation();
              onSubmit();
            }}
          >
            Push
            <ArrowUp size={12} />
          </Button>
        </Flex>
      </Card>

      {/* Changes Card */}
      <Card
        size="1"
        style={{
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          maxHeight: "50%",
          backgroundColor: "var(--color-background)",
        }}
      >
        {hasChanges ? (
          <>
            {/* Stats Header */}
            <Flex
              align="center"
              justify="between"
              pb="2"
              style={{ borderBottom: "1px solid var(--gray-5)" }}
            >
              <Text size="1" weight="medium">
                Changes
              </Text>
              <DiffStatsBadge
                added={stats?.added}
                removed={stats?.removed}
                files={changes.length}
              />
            </Flex>

            {/* File List */}
            <ScrollArea
              style={{
                flex: 1,
                marginTop: "8px",
                marginLeft: "-8px",
                marginRight: "-8px",
              }}
            >
              <Flex direction="column">
                {changes.map((change) => (
                  <ChangedFileItem
                    key={change.path}
                    file={change}
                    repoPath={repoPath}
                    layoutId={layoutId}
                  />
                ))}
              </Flex>
            </ScrollArea>
          </>
        ) : (
          /* Empty Drop Zone */
          <Text
            size="1"
            color="gray"
            align="center"
            style={{ padding: "var(--space-4) 0" }}
          >
            {isDropTarget ? "Drop to assign" : "Drop files to assign changes"}
          </Text>
        )}
      </Card>
    </Flex>
  );
}
