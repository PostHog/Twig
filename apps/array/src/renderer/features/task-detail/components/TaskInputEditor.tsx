import { Box, Flex, Text } from "@radix-ui/themes";
import type { Editor } from "@tiptap/react";
import { EditorContent } from "@tiptap/react";
import "./TaskInput.css";

interface TaskInputEditorProps {
  editor: Editor | null;
  isCreatingTask: boolean;
}

export function TaskInputEditor({
  editor,
  isCreatingTask,
}: TaskInputEditorProps) {
  return (
    <Flex
      direction="column"
      style={{
        backgroundColor: "var(--gray-a1)",
        borderRadius: "var(--radius-2)",
        border: "1px solid var(--gray-a6)",
        position: "relative",
        overflow: "visible",
      }}
    >
      <Flex
        direction="column"
        p="3"
        style={{
          cursor: "text",
          position: "relative",
          overflow: "visible",
          zIndex: 1,
        }}
        onClick={() => editor?.commands.focus()}
      >
        <Flex
          align="start"
          gap="2"
          style={{
            display: "flex",
            overflow: "visible",
            minWidth: 0,
          }}
        >
          <Text
            size="2"
            weight="bold"
            style={{
              color: "var(--accent-11)",
              fontFamily: "monospace",
              userSelect: "none",
              WebkitUserSelect: "none",
              bottom: "1px",
              position: "relative",
            }}
          >
            &gt;
          </Text>
          {isCreatingTask ? (
            <Text
              size="2"
              color="gray"
              style={{
                fontFamily: "monospace",
                fontSize: "var(--font-size-1)",
              }}
            >
              Creating task...
            </Text>
          ) : (
            <Box
              style={{
                flex: 1,
                position: "relative",
                minWidth: 0,
              }}
            >
              <EditorContent editor={editor} />
            </Box>
          )}
        </Flex>
      </Flex>
      <style>
        {`
          .cli-file-mention {
            background-color: var(--accent-a3);
            color: var(--accent-11);
            padding: 2px 4px;
            border-radius: 3px;
            font-weight: 500;
          }
        `}
      </style>
    </Flex>
  );
}
