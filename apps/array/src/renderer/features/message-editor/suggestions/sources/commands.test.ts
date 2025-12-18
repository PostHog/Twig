import type { AvailableCommand } from "@agentclientprotocol/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMessageEditorStore } from "../../stores/messageEditorStore";
import { createMockEditor, setupSuggestionTests } from "../../test/helpers";
import type { CommandSuggestionItem } from "../../types";
import { CommandSource } from "./commands";

const SESSION_ID = "session-1";

const getActions = () => useMessageEditorStore.getState().actions;

const MOCK_COMMANDS: AvailableCommand[] = [
  { name: "help", description: "Show help information" },
  { name: "clear", description: "Clear the screen" },
  { name: "history", description: "Show command history" },
  { name: "hello", description: "Say hello" },
  { name: "exit", description: "Exit the application" },
];

function setupCommands(commands = MOCK_COMMANDS) {
  getActions().setCommands(SESSION_ID, commands);
}

function createCommandItem(
  name: string,
  options: { hasInputHint?: boolean; description?: string } = {},
): CommandSuggestionItem {
  return {
    id: name,
    label: `/${name}`,
    command: {
      name,
      description: options.description ?? `Description for ${name}`,
      ...(options.hasInputHint && { input: { hint: "Enter query" } }),
    },
  };
}

describe("CommandSource", () => {
  setupSuggestionTests();

  describe("properties", () => {
    it("has correct trigger and type", () => {
      const source = new CommandSource(SESSION_ID);

      expect(source.trigger).toBe("/");
      expect(source.type).toBe("command");
      expect(source.allowSpaces).toBe(false);
    });
  });

  describe("getItems", () => {
    let source: CommandSource;

    beforeEach(() => {
      source = new CommandSource(SESSION_ID);
    });

    it("returns empty array when no commands set", () => {
      const items = source.getItems("test");

      expect(items).toEqual([]);
    });

    describe("with commands", () => {
      beforeEach(() => {
        setupCommands();
      });

      it("returns all commands when query is empty", () => {
        const items = source.getItems("");

        expect(items).toHaveLength(5);
        expect(items.map((i) => i.id)).toEqual([
          "help",
          "clear",
          "history",
          "hello",
          "exit",
        ]);
      });

      it("returns all commands when query is whitespace", () => {
        const items = source.getItems("   ");

        expect(items).toHaveLength(5);
      });

      it("formats command items correctly", () => {
        const items = source.getItems("");

        expect(items[0]).toMatchObject({
          id: "help",
          label: "/help",
          description: "Show help information",
        });
      });

      it("filters commands by name prefix", () => {
        const items = source.getItems("hel");
        const topTwo = items.slice(0, 2).map((i) => i.id);

        expect(topTwo).toContain("help");
        expect(topTwo).toContain("hello");
        expect(topTwo).toHaveLength(2);
      });

      it("searches description as well as name", () => {
        const items = source.getItems("screen");

        expect(items).toHaveLength(1);
        expect(items[0].id).toBe("clear");
      });

      it("matches case-insensitively", () => {
        const items = source.getItems("HELP");

        expect(items[0].id).toBe("help");
      });

      it("uses fuzzy matching", () => {
        const items = source.getItems("hlp");

        expect(items[0].id).toBe("help");
      });
    });
  });

  describe("onSelect", () => {
    describe("when command has input hint", () => {
      it("inserts command as mention", () => {
        const source = new CommandSource(SESSION_ID);
        const insertMention = vi.fn();
        const editor = createMockEditor();
        const item = createCommandItem("search", { hasInputHint: true });

        source.onSelect(item, insertMention, editor as never);

        expect(insertMention).toHaveBeenCalledWith({
          id: "search",
          label: "search",
        });
      });
    });

    describe("when command has no input hint", () => {
      it("clears editor and submits command", () => {
        const onSubmit = vi.fn();
        const source = new CommandSource(SESSION_ID, { onSubmit });
        const insertMention = vi.fn();
        const editor = createMockEditor();
        const item = createCommandItem("help");

        source.onSelect(item, insertMention, editor as never);

        expect(editor.commands.clearContent).toHaveBeenCalled();
        expect(onSubmit).toHaveBeenCalledWith("/help");
        expect(insertMention).not.toHaveBeenCalled();
      });
    });
  });
});
