import { RichTextEditor } from "@features/editor/components/RichTextEditor";
import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { FloppyDiskIcon } from "@phosphor-icons/react";
import { Box, Button, TextArea } from "@radix-ui/themes";
import { logger } from "@renderer/lib/logger";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

const log = logger.scope("plan-editor");

// Hook to watch for external file changes
function usePlanFileWatcher(
  repoPath: string | undefined,
  taskId: string,
  fileName: string,
  onFileChanged: () => void,
) {
  const onFileChangedRef = useRef(onFileChanged);
  onFileChangedRef.current = onFileChanged;

  useEffect(() => {
    if (!repoPath || !window.electronAPI?.onFileChanged) return;

    // Build the expected path for the plan file
    const expectedPath = `${repoPath}/.posthog/${taskId}/${fileName}`;

    log.debug("Watching for changes to:", expectedPath);

    const unsubscribe = window.electronAPI.onFileChanged(
      ({ repoPath: eventRepoPath, filePath }) => {
        // Only process events for our repo
        if (eventRepoPath !== repoPath) return;

        // Check if the changed file is our plan file
        if (filePath === expectedPath) {
          log.debug("Plan file changed externally:", filePath);
          onFileChangedRef.current();
        }
      },
    );

    return unsubscribe;
  }, [repoPath, taskId, fileName]);
}

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
  const [hasInitialized, setHasInitialized] = useState(!!initialContent);
  const savedContentRef = useRef<string>(initialContent || "");
  const updateTabMetadata = usePanelLayoutStore(
    (state) => state.updateTabMetadata,
  );

  // Always use plain textarea for plan files - RichTextEditor's markdown round-trip causes issues with live updates
  const useRichEditor = false;

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

  // Initialize content from fetched data only once
  useEffect(() => {
    if (!hasInitialized && fetchedContent !== undefined) {
      setContent(fetchedContent);
      savedContentRef.current = fetchedContent;
      setHasInitialized(true);
    }
  }, [fetchedContent, hasInitialized]);

  // Handle external file changes
  const handleExternalFileChange = useCallback(async () => {
    // Refetch the file content
    try {
      let newContent: string | null = null;
      if (fileName === "plan.md") {
        newContent = await window.electronAPI?.readPlanFile(repoPath, taskId);
      } else {
        newContent = await window.electronAPI?.readTaskArtifact(
          repoPath,
          taskId,
          fileName,
        );
      }

      if (newContent !== null && newContent !== savedContentRef.current) {
        // Only update if the file content actually changed from what we last saved/loaded
        setContent(newContent);
        savedContentRef.current = newContent;
        // Also reset unsaved changes since we just loaded fresh content
        setHasUnsavedChanges(false);
        queryClient.setQueryData(
          ["task-file", repoPath, taskId, fileName],
          newContent,
        );
        log.debug("Reloaded plan content from external change");
      }
    } catch (error) {
      log.error("Failed to reload file after external change:", error);
    }
  }, [repoPath, taskId, fileName, queryClient]);

  // Watch for external file changes
  usePlanFileWatcher(repoPath, taskId, fileName, handleExternalFileChange);

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
        savedContentRef.current = contentToSave;
        setHasUnsavedChanges(false);
      } catch (error) {
        log.error("Failed to save file:", error);
      } finally {
        setIsSaving(false);
      }
    },
    [repoPath, taskId, fileName, onSave, queryClient],
  );

  const handleManualSave = useCallback(() => {
    handleSave(content);
  }, [content, handleSave]);

  // Track unsaved changes by comparing to last saved content
  useEffect(() => {
    setHasUnsavedChanges(content !== savedContentRef.current);
  }, [content]);

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
    { enableOnFormTags: ["INPUT", "TEXTAREA"], enableOnContentEditable: true },
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
        {useRichEditor ? (
          <RichTextEditor
            value={content}
            onChange={setContent}
            repoPath={repoPath}
            placeholder="Your implementation plan will appear here..."
            showToolbar={true}
            minHeight="100%"
            style={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          />
        ) : (
          <TextArea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Your implementation plan will appear here..."
            style={{
              height: "100%",
              width: "100%",
              resize: "none",
              border: "none",
              outline: "none",
              fontFamily: "monospace",
              fontSize: "13px",
              padding: "16px",
              backgroundColor: "transparent",
            }}
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
