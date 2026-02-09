import { useAuthStore } from "@features/auth/stores/authStore";
import { useGitQueries } from "@features/git-interaction/hooks/useGitQueries";
import { computeGitInteractionState } from "@features/git-interaction/state/gitInteractionLogic";
import {
  type GitInteractionStore,
  useGitInteractionStore,
} from "@features/git-interaction/state/gitInteractionStore";
import type {
  CommitNextStep,
  GitMenuAction,
  GitMenuActionId,
} from "@features/git-interaction/types";
import { track } from "@renderer/lib/analytics";
import { logger } from "@renderer/lib/logger";
import { trpcVanilla } from "@renderer/trpc";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { ANALYTICS_EVENTS } from "@/types/analytics";

const log = logger.scope("git-interaction");

export type { GitMenuAction, GitMenuActionId };

interface GitInteractionState {
  primaryAction: GitMenuAction;
  actions: GitMenuAction[];
  hasChanges: boolean;
  ahead: number;
  behind: number;
  currentBranch: string | null;
  defaultBranch: string | null;
  prBaseBranch: string | null;
  prHeadBranch: string | null;
  diffStats: { filesChanged: number; linesAdded: number; linesRemoved: number };
  prUrl: string | null;
  createPrDisabledReason: string | null;
  commitPrDisabledReason: string | null;
  commitPushDisabledReason: string | null;
  isLoading: boolean;
}

interface GitInteractionActions {
  openAction: (actionId: GitMenuActionId) => void;
  closeCommit: () => void;
  closePush: () => void;
  closePr: () => void;
  setCommitMessage: (value: string) => void;
  setCommitNextStep: (value: CommitNextStep) => void;
  setPrTitle: (value: string) => void;
  setPrBody: (value: string) => void;
  runCommit: () => Promise<void>;
  runPush: () => Promise<void>;
  runPr: () => Promise<void>;
  generateCommitMessage: () => Promise<void>;
}

function trackGitAction(taskId: string, actionType: string, success: boolean) {
  track(ANALYTICS_EVENTS.GIT_ACTION_EXECUTED, {
    action_type: actionType as
      | "commit"
      | "push"
      | "sync"
      | "publish"
      | "create-pr"
      | "view-pr"
      | "update-pr",
    success,
    task_id: taskId,
  });
}

