import { useDroppable } from "@dnd-kit/react";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import {
  Badge,
  Box,
  Card,
  Flex,
  IconButton,
  Text,
  Tooltip,
} from "@radix-ui/themes";

interface DroppableWorkspaceCardProps {
  name: string;
  isFocused: boolean;
  onToggleFocus: () => void;
  stats: { added: number; removed: number; files: number };
  changes: Array<{ status: "M" | "A" | "D" | "R"; path: string }>;
}

export function DroppableWorkspaceCard({
  name,
  isFocused,
  onToggleFocus,
  stats,
  changes,
}: DroppableWorkspaceCardProps) {
  const { ref, isDropTarget } = useDroppable({
    id: `workspace-${name}`,
    data: { type: "workspace", workspace: name },
    accept: ["file"],
  });

  const hasChanges = changes.length > 0;

  return (
    <div ref={ref}>
      <Card
        size="2"
        style={{
          borderColor: isDropTarget ? "var(--green-8)" : undefined,
          borderWidth: isDropTarget ? "2px" : undefined,
          borderStyle: isDropTarget ? "dashed" : undefined,
          backgroundColor: isDropTarget ? "var(--green-2)" : undefined,
          transition: "all 150ms ease",
        }}
      >
        <Flex direction="column" gap="3">
          <Flex justify="between" align="center">
            <Flex align="center" gap="2">
              <Text weight="medium" size="2">
                {name}
              </Text>
              {isFocused && (
                <Badge color="green" size="1">
                  focused
                </Badge>
              )}
              {isDropTarget && (
                <Badge color="green" size="1" variant="soft">
                  drop here
                </Badge>
              )}
            </Flex>
            <Tooltip content={isFocused ? "Remove from focus" : "Add to focus"}>
              <IconButton
                size="1"
                variant={isFocused ? "solid" : "soft"}
                color={isFocused ? "green" : "gray"}
                onClick={onToggleFocus}
              >
                {isFocused ? <Eye size={14} /> : <EyeSlash size={14} />}
              </IconButton>
            </Tooltip>
          </Flex>

          {hasChanges ? (
            <>
              <Flex gap="3" align="center">
                <Text size="1" color="gray">
                  {stats.files} file{stats.files !== 1 ? "s" : ""}
                </Text>
                {stats.added > 0 && (
                  <Text size="1" style={{ color: "var(--green-9)" }}>
                    +{stats.added}
                  </Text>
                )}
                {stats.removed > 0 && (
                  <Text size="1" style={{ color: "var(--red-9)" }}>
                    -{stats.removed}
                  </Text>
                )}
              </Flex>

              <Box
                style={{
                  maxHeight: "120px",
                  overflow: "auto",
                }}
              >
                <Flex direction="column" gap="1">
                  {changes.slice(0, 5).map((change) => (
                    <Flex key={change.path} align="center" gap="2">
                      <Text
                        size="1"
                        style={{
                          fontFamily: "monospace",
                          color:
                            change.status === "A"
                              ? "var(--green-9)"
                              : change.status === "D"
                                ? "var(--red-9)"
                                : "var(--yellow-9)",
                        }}
                      >
                        {change.status}
                      </Text>
                      <Text
                        size="1"
                        color="gray"
                        style={{ fontFamily: "monospace" }}
                        truncate
                      >
                        {change.path}
                      </Text>
                    </Flex>
                  ))}
                  {changes.length > 5 && (
                    <Text size="1" color="gray">
                      +{changes.length - 5} more files
                    </Text>
                  )}
                </Flex>
              </Box>
            </>
          ) : (
            <Text size="1" color="gray">
              No changes
            </Text>
          )}
        </Flex>
      </Card>
    </div>
  );
}
