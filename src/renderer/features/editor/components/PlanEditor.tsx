import { Box, TextArea } from "@radix-ui/themes";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

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
  const saveTimeoutRef = useRef<number | null>(null);

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

  // Seed editor once with fetched content if no initial content was provided
  useEffect(() => {
    if (!initialContent && fetchedContent && content === "") {
      setContent(fetchedContent);
    }
  }, [fetchedContent, initialContent, content]);

  const handleSave = useCallback(
    async (contentToSave: string) => {
      if (!repoPath || !taskId) return;

      try {
        if (fileName === "plan.md") {
          await window.electronAPI?.writePlanFile(
            repoPath,
            taskId,
            contentToSave,
          );
        } else {
          console.warn(
            `Saving ${fileName} - generic artifact writing not yet implemented`,
          );
        }
        onSave?.(contentToSave);
        queryClient.setQueryData(
          ["task-file", repoPath, taskId, fileName],
          contentToSave,
        );
      } catch (error) {
        console.error("Failed to save file:", error);
      }
    },
    [repoPath, taskId, fileName, onSave, queryClient],
  );

  // Auto-save with debounce
  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      if (content !== fetchedContent) {
        handleSave(content);
      }
    }, 500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [content, fetchedContent, handleSave]);

  return (
    <Box
      height="100%"
      style={{
        display: "flex",
        overflow: "hidden",
      }}
    >
      <TextArea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Your implementation plan will appear here..."
        className="min-h-full flex-1 resize-none rounded-none border-none bg-transparent font-mono text-sm shadow-none outline-none"
      />
    </Box>
  );
}
