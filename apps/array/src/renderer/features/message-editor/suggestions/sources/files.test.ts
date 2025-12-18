import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMessageEditorStore } from "../../stores/messageEditorStore";
import { setupSuggestionTests } from "../../test/helpers";
import { FileSource } from "./files";

const getActions = () => useMessageEditorStore.getState().actions;

vi.mock("@renderer/trpc/client", () => ({
  trpcVanilla: {
    fs: {
      listRepoFiles: {
        query: vi.fn(),
      },
    },
  },
}));

import { trpcVanilla } from "@renderer/trpc/client";

const mockQuery = trpcVanilla.fs.listRepoFiles.query as ReturnType<
  typeof vi.fn
>;

describe("FileSource", () => {
  setupSuggestionTests();

  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe("properties", () => {
    it("has @ trigger", () => {
      const source = new FileSource("session-1");

      expect(source.trigger).toBe("@");
      expect(source.type).toBe("file");
      expect(source.allowSpaces).toBeUndefined();
    });
  });

  describe("getItems", () => {
    it("throws when no repoPath", async () => {
      const source = new FileSource("session-1");

      await expect(source.getItems("test")).rejects.toThrow(
        "No repository selected",
      );
    });

    it("fetches files from trpc", async () => {
      act(() => {
        getActions().setContext("session-1", { repoPath: "/path/to/repo" });
      });

      mockQuery.mockResolvedValue([
        { path: "src/index.ts" },
        { path: "src/utils.ts" },
      ]);

      const source = new FileSource("session-1");
      const items = await source.getItems("index");

      expect(mockQuery).toHaveBeenCalledWith({
        repoPath: "/path/to/repo",
        query: "index",
        limit: 10,
      });
      expect(items).toHaveLength(2);
      expect(items[0]).toEqual({
        id: "src/index.ts",
        label: "src/index.ts",
        path: "src/index.ts",
      });
    });

    it("returns default files when query is empty", async () => {
      act(() => {
        getActions().setContext("session-1", { repoPath: "/path/to/repo" });
      });

      mockQuery.mockResolvedValue([
        { path: "README.md" },
        { path: "package.json" },
        { path: "src/index.ts" },
      ]);

      const source = new FileSource("session-1");
      const items = await source.getItems("");

      expect(mockQuery).toHaveBeenCalledWith({
        repoPath: "/path/to/repo",
        query: "",
        limit: 10,
      });
      expect(items).toHaveLength(3);
    });

    it("filters out items without path", async () => {
      act(() => {
        getActions().setContext("session-1", { repoPath: "/path/to/repo" });
      });

      mockQuery.mockResolvedValue([
        { path: "src/index.ts" },
        { name: "no-path" },
        { path: "" },
        { path: "src/utils.ts" },
      ]);

      const source = new FileSource("session-1");
      const items = await source.getItems("");

      expect(items).toHaveLength(2);
      expect(items.map((i) => i.path)).toEqual([
        "src/index.ts",
        "src/utils.ts",
      ]);
    });

    it("throws on network error", async () => {
      act(() => {
        getActions().setContext("session-1", { repoPath: "/path/to/repo" });
      });

      mockQuery.mockRejectedValue(new Error("Network error"));

      const source = new FileSource("session-1");

      await expect(source.getItems("test")).rejects.toThrow("Network error");
    });
  });

  describe("onSelect", () => {
    it("calls command with file path", () => {
      const command = vi.fn();
      const source = new FileSource("session-1");

      const item = {
        id: "src/components/Button.tsx",
        label: "src/components/Button.tsx",
        path: "src/components/Button.tsx",
      };

      source.onSelect(item, command);

      expect(command).toHaveBeenCalledWith({
        id: "src/components/Button.tsx",
        label: "Button.tsx",
        type: "file",
      });
    });

    it("uses full path as label when no filename", () => {
      const command = vi.fn();
      const source = new FileSource("session-1");

      const item = {
        id: "Makefile",
        label: "Makefile",
        path: "Makefile",
      };

      source.onSelect(item, command);

      expect(command).toHaveBeenCalledWith({
        id: "Makefile",
        label: "Makefile",
        type: "file",
      });
    });
  });
});
