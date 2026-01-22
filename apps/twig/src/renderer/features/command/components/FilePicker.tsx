import { FileIcon } from "@components/ui/FileIcon";
import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { Popover, Text } from "@radix-ui/themes";
import { trpcReact } from "@renderer/trpc/client";
import { byLengthAsc, Fzf } from "fzf";
import { useCallback, useMemo, useState } from "react";
import { Command } from "./Command";
import "./FilePicker.css";

interface FilePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  repoPath: string | undefined;
}

interface FileItem {
  path: string;
  name: string;
  dir: string;
}

const FILE_DISPLAY_LIMIT = 20;

function searchFiles(
  fzf: Fzf<FileItem[]>,
  files: FileItem[],
  query: string,
): FileItem[] {
  if (!query.trim()) {
    return files.slice(0, FILE_DISPLAY_LIMIT);
  }

  const results = fzf.find(query);
  return results.map((result) => result.item);
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

  const { data: allFiles } = trpcReact.fs.listRepoFiles.useQuery(
    { repoPath: repoPath ?? "" },
    { enabled: open && !!repoPath },
  );

  const fileItems: FileItem[] = useMemo(() => {
    if (!allFiles) return [];
    return allFiles
      .filter((file): file is typeof file & { path: string } => !!file.path)
      .map((file) => {
        const parts = file.path.split("/");
        const name = parts.pop() ?? file.path;
        const dir = parts.join("/");
        return { path: file.path, name, dir };
      });
  }, [allFiles]);

  const fzf = useMemo(
    () =>
      new Fzf(fileItems, {
        selector: (item) => `${item.name} ${item.path}`,
        limit: FILE_DISPLAY_LIMIT,
        tiebreakers: [byLengthAsc],
      }),
    [fileItems],
  );

  const displayedFiles = useMemo(() => {
    if (!searchQuery.trim() && recentFiles.length > 0) {
      const recentItems: FileItem[] = recentFiles.map((path) => {
        const parts = path.split("/");
        const name = parts.pop() ?? path;
        const dir = parts.join("/");
        return { path, name, dir };
      });
      return recentItems;
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
