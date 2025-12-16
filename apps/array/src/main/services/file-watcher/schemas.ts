import { z } from "zod";

export const listDirectoryInput = z.object({
  dirPath: z.string(),
});

export const watcherInput = z.object({
  repoPath: z.string(),
});

const directoryEntry = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(["file", "directory"]),
});

export const listDirectoryOutput = z.array(directoryEntry);

export type ListDirectoryInput = z.infer<typeof listDirectoryInput>;
export type WatcherInput = z.infer<typeof watcherInput>;
export type DirectoryEntry = z.infer<typeof directoryEntry>;

export const FileWatcherEvent = {
  DirectoryChanged: "directory-changed",
  FileChanged: "file-changed",
  FileDeleted: "file-deleted",
  GitStateChanged: "git-state-changed",
} as const;

export interface FileWatcherEvents {
  [FileWatcherEvent.DirectoryChanged]: { repoPath: string; dirPath: string };
  [FileWatcherEvent.FileChanged]: { repoPath: string; filePath: string };
  [FileWatcherEvent.FileDeleted]: { repoPath: string; filePath: string };
  [FileWatcherEvent.GitStateChanged]: { repoPath: string };
}
