import { z } from "zod";

// UI events emitted from main to renderer
export const UIServiceEvent = {
  OpenSettings: "open-settings",
  NewTask: "new-task",
  ResetLayout: "reset-layout",
  ClearStorage: "clear-storage",
} as const;

export interface UIServiceEvents {
  [UIServiceEvent.OpenSettings]: undefined;
  [UIServiceEvent.NewTask]: undefined;
  [UIServiceEvent.ResetLayout]: undefined;
  [UIServiceEvent.ClearStorage]: undefined;
}

// No input needed for subscriptions - they're global events
export const uiEventSubscriptionInput = z.object({}).optional();
