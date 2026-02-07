export type GitMenuActionId =
  | "commit"
  | "push"
  | "sync"
  | "publish"
  | "create-pr"
  | "view-pr";

export interface GitMenuAction {
  id: GitMenuActionId;
  label: string;
  enabled: boolean;
  disabledReason: string | null;
}

export type CommitNextStep = "commit" | "commit-push" | "commit-pr";
export type PushMode = "push" | "sync" | "publish";
export type PushState = "idle" | "success" | "error";
