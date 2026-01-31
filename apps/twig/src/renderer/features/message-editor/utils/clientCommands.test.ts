import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTrack = vi.hoisted(() => vi.fn());
const mockGetSessionForTask = vi.hoisted(() => vi.fn());
const mockGetState = vi.hoisted(() => vi.fn());

vi.mock("@renderer/lib/analytics", () => ({
  track: mockTrack,
}));

vi.mock("@features/sessions/stores/sessionStore", () => ({
  getSessionForTask: mockGetSessionForTask,
}));

vi.mock("../stores/draftStore", () => ({
  useDraftStore: {
    getState: mockGetState,
  },
}));

import { ANALYTICS_EVENTS } from "@/types/analytics";
import { executeClientCommand, isClientCommand } from "./clientCommands";

describe("clientCommands", () => {
  beforeEach(() => {
    mockTrack.mockReset();
    mockGetSessionForTask.mockReset();
    mockGetState.mockReset();
  });

  describe("isClientCommand", () => {
    it("returns true for 'good' command", () => {
      expect(isClientCommand("good")).toBe(true);
    });

    it("returns true for 'bad' command", () => {
      expect(isClientCommand("bad")).toBe(true);
    });

    it("returns false for unknown commands", () => {
      expect(isClientCommand("commit")).toBe(false);
      expect(isClientCommand("help")).toBe(false);
      expect(isClientCommand("unknown")).toBe(false);
    });
  });

  describe("executeClientCommand", () => {
    it("tracks feedback for 'good' command with local session", () => {
      mockGetState.mockReturnValue({
        contexts: {
          "session-123": { taskId: "task-456" },
        },
      });
      mockGetSessionForTask.mockReturnValue({
        taskId: "task-456",
        taskRunId: "run-789",
        isCloud: false,
        model: "claude-sonnet-4-20250514",
      });

      executeClientCommand("good", "session-123");

      expect(mockTrack).toHaveBeenCalledWith(ANALYTICS_EVENTS.SESSION_FEEDBACK, {
        task_id: "task-456",
        session_id: "run-789",
        execution_type: "local",
        model: "claude-sonnet-4-20250514",
        feedback_type: "good",
      });
    });

    it("tracks feedback for 'bad' command with cloud session", () => {
      mockGetState.mockReturnValue({
        contexts: {
          "session-123": { taskId: "task-456" },
        },
      });
      mockGetSessionForTask.mockReturnValue({
        taskId: "task-456",
        taskRunId: "run-789",
        isCloud: true,
        model: "claude-opus-4-20250514",
      });

      executeClientCommand("bad", "session-123");

      expect(mockTrack).toHaveBeenCalledWith(ANALYTICS_EVENTS.SESSION_FEEDBACK, {
        task_id: "task-456",
        session_id: "run-789",
        execution_type: "cloud",
        model: "claude-opus-4-20250514",
        feedback_type: "bad",
      });
    });

    it("does not track when session is not found", () => {
      mockGetState.mockReturnValue({
        contexts: {
          "session-123": { taskId: "task-456" },
        },
      });
      mockGetSessionForTask.mockReturnValue(undefined);

      executeClientCommand("good", "session-123");

      expect(mockTrack).not.toHaveBeenCalled();
    });

    it("does not track when context is not found", () => {
      mockGetState.mockReturnValue({
        contexts: {},
      });

      executeClientCommand("good", "session-123");

      expect(mockGetSessionForTask).toHaveBeenCalledWith(undefined);
      expect(mockTrack).not.toHaveBeenCalled();
    });

    it("handles session without model", () => {
      mockGetState.mockReturnValue({
        contexts: {
          "session-123": { taskId: "task-456" },
        },
      });
      mockGetSessionForTask.mockReturnValue({
        taskId: "task-456",
        taskRunId: "run-789",
        isCloud: false,
        model: undefined,
      });

      executeClientCommand("good", "session-123");

      expect(mockTrack).toHaveBeenCalledWith(ANALYTICS_EVENTS.SESSION_FEEDBACK, {
        task_id: "task-456",
        session_id: "run-789",
        execution_type: "local",
        model: undefined,
        feedback_type: "good",
      });
    });

    it("does nothing for unknown commands", () => {
      executeClientCommand("unknown", "session-123");

      expect(mockTrack).not.toHaveBeenCalled();
    });
  });
});
