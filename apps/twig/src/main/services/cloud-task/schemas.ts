import type { CloudTaskUpdatePayload, TaskRun } from "@shared/types.js";
import { z } from "zod";

export type { CloudTaskUpdatePayload };

// --- Terminal statuses ---

export const TERMINAL_STATUSES = ["completed", "failed", "cancelled"] as const;

// --- Events ---

export const CloudTaskEvent = {
  Update: "cloud-task-update",
} as const;

export interface CloudTaskEvents {
  [CloudTaskEvent.Update]: CloudTaskUpdatePayload;
}

export type TaskRunStatus = TaskRun["status"];

// --- tRPC Schemas ---

export const watchInput = z.object({
  taskId: z.string(),
  runId: z.string(),
  apiHost: z.string(),
  teamId: z.number(),
});

export type WatchInput = z.infer<typeof watchInput>;

export const unwatchInput = z.object({
  taskId: z.string(),
  runId: z.string(),
});

export const updateTokenInput = z.object({
  token: z.string(),
});

export const onUpdateInput = z.object({
  taskId: z.string(),
  runId: z.string(),
});
