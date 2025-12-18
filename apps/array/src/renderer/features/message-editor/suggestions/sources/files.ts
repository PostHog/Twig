import { trpcVanilla } from "@renderer/trpc/client";
import type { MentionItem } from "@shared/types";
import { useMessageEditorStore } from "../../stores/messageEditorStore";
import type { FileSuggestionItem } from "../../types";
import { SuggestionSource } from "../suggestionRenderer";

export class FileSource extends SuggestionSource<FileSuggestionItem> {
  readonly trigger = "@";
  readonly type = "file" as const;

  private static readonly LIMIT = 10;

  async getItems(query: string): Promise<FileSuggestionItem[]> {
    const repoPath =
      useMessageEditorStore.getState().contexts[this.sessionId]?.repoPath;
    if (!repoPath) {
      throw new Error("No repository selected");
    }

    const results = await trpcVanilla.fs.listRepoFiles.query({
      repoPath,
      query,
      limit: FileSource.LIMIT,
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

  onSelect(
    item: FileSuggestionItem,
    command: (attrs: Record<string, unknown>) => void,
  ): void {
    command({
      id: item.path,
      label: item.path.split("/").pop() || item.path,
      type: "file",
    });
  }
}
