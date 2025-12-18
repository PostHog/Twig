import type { AvailableCommand } from "@agentclientprotocol/sdk";
import { trpcVanilla } from "@renderer/trpc/client";
import type { MentionItem } from "@shared/types";
import Fuse, { type IFuseOptions } from "fuse.js";
import { useDraftStore } from "../stores/draftStore";
import type { CommandSuggestionItem, FileSuggestionItem } from "../types";

const FILE_LIMIT = 5;
const COMMAND_LIMIT = 5;

const FUSE_OPTIONS: IFuseOptions<AvailableCommand> = {
  keys: [
    { name: "name", weight: 0.7 },
    { name: "description", weight: 0.3 },
  ],
  threshold: 0.3,
  includeScore: true,
};

function searchCommands(
  commands: AvailableCommand[],
  query: string,
): AvailableCommand[] {
  if (!query.trim()) {
    return commands.slice(0, COMMAND_LIMIT);
  }

  const fuse = new Fuse(commands, FUSE_OPTIONS);
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

export async function getFileSuggestions(
  sessionId: string,
  query: string,
): Promise<FileSuggestionItem[]> {
  const repoPath = useDraftStore.getState().contexts[sessionId]?.repoPath;

  if (!repoPath) {
    return [];
  }

  const results = await trpcVanilla.fs.listRepoFiles.query({
    repoPath,
    query,
    limit: FILE_LIMIT,
  });

  return results
    .filter(
      (file: MentionItem): file is MentionItem & { path: string } =>
        !!file.path,
    )
    .map((file) => ({
      id: file.path,
      label: file.path,
      path: file.path,
    }));
}

export function getCommandSuggestions(
  sessionId: string,
  query: string,
): CommandSuggestionItem[] {
  const store = useDraftStore.getState();
  const taskId = store.contexts[sessionId]?.taskId;
  const commands = taskId ? (store.commands[taskId] ?? []) : [];
  const filtered = searchCommands(commands, query);

  return filtered.map((cmd) => ({
    id: cmd.name,
    label: cmd.name,
    description: cmd.description,
    command: cmd,
  }));
}
