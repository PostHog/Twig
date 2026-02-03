import { z } from "zod";

export const isEnabledOutput = z.object({
  enabled: z.boolean(),
});

export const checkErrorCode = z.enum(["already_checking", "disabled"]);
export type CheckErrorCode = z.infer<typeof checkErrorCode>;

export const checkForUpdatesOutput = z.object({
  success: z.boolean(),
  errorMessage: z.string().optional(),
  errorCode: checkErrorCode.optional(),
});

export const installUpdateOutput = z.object({
  installed: z.boolean(),
});

export type IsEnabledOutput = z.infer<typeof isEnabledOutput>;

export type CheckForUpdatesOutput = z.infer<typeof checkForUpdatesOutput>;
export type InstallUpdateOutput = z.infer<typeof installUpdateOutput>;

export const UpdatesEvent = {
  Ready: "ready",
  Status: "status",
  CheckFromMenu: "check-from-menu",
} as const;

export type UpdatesStatusPayload = {
  checking: boolean;
  upToDate?: boolean;
  version?: string;
  error?: string;
};

export interface UpdatesEvents {
  [UpdatesEvent.Ready]: true;
  [UpdatesEvent.Status]: UpdatesStatusPayload;
  [UpdatesEvent.CheckFromMenu]: true;
}
