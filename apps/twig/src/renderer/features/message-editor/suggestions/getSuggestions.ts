import type { AvailableCommand } from "@agentclientprotocol/sdk";
import { getAvailableCommandsForTask } from "@features/sessions/stores/sessionStore";
import { trpcVanilla } from "@renderer/trpc/client";
import type { MentionItem } from "@shared/types";
import Fuse, { type IFuseOptions } from "fuse.js";
import { byLengthAsc, Fzf } from "fzf";
import { useDraftStore } from "../stores/draftStore";
import type { CommandSuggestionItem, FileSuggestionItem } from "../types";

const FILE_DISPLAY_LIMIT = 20;
const COMMAND_LIMIT = 5;

const COMMAND_FUSE_OPTIONS: IFuseOptions<AvailableCommand> = {
  keys: [
    { name: "name", weight: 0.7 },
    { name: "description", weight: 0.3 },
  ],
  threshold: 0.3,
  includeScore: true,
};

interface FileItem {
  path: string;
  name: string;
  dir: string;
}

function searchCommands(
  commands: AvailableCommand[],
  query: string,
): AvailableCommand[] {
  if (!query.trim()) {
    return commands.slice(0, COMMAND_LIMIT);
  }

  const fuse = new Fuse(commands, COMMAND_FUSE_OPTIONS);
  const results = fuse.search(query, { limit: COMMAND_LIMIT * 2 });

  const lowerQuery = query.toLowerCase();
  results.sort((a, b) => {
    const aStartsWithQuery = a.item.name.toLowerCase().startsWith(lowerQuery);
    const bStartsWithQuery = b.item.name.toLowerCase().startsWith(lowerQuery);

    if (aStartsWithQuery && !bStartsWithQuery) return -1;
    if (!aStartsWithQuery && bStartsWithQuery) return 1;
    return (a.score ?? 0) - (b.score ?? 0);
  });

  return results.slice(0, COMMAND_LIMIT).map((result) => result.item);
}

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

// Cache for file lists and fzf instances per repo
const fileCache = new Map<
  string,
  { files: FileItem[]; fzf: Fzf<FileItem[]>; timestamp: number }
>();
const CACHE_TTL = 30000; // 30 seconds

async function getFilesForRepo(repoPath: string): Promise<{
  files: FileItem[];
  fzf: Fzf<FileItem[]>;
}> {
  const cached = fileCache.get(repoPath);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return { files: cached.files, fzf: cached.fzf };
  }

  const results = await trpcVanilla.fs.listRepoFiles.query({ repoPath });

  const files: FileItem[] = results
    .filter(
      (file: MentionItem): file is MentionItem & { path: string } =>
        !!file.path,
    )
    .map((file) => {
      const parts = file.path.split("/");
      const name = parts.pop() ?? file.path;
      const dir = parts.join("/");
      return { path: file.path, name, dir };
    });

  const fzf = new Fzf(files, {
    selector: (item) => `${item.name} ${item.path}`,
    limit: FILE_DISPLAY_LIMIT,
    tiebreakers: [byLengthAsc],
  });

  fileCache.set(repoPath, { files, fzf, timestamp: Date.now() });
  return { files, fzf };
}

export async function getFileSuggestions(
  sessionId: string,
  query: string,
): Promise<FileSuggestionItem[]> {
  const repoPath = useDraftStore.getState().contexts[sessionId]?.repoPath;

  if (!repoPath) {
    return [];
  }

  const { files, fzf } = await getFilesForRepo(repoPath);
  const matched = searchFiles(fzf, files, query);

  return matched.map((file) => ({
    id: file.path,
    label: file.name,
    description: file.dir || undefined,
    path: file.path,
  }));
}

export function getCommandSuggestions(
  sessionId: string,
  query: string,
): CommandSuggestionItem[] {
  const taskId = useDraftStore.getState().contexts[sessionId]?.taskId;
  const commands = getAvailableCommandsForTask(taskId);
  const filtered = searchCommands(commands, query);

  return filtered.map((cmd) => ({
    id: cmd.name,
    label: cmd.name,
    description: cmd.description,
    command: cmd,
  }));
}