export function useGitInteraction(
  taskId: string,
  repoPath?: string,
): {
  state: GitInteractionState;
  modals: GitInteractionStore;
  actions: GitInteractionActions;
} {
  const queryClient = useQueryClient();
  const store = useGitInteractionStore();
  const { actions: modal } = store;

  const git = useGitQueries(repoPath);

  const computed = useMemo(
    () =>
      computeGitInteractionState({
        repoPath,
        isRepo: git.isRepo,
        isRepoLoading: git.isRepoLoading,
        hasChanges: git.hasChanges,
        ahead: git.ahead,
        behind: git.behind,
        hasRemote: git.hasRemote,
        currentBranch: git.currentBranch,
        defaultBranch: git.defaultBranch,
        ghStatus: git.ghStatus ?? null,
        repoInfo: git.repoInfo ?? null,
        prStatus: git.prStatus ?? null,
      }),
    [
      repoPath,
      git.isRepo,
      git.isRepoLoading,
      git.hasChanges,
      git.ahead,
      git.behind,
      git.hasRemote,
      git.currentBranch,
      git.defaultBranch,
      git.ghStatus,
      git.repoInfo,
      git.prStatus,
    ],
  );

  const invalidate = (...keys: string[]) =>
    Promise.all(
      keys.map((k) =>
        queryClient.invalidateQueries({ queryKey: [k, repoPath] }),
      ),
    );

  const getDefaultPrTitle = () => "";
  const getDefaultPrBody = () => "";

  const openAction = (id: GitMenuActionId) => {
    const actionMap: Record<GitMenuActionId, () => void> = {
      commit: () => modal.openCommit("commit"),
      push: () => modal.openPush("push"),
      sync: () => modal.openPush("sync"),
      publish: () => modal.openPush("publish"),
      "view-pr": () => viewPr(),
      "create-pr": () => modal.openPr(getDefaultPrTitle(), getDefaultPrBody()),
    };
    actionMap[id]();
  };

  const viewPr = async () => {
    if (!repoPath) return;
    const result = await trpcVanilla.git.openPr.mutate({
      directoryPath: repoPath,
    });
    if (result.success && result.prUrl) {
      await trpcVanilla.os.openExternal.mutate({ url: result.prUrl });
    }
  };

  const runCommit = async () => {
    if (!repoPath) return;

    if (
      store.commitNextStep === "commit-pr" &&
      computed.commitPrDisabledReason
    ) {
      modal.setCommitError(computed.commitPrDisabledReason);
      return;
    }

    if (
      store.commitNextStep === "commit-push" &&
      computed.commitPushDisabledReason
    ) {
      modal.setCommitError(computed.commitPushDisabledReason);
      return;
    }

    modal.setIsSubmitting(true);
    modal.setCommitError(null);

    let message = store.commitMessage.trim();

    if (!message) {
      const authState = useAuthStore.getState();
      const apiKey = authState.oauthAccessToken;
      const cloudRegion = authState.cloudRegion;

      if (!apiKey || !cloudRegion) {
        modal.setCommitError(
          "Authentication required to generate commit message.",
        );
        modal.setIsSubmitting(false);
        return;
      }

      const apiHost =
        cloudRegion === "eu"
          ? "https://eu.posthog.com"
          : "https://us.posthog.com";

      try {
        const generated = await trpcVanilla.git.generateCommitMessage.mutate({
          directoryPath: repoPath,
          credentials: { apiKey, apiHost },
        });

        if (!generated.message) {
          modal.setCommitError(
            "No changes detected to generate a commit message.",
          );
          modal.setIsSubmitting(false);
          return;
        }

        message = generated.message;
        modal.setCommitMessage(message);
      } catch (error) {
        log.error("Failed to generate commit message", error);
        modal.setCommitError(
          error instanceof Error
            ? error.message
            : "Failed to generate commit message.",
        );
        modal.setIsSubmitting(false);
        return;
      }
    }

    try {
      const result = await trpcVanilla.git.commit.mutate({
        directoryPath: repoPath,
        message,
      });

      if (!result.success) {
        trackGitAction(taskId, "commit", false);
        modal.setCommitError(result.message || "Commit failed.");
        return;
      }

      trackGitAction(taskId, "commit", true);
      await invalidate("changed-files-head", "git-sync-status");

      modal.setCommitMessage("");
      modal.closeCommit();

      const shouldPush =
        store.commitNextStep === "commit-push" ||
        store.commitNextStep === "commit-pr";
      if (shouldPush) {
        if (store.commitNextStep === "commit-pr" && !git.prStatus?.prExists) {
          modal.setOpenPrAfterPush(true);
        }
        modal.openPush(git.hasRemote ? "push" : "publish");
      }
    } finally {
      modal.setIsSubmitting(false);
    }
  };

  const runPush = async () => {
    if (!repoPath) return;

    modal.setIsSubmitting(true);
    modal.setPushError(null);

    try {
      const pushFn =
        store.pushMode === "sync"
          ? trpcVanilla.git.sync
          : store.pushMode === "publish"
            ? trpcVanilla.git.publish
            : trpcVanilla.git.push;

      const result = await pushFn.mutate({ directoryPath: repoPath });

      if (!result.success) {
        const message =
          "message" in result
            ? result.message
            : `Pull: ${result.pullMessage}, Push: ${result.pushMessage}`;
        trackGitAction(taskId, store.pushMode, false);
        modal.setPushError(message || "Push failed.");
        modal.setPushState("error");
        return;
      }

      trackGitAction(taskId, store.pushMode, true);
      await invalidate("git-sync-status");
      modal.setPushState("success");

      if (store.openPrAfterPush) {
        modal.closePush();
        modal.openPr(getDefaultPrTitle(), getDefaultPrBody());
        modal.setOpenPrAfterPush(false);
      }
    } finally {
      modal.setIsSubmitting(false);
    }
  };

  const runPr = async () => {
    if (!repoPath) return;

    const title = store.prTitle.trim();
    const body = store.prBody.trim();

    if (!title) {
      modal.setPrError("PR title is required.");
      return;
    }

    modal.setIsSubmitting(true);
    modal.setPrError(null);

    try {
      if (!git.hasRemote || git.ahead > 0) {
        const pushFn = git.hasRemote
          ? trpcVanilla.git.push
          : trpcVanilla.git.publish;
        const pushResult = await pushFn.mutate({ directoryPath: repoPath });

        if (!pushResult.success) {
          trackGitAction(taskId, "create-pr", false);
          modal.setPrError(
            pushResult.message || "Failed to push before creating PR.",
          );
          return;
        }
        await invalidate("git-sync-status");
      }

      const result = await trpcVanilla.git.createPr.mutate({
        directoryPath: repoPath,
        title,
        body,
      });

      if (!result.success || !result.prUrl) {
        trackGitAction(taskId, "create-pr", false);
        modal.setPrError(result.message || "Unable to create PR.");
        return;
      }

      trackGitAction(taskId, "create-pr", true);
      track(ANALYTICS_EVENTS.PR_CREATED, { task_id: taskId, success: true });
      await invalidate("git-pr-status");
      await trpcVanilla.os.openExternal.mutate({ url: result.prUrl });
      modal.closePr();
    } finally {
      modal.setIsSubmitting(false);
    }
  };

  const generateCommitMessage = async () => {
    if (!repoPath) return;

    const authState = useAuthStore.getState();
    const apiKey = authState.oauthAccessToken;
    const cloudRegion = authState.cloudRegion;

    if (!apiKey || !cloudRegion) {
      modal.setCommitError(
        "Authentication required to generate commit message.",
      );
      return;
    }

    const apiHost =
      cloudRegion === "eu"
        ? "https://eu.posthog.com"
        : "https://us.posthog.com";

    modal.setIsGeneratingCommitMessage(true);
    modal.setCommitError(null);

    try {
      const result = await trpcVanilla.git.generateCommitMessage.mutate({
        directoryPath: repoPath,
        credentials: { apiKey, apiHost },
      });

      if (result.message) {
        modal.setCommitMessage(result.message);
      } else {
        modal.setCommitError(
          "No changes detected to generate a commit message.",
        );
      }
    } catch (error) {
      log.error("Failed to generate commit message", error);
      modal.setCommitError(
        error instanceof Error
          ? error.message
          : "Failed to generate commit message.",
      );
    } finally {
      modal.setIsGeneratingCommitMessage(false);
    }
  };

  return {
    state: {
      primaryAction: computed.primaryAction,
      actions: computed.actions,
      hasChanges: git.hasChanges,
      ahead: git.ahead,
      behind: git.behind,
      currentBranch: git.currentBranch,
      defaultBranch: git.defaultBranch,
      prBaseBranch: computed.prBaseBranch,
      prHeadBranch: computed.prHeadBranch,
      diffStats: git.diffStats,
      prUrl: computed.prUrl,
      createPrDisabledReason: computed.createPrDisabledReason,
      commitPrDisabledReason: computed.commitPrDisabledReason,
      commitPushDisabledReason: computed.commitPushDisabledReason,
      isLoading: git.isLoading,
    },
    modals: store,
    actions: {
      openAction,
      closeCommit: modal.closeCommit,
      closePush: modal.closePush,
      closePr: modal.closePr,
      setCommitMessage: modal.setCommitMessage,
      setCommitNextStep: modal.setCommitNextStep,
      setPrTitle: modal.setPrTitle,
      setPrBody: modal.setPrBody,
      runCommit,
      runPush,
      runPr,
      generateCommitMessage,
    },
  };
}
