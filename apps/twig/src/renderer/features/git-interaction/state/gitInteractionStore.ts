import type {
  CommitNextStep,
  GitMenuActionId,
  PushMode,
  PushState,
} from "@features/git-interaction/types";
import { create } from "zustand";

export type { CommitNextStep, PushMode, PushState };

interface GitInteractionState {
  commitOpen: boolean;
  pushOpen: boolean;
  prOpen: boolean;
  branchOpen: boolean;
  commitMessage: string;
  commitNextStep: CommitNextStep;
  pushMode: PushMode;
  pushState: PushState;
  pushError: string | null;
  prTitle: string;
  prBody: string;
  prError: string | null;
  commitError: string | null;
  branchName: string;
  branchError: string | null;
  isSubmitting: boolean;
  openPrAfterPush: boolean;
  isGeneratingCommitMessage: boolean;
  isGeneratingPr: boolean;
}

interface GitInteractionActions {
  setCommitOpen: (open: boolean) => void;
  setPushOpen: (open: boolean) => void;
  setPrOpen: (open: boolean) => void;
  setBranchOpen: (open: boolean) => void;
  setCommitMessage: (value: string) => void;
  setCommitNextStep: (value: CommitNextStep) => void;
  setPushMode: (value: PushMode) => void;
  setPushState: (value: PushState) => void;
  setPushError: (value: string | null) => void;
  setPrTitle: (value: string) => void;
  setPrBody: (value: string) => void;
  setPrError: (value: string | null) => void;
  setCommitError: (value: string | null) => void;
  setBranchName: (value: string) => void;
  setBranchError: (value: string | null) => void;
  setIsSubmitting: (value: boolean) => void;
  setOpenPrAfterPush: (value: boolean) => void;
  setIsGeneratingCommitMessage: (value: boolean) => void;
  setIsGeneratingPr: (value: boolean) => void;

  openCommit: (nextStep: CommitNextStep) => void;
  openPush: (mode: PushMode) => void;
  openPr: (defaultTitle?: string, defaultBody?: string) => void;
  openBranch: () => void;
  closeCommit: () => void;
  closePush: () => void;
  closePr: () => void;
  closeBranch: () => void;
}

export interface GitInteractionStore extends GitInteractionState {
  actions: GitInteractionActions;
}

const initialState: GitInteractionState = {
  commitOpen: false,
  pushOpen: false,
  prOpen: false,
  branchOpen: false,
  commitMessage: "",
  commitNextStep: "commit",
  pushMode: "push",
  pushState: "idle",
  pushError: null,
  prTitle: "",
  prBody: "",
  prError: null,
  commitError: null,
  branchName: "",
  branchError: null,
  isSubmitting: false,
  openPrAfterPush: false,
  isGeneratingCommitMessage: false,
  isGeneratingPr: false,
};

export const useGitInteractionStore = create<GitInteractionStore>((set) => ({
  ...initialState,
  actions: {
    setCommitOpen: (open) => set({ commitOpen: open }),
    setPushOpen: (open) => set({ pushOpen: open }),
    setPrOpen: (open) => set({ prOpen: open }),
    setBranchOpen: (open) => set({ branchOpen: open }),
    setCommitMessage: (value) => set({ commitMessage: value }),
    setCommitNextStep: (value) => set({ commitNextStep: value }),
    setPushMode: (value) => set({ pushMode: value }),
    setPushState: (value) => set({ pushState: value }),
    setPushError: (value) => set({ pushError: value }),
    setPrTitle: (value) => set({ prTitle: value }),
    setPrBody: (value) => set({ prBody: value }),
    setPrError: (value) => set({ prError: value }),
    setCommitError: (value) => set({ commitError: value }),
    setBranchName: (value) => set({ branchName: value }),
    setBranchError: (value) => set({ branchError: value }),
    setIsSubmitting: (value) => set({ isSubmitting: value }),
    setOpenPrAfterPush: (value) => set({ openPrAfterPush: value }),
    setIsGeneratingCommitMessage: (value) =>
      set({ isGeneratingCommitMessage: value }),
    setIsGeneratingPr: (value) => set({ isGeneratingPr: value }),

    openCommit: (nextStep) =>
      set({ commitNextStep: nextStep, commitError: null, commitOpen: true }),
    openPush: (mode) =>
      set({
        pushMode: mode,
        pushState: "idle",
        pushError: null,
        pushOpen: true,
      }),
    openPr: (defaultTitle, defaultBody) =>
      set({
        prTitle: defaultTitle ?? "",
        prBody: defaultBody ?? "",
        prError: null,
        prOpen: true,
      }),
    openBranch: () =>
      set({ branchName: "", branchError: null, branchOpen: true }),
    closeCommit: () => set({ commitOpen: false, commitError: null }),
    closePush: () =>
      set({
        pushOpen: false,
        pushState: "idle",
        pushError: null,
        openPrAfterPush: false,
      }),
    closePr: () =>
      set({ prOpen: false, prError: null, prTitle: "", prBody: "" }),
    closeBranch: () =>
      set({ branchOpen: false, branchError: null, branchName: "" }),
  },
}));

export function getGitInteractionActionLabel(
  actionId: GitMenuActionId,
): string {
  switch (actionId) {
    case "commit":
      return "Commit";
    case "push":
      return "Push";
    case "sync":
      return "Sync";
    case "publish":
      return "Publish Branch";
    case "create-pr":
      return "Create PR";
    case "view-pr":
      return "View PR";
    case "branch-here":
      return "Branch here";
    default:
      return "Git Action";
  }
}
