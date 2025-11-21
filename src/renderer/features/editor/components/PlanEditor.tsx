import { RichTextEditor } from "@features/editor/components/RichTextEditor";
import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { FloppyDiskIcon } from "@phosphor-icons/react";
import { Box, Button, TextArea } from "@radix-ui/themes";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

interface PlanEditorProps {
  taskId: string;
  repoPath: string;
  fileName?: string; // Defaults to "plan.md"
  initialContent?: string;
  onSave?: (content: string) => void;
  tabId?: string; // For updating tab metadata
}

export function PlanEditor({
  taskId,
  repoPath,
  fileName = "plan.md",
  initialContent,
  onSave,
  tabId,
}: PlanEditorProps) {
  const [content, setContent] = useState(initialContent || "");
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const updateTabMetadata = usePanelLayoutStore(
    (state) => state.updateTabMetadata,
  );

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
    setHasUnsavedChanges(content !== fetchedContent);
  }, [content, fetchedContent]);

  // Update tab metadata when unsaved changes state changes
  useEffect(() => {
    if (tabId) {
      updateTabMetadata(taskId, tabId, { hasUnsavedChanges });
    }
  }, [hasUnsavedChanges, tabId, taskId, updateTabMetadata]);

  // Keyboard shortcut for save (Cmd+S / Ctrl+S)
  useHotkeys(
    "mod+s",
    (event) => {
      event.preventDefault();
      if (hasUnsavedChanges && !isSaving) {
        handleManualSave();
      }
    },
    { enableOnFormTags: ["INPUT", "TEXTAREA"] },
    [hasUnsavedChanges, isSaving, handleManualSave],
  );

  return (
    <Box
      height="100%"
      position="relative"
      style={{
        overflow: "hidden",
      }}
    >
      {/* Editor */}
      <Box
        height="100%"
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

      {/* Floating Save Button */}
      {hasUnsavedChanges && (
        <Box
          position="absolute"
          style={{
            bottom: "24px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
          }}
        >
          <Button
            size="2"
            onClick={handleManualSave}
            disabled={isSaving}
            variant="solid"
            style={{
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
            }}
          >
            <FloppyDiskIcon size={16} weight="fill" />
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </Box>
      )}
    </Box>
  );
}
