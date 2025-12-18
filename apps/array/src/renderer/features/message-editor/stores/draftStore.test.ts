import { describe, expect, it } from "vitest";
import { OTHER_SESSION_ID, TEST_SESSION_ID } from "../test/constants";
import { createContent } from "../test/fixtures";
import { setupDraftTests } from "../test/helpers";
import { useDraftStore } from "./draftStore";

const getActions = () => useDraftStore.getState().actions;

const MOCK_COMMANDS = [{ name: "help", description: "Get help" }];

describe("draftStore", () => {
  setupDraftTests();

  describe("drafts", () => {
    it("sets and gets draft", () => {
      const content = createContent("hello");

      getActions().setDraft(TEST_SESSION_ID, content);

      expect(getActions().getDraft(TEST_SESSION_ID)).toEqual(content);
    });

    it("returns null for non-existent draft", () => {
      expect(getActions().getDraft("non-existent")).toBeNull();
    });

    it("clears draft when set to null", () => {
      getActions().setDraft(TEST_SESSION_ID, createContent("hello"));
      getActions().setDraft(TEST_SESSION_ID, null);

      expect(getActions().getDraft(TEST_SESSION_ID)).toBeNull();
    });

    it("maintains separate drafts per session", () => {
      const content1 = createContent("one");
      const content2 = createContent("two");

      getActions().setDraft(TEST_SESSION_ID, content1);
      getActions().setDraft(OTHER_SESSION_ID, content2);

      expect(getActions().getDraft(TEST_SESSION_ID)).toEqual(content1);
      expect(getActions().getDraft(OTHER_SESSION_ID)).toEqual(content2);
    });
  });

  describe("contexts", () => {
    it("sets and gets context", () => {
      getActions().setContext(TEST_SESSION_ID, {
        taskId: "task-1",
        repoPath: "/path/to/repo",
      });

      const context = getActions().getContext(TEST_SESSION_ID);
      expect(context?.taskId).toBe("task-1");
      expect(context?.repoPath).toBe("/path/to/repo");
    });

    it("returns null for non-existent context", () => {
      expect(getActions().getContext("non-existent")).toBeNull();
    });

    it("merges partial context updates", () => {
      getActions().setContext(TEST_SESSION_ID, { taskId: "task-1" });
      getActions().setContext(TEST_SESSION_ID, { repoPath: "/path" });

      const context = getActions().getContext(TEST_SESSION_ID);
      expect(context?.taskId).toBe("task-1");
      expect(context?.repoPath).toBe("/path");
    });

    it("removes context", () => {
      getActions().setContext(TEST_SESSION_ID, { taskId: "task-1" });
      getActions().removeContext(TEST_SESSION_ID);

      expect(getActions().getContext(TEST_SESSION_ID)).toBeNull();
    });

    it("sets default values for boolean fields", () => {
      getActions().setContext(TEST_SESSION_ID, {});

      const context = getActions().getContext(TEST_SESSION_ID);
      expect(context?.disabled).toBe(false);
      expect(context?.isLoading).toBe(false);
      expect(context?.isCloud).toBe(false);
    });
  });

  describe("commands", () => {
    it("sets and gets commands", () => {
      getActions().setCommands(TEST_SESSION_ID, MOCK_COMMANDS);

      expect(getActions().getCommands(TEST_SESSION_ID)).toEqual(MOCK_COMMANDS);
    });

    it("returns empty array for non-existent commands", () => {
      expect(getActions().getCommands("non-existent")).toEqual([]);
    });

    it("clears commands", () => {
      getActions().setCommands(TEST_SESSION_ID, MOCK_COMMANDS);
      getActions().clearCommands(TEST_SESSION_ID);

      expect(getActions().getCommands(TEST_SESSION_ID)).toEqual([]);
    });
  });

  describe("hydration", () => {
    it("tracks hydration state", () => {
      // Reset to false for this test
      useDraftStore.setState({ _hasHydrated: false });
      expect(useDraftStore.getState()._hasHydrated).toBe(false);

      getActions().setHasHydrated(true);

      expect(useDraftStore.getState()._hasHydrated).toBe(true);
    });
  });
});
