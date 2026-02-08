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

export const updateReadyStatusOutput = z.object({
  ready: z.boolean(),
  version: z.string().nullable(),
});

export type IsEnabledOutput = z.infer<typeof isEnabledOutput>;

export type CheckForUpdatesOutput = z.infer<typeof checkForUpdatesOutput>;
export type InstallUpdateOutput = z.infer<typeof installUpdateOutput>;
export type UpdateReadyStatusOutput = z.infer<typeof updateReadyStatusOutput>;

export const UpdatesEvent = {
  Ready: "ready",
  Status: "status",
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
}
