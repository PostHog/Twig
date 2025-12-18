import type { AvailableCommand } from "@agentclientprotocol/sdk";
import type { Editor } from "@tiptap/core";
import Fuse, { type IFuseOptions } from "fuse.js";
import { useMessageEditorStore } from "../../stores/messageEditorStore";
import type { CommandSuggestionItem } from "../../types";
import { SuggestionSource } from "../suggestionRenderer";

export class CommandSource extends SuggestionSource<CommandSuggestionItem> {
  readonly trigger = "/";
  readonly type = "command" as const;
  override readonly allowSpaces = false;

  private static readonly LIMIT = 10;
  private static readonly FUSE_OPTIONS: IFuseOptions<AvailableCommand> = {
    keys: [
      { name: "name", weight: 0.7 },
      { name: "description", weight: 0.3 },
    ],
    threshold: 0.4,
    includeScore: true,
  };

  private search(
    commands: AvailableCommand[],
    query: string,
  ): AvailableCommand[] {
    if (!query.trim()) {
      return commands.slice(0, CommandSource.LIMIT);
    }

    const fuse = new Fuse(commands, CommandSource.FUSE_OPTIONS);
    const results = fuse.search(query, { limit: CommandSource.LIMIT * 2 });

    const lowerQuery = query.toLowerCase();
    results.sort((a, b) => {
      const aStartsWithQuery = a.item.name.toLowerCase().startsWith(lowerQuery);
      const bStartsWithQuery = b.item.name.toLowerCase().startsWith(lowerQuery);

      if (aStartsWithQuery && !bStartsWithQuery) return -1;
      if (!aStartsWithQuery && bStartsWithQuery) return 1;
      return (a.score ?? 0) - (b.score ?? 0);
    });

    return results.slice(0, CommandSource.LIMIT).map((result) => result.item);
  }

  getItems(query: string): CommandSuggestionItem[] {
    const store = useMessageEditorStore.getState();
    const commands = store.commands[this.sessionId] ?? [];
    const filtered = this.search(commands, query);

    return filtered.map((cmd) => ({
      id: cmd.name,
      label: `/${cmd.name}`,
      description: cmd.description,
      command: cmd,
    }));
  }

  onSelect(
    item: CommandSuggestionItem,
    command: (attrs: Record<string, unknown>) => void,
    editor: Editor,
  ): void {
    if (item.command.input?.hint) {
      command({ id: item.command.name, label: item.command.name });
    } else {
      editor.commands.clearContent();
      this.options.onSubmit?.(`/${item.command.name}`);
    }
  }
}
