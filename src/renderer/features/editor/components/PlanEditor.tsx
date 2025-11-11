import { RichTextEditor } from "@features/editor/components/RichTextEditor";
import { Box, Button, Flex, TextArea } from "@radix-ui/themes";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

interface PlanEditorProps {
  taskId: string;
  repoPath: string;
  fileName?: string; // Defaults to "plan.md"
  initialContent?: string;
  onSave?: (content: string) => void;
}

export function PlanEditor({
  taskId,
  repoPath,
  fileName = "plan.md",
  initialContent,
  onSave,
}: PlanEditorProps) {
  const [content, setContent] = useState(initialContent || "");
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const isMarkdownFile = fileName.endsWith(".md");

  const queryClient = useQueryClient();
  const { data: fetchedContent } = useQuery({
    queryKey: ["task-file", repoPath, taskId, fileName],
    enabled: !initialContent && !!repoPath && !!taskId,
    queryFn: async () => {
      if (!window.electronAPI) {
        throw new Error("Electron API unavailable");
      }
      if (fileName === "plan.md") {
        const result = await window.electronAPI.readPlanFile(repoPath, taskId);
        return result ?? "";
      }
      const result = await window.electronAPI.readTaskArtifact(
        repoPath,
        taskId,
        fileName,
      );
      return result ?? "";
    },
  });

  useEffect(() => {
    if (!initialContent && fetchedContent && content === "") {
      setContent(fetchedContent);
    }
  }, [fetchedContent, initialContent, content]);

  const handleSave = useCallback(
    async (contentToSave: string) => {
      if (!repoPath || !taskId) return;

      setIsSaving(true);
      try {
        if (fileName === "plan.md") {
          await window.electronAPI?.writePlanFile(
            repoPath,
            taskId,
            contentToSave,
          );
        }
        onSave?.(contentToSave);
        queryClient.setQueryData(
          ["task-file", repoPath, taskId, fileName],
          contentToSave,
        );
        setHasUnsavedChanges(false);
      } catch (error) {
        console.error("Failed to save file:", error);
      } finally {
        setIsSaving(false);
      }
    },
    [repoPath, taskId, fileName, onSave, queryClient],
  );

  const handleManualSave = useCallback(() => {
    handleSave(content);
  }, [content, handleSave]);

  // Track unsaved changes
  useEffect(() => {
    if (content !== fetchedContent) {
      setHasUnsavedChanges(true);
    } else {
      setHasUnsavedChanges(false);
    }
  }, [content, fetchedContent]);

  return (
    <Flex
      direction="column"
      height="100%"
      style={{
        overflow: "hidden",
      }}
    >
      {/* Save Button Bar */}
      <Flex
        p="2"
        gap="2"
        align="center"
        justify="end"
        style={{
          borderBottom: "1px solid var(--gray-6)",
          backgroundColor: "var(--gray-2)",
        }}
      >
        <Button
          size="1"
          onClick={handleManualSave}
          disabled={isSaving || !hasUnsavedChanges}
          variant="soft"
        >
          {isSaving ? "Saving..." : hasUnsavedChanges ? "Save" : "Saved"}
        </Button>
      </Flex>

      {/* Editor */}
      <Box
        flexGrow="1"
        style={{
          overflow: "hidden",
        }}
      >
        {isMarkdownFile ? (
          <RichTextEditor
            value={content}
            onChange={setContent}
            repoPath={repoPath}
            placeholder="Your implementation plan will appear here..."
            showToolbar={true}
            minHeight="100%"
          />
        ) : (
          <TextArea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="File content will appear here..."
            className="min-h-full flex-1 resize-none rounded-none border-none bg-transparent font-mono text-sm shadow-none outline-none"
          />
        )}
      </Box>
    </Flex>
  );
}
