import { FileIcon } from "@components/ui/FileIcon";
import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { pathToFileItem, searchFiles, useRepoFiles } from "@hooks/useRepoFiles";
import { Popover, Text } from "@radix-ui/themes";
import { useCallback, useMemo, useState } from "react";
import { Command } from "./Command";
import "./FilePicker.css";

interface FilePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  repoPath: string | undefined;
}

export function FilePicker({
  open,
  onOpenChange,
  taskId,
  repoPath,
}: FilePickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const openFile = usePanelLayoutStore((state) => state.openFile);
  const recentFiles = usePanelLayoutStore(
    (state) => state.taskLayouts[taskId]?.recentFiles ?? [],
  );

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      onOpenChange(isOpen);
      if (!isOpen) {
        setSearchQuery("");
      }
    },
    [onOpenChange],
  );

  const { files: fileItems, fzf } = useRepoFiles(repoPath, open);

  const displayedFiles = useMemo(() => {
    if (!searchQuery.trim() && recentFiles.length > 0) {
      return recentFiles.map(pathToFileItem);
    }
    return searchFiles(fzf, fileItems, searchQuery);
  }, [fzf, fileItems, searchQuery, recentFiles]);

  const resultsKey = useMemo(
    () => displayedFiles.map((f) => f.path).join(","),
    [displayedFiles],
  );

  const handleSelect = useCallback(
    (filePath: string) => {
      openFile(taskId, filePath, false);
      handleOpenChange(false);
    },
    [openFile, taskId, handleOpenChange],
  );

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger>
        <div
          style={{
            position: "fixed",
            top: "60px",
            left: "50%",
            width: "1px",
            height: "1px",
            opacity: 0,
            pointerEvents: "none",
          }}
        />
      </Popover.Trigger>
      <Popover.Content
        className="file-picker-popover"
        maxWidth="640px"
        style={{ padding: 0 }}
        side="bottom"
        align="center"
        sideOffset={0}
        onInteractOutside={() => handleOpenChange(false)}
        onEscapeKeyDown={(e) => e.stopPropagation()}
      >
        <Command.Root shouldFilter={false} label="File picker" key={resultsKey}>
          <Command.Input
            placeholder="Search files by name"
            autoFocus={true}
            value={searchQuery}
            onValueChange={setSearchQuery}
          />

          <Command.List>
            <Command.Empty>No files found.</Command.Empty>

            {displayedFiles.map((file) => (
              <Command.Item
                key={file.path}
                value={file.path}
                onSelect={() => handleSelect(file.path)}
              >
                <FileIcon filename={file.name} size={14} />
                <Text size="1" ml="2">
                  {file.name}
                </Text>
                {file.dir && (
                  <Text size="1" color="gray" ml="2">
                    {file.dir}
                  </Text>
                )}
              </Command.Item>
            ))}
          </Command.List>
        </Command.Root>
      </Popover.Content>
    </Popover.Root>
  );
}
