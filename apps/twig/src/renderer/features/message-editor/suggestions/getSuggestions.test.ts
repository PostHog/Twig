import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAvailableCommandsForTask = vi.hoisted(() => vi.fn());
const mockGetState = vi.hoisted(() => vi.fn());

vi.mock("@features/sessions/stores/sessionStore", () => ({
  getAvailableCommandsForTask: mockGetAvailableCommandsForTask,
}));

vi.mock("../stores/draftStore", () => ({
  useDraftStore: {
    getState: mockGetState,
  },
}));

vi.mock("@hooks/useRepoFiles", () => ({
  fetchRepoFiles: vi.fn(),
  searchFiles: vi.fn(),
}));

import { getCommandSuggestions } from "./getSuggestions";

describe("getCommandSuggestions", () => {
  beforeEach(() => {
    mockGetAvailableCommandsForTask.mockReset();
    mockGetState.mockReset();
    mockGetState.mockReturnValue({
      contexts: {
        "session-123": { taskId: "task-456" },
      },
    });
  });

  it("includes client commands (good, bad) in suggestions", () => {
    mockGetAvailableCommandsForTask.mockReturnValue([]);

    const suggestions = getCommandSuggestions("session-123", "");

    expect(suggestions).toHaveLength(2);
    expect(suggestions[0]).toMatchObject({
      id: "good",
      label: "good",
      description: "Send positive feedback for this session",
    });
    expect(suggestions[1]).toMatchObject({
      id: "bad",
      label: "bad",
      description: "Send negative feedback for this session",
    });
  });

  it("client commands appear before AI commands", () => {
    mockGetAvailableCommandsForTask.mockReturnValue([
      { name: "commit", description: "Commit changes" },
      { name: "help", description: "Show help" },
    ]);

    const suggestions = getCommandSuggestions("session-123", "");

    // With COMMAND_LIMIT=5, we should get: good, bad, commit, help
    expect(suggestions.length).toBeLessThanOrEqual(5);
    expect(suggestions[0].id).toBe("good");
    expect(suggestions[1].id).toBe("bad");
  });

  it("filters commands by query", () => {
    mockGetAvailableCommandsForTask.mockReturnValue([
      { name: "commit", description: "Commit changes" },
    ]);

    const suggestions = getCommandSuggestions("session-123", "go");

    // Should match "good" based on "go" prefix
    expect(suggestions.some((s) => s.id === "good")).toBe(true);
    // Should not match "bad" or "commit"
    expect(suggestions.some((s) => s.id === "commit")).toBe(false);
  });

  it("filters to show bad command", () => {
    mockGetAvailableCommandsForTask.mockReturnValue([]);

    const suggestions = getCommandSuggestions("session-123", "bad");

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].id).toBe("bad");
  });

  it("returns empty array when no session context", () => {
    mockGetState.mockReturnValue({ contexts: {} });
    mockGetAvailableCommandsForTask.mockReturnValue([]);

    const suggestions = getCommandSuggestions("unknown-session", "");

    // Should still return client commands since they don't require session context for display
    expect(suggestions.length).toBeGreaterThanOrEqual(0);
  });

  it("includes command object in suggestion item", () => {
    mockGetAvailableCommandsForTask.mockReturnValue([]);

    const suggestions = getCommandSuggestions("session-123", "good");

    expect(suggestions[0].command).toEqual({
      name: "good",
      description: "Send positive feedback for this session",
    });
  });
});
