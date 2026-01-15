import { assignFiles, listUnassigned } from "@array/core/commands/assign";
import {
  daemonStart,
  daemonStatus,
  daemonStop,
} from "@array/core/commands/daemon";
import { enter } from "@array/core/commands/enter";
import { exit } from "@array/core/commands/exit";
import {
  focusAdd,
  focusAll,
  focusEdit,
  focusNone,
  focusOnly,
  focusRemove,
  focusStatus,
} from "@array/core/commands/focus";
import {
  listConflicts,
  resolveConflict,
  resolveConflictsBatch,
} from "@array/core/commands/focus-resolve";
// Import @array/core commands
import { workspaceAdd } from "@array/core/commands/workspace-add";
import { workspaceList } from "@array/core/commands/workspace-list";
import { workspaceRemove } from "@array/core/commands/workspace-remove";
import { workspaceStatus } from "@array/core/commands/workspace-status";
import { submitWorkspace } from "@array/core/commands/workspace-submit";
import { getCurrentBranch, isDetachedHead } from "@array/core/git/head";
import { z } from "zod";
import { publicProcedure, router } from "../trpc.js";

// Input schemas
const cwdInput = z.object({ cwd: z.string() });
const workspaceNameInput = z.object({ name: z.string(), cwd: z.string() });
const workspaceAddInput = z.object({
  name: z.string(),
  cwd: z.string(),
  revision: z.string().optional(),
});
const workspacesInput = z.object({
  workspaces: z.array(z.string()),
  cwd: z.string(),
});
const workspaceStatusInput = z.object({
  workspace: z.string().optional(),
  cwd: z.string(),
});
const assignFilesInput = z.object({
  patterns: z.array(z.string()),
  targetWorkspace: z.string(),
  cwd: z.string(),
});
const resolveConflictInput = z.object({
  file: z.string(),
  keepWorkspace: z.string(),
  cwd: z.string(),
});
const resolveConflictsBatchInput = z.object({
  choices: z.record(z.string(), z.string()), // file -> workspace
  cwd: z.string(),
});
const workspaceSubmitInput = z.object({
  workspace: z.string(),
  cwd: z.string(),
  draft: z.boolean().optional(),
  message: z.string().optional(),
});

// Helper to unwrap Result type
function unwrapResult<T>(
  result: { ok: true; value: T } | { ok: false; error: { message: string } },
): T {
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
}

export const arrRouter = router({
  // Workspace management
  workspaceAdd: publicProcedure
    .input(workspaceAddInput)
    .mutation(async ({ input }) => {
      const result = await workspaceAdd(input.name, input.cwd, {
        revision: input.revision,
      });
      return unwrapResult(result);
    }),

  workspaceRemove: publicProcedure
    .input(workspaceNameInput)
    .mutation(async ({ input }) => {
      const result = await workspaceRemove(input.name, input.cwd);
      return unwrapResult(result);
    }),

  workspaceList: publicProcedure.input(cwdInput).query(async () => {
    const result = await workspaceList();
    return unwrapResult(result);
  }),

  workspaceStatus: publicProcedure
    .input(workspaceStatusInput)
    .query(async ({ input }) => {
      const result = await workspaceStatus(input.workspace, input.cwd);
      return unwrapResult(result);
    }),

  // Focus management
  focusStatus: publicProcedure.input(cwdInput).query(async ({ input }) => {
    const result = await focusStatus(input.cwd);
    return unwrapResult(result);
  }),

  focusAdd: publicProcedure
    .input(workspacesInput)
    .mutation(async ({ input }) => {
      const result = await focusAdd(input.workspaces, input.cwd);
      return unwrapResult(result);
    }),

  focusRemove: publicProcedure
    .input(workspacesInput)
    .mutation(async ({ input }) => {
      const result = await focusRemove(input.workspaces, input.cwd);
      return unwrapResult(result);
    }),

  focusOnly: publicProcedure
    .input(workspaceNameInput)
    .mutation(async ({ input }) => {
      const result = await focusOnly(input.name, input.cwd);
      return unwrapResult(result);
    }),

  focusAll: publicProcedure.input(cwdInput).mutation(async ({ input }) => {
    const result = await focusAll(input.cwd);
    return unwrapResult(result);
  }),

  focusNone: publicProcedure.input(cwdInput).mutation(async ({ input }) => {
    const result = await focusNone(input.cwd);
    return unwrapResult(result);
  }),

  focusEdit: publicProcedure
    .input(workspaceNameInput)
    .mutation(async ({ input }) => {
      const result = await focusEdit(input.name, input.cwd);
      return unwrapResult(result);
    }),

  // Conflict resolution
  listConflicts: publicProcedure.input(cwdInput).query(async ({ input }) => {
    const result = await listConflicts(input.cwd);
    return unwrapResult(result);
  }),

  resolveConflict: publicProcedure
    .input(resolveConflictInput)
    .mutation(async ({ input }) => {
      const result = await resolveConflict(
        input.file,
        input.keepWorkspace,
        input.cwd,
      );
      return unwrapResult(result);
    }),

  resolveConflictsBatch: publicProcedure
    .input(resolveConflictsBatchInput)
    .mutation(async ({ input }) => {
      const choices = new Map(Object.entries(input.choices));
      const result = await resolveConflictsBatch(choices, input.cwd);
      return unwrapResult(result);
    }),

  // File assignment
  assignFiles: publicProcedure
    .input(assignFilesInput)
    .mutation(async ({ input }) => {
      const result = await assignFiles(
        input.patterns,
        input.targetWorkspace,
        input.cwd,
      );
      return unwrapResult(result);
    }),

  listUnassigned: publicProcedure.input(cwdInput).query(async ({ input }) => {
    const result = await listUnassigned(input.cwd);
    return unwrapResult(result);
  }),

  // Submit workspace as PR
  workspaceSubmit: publicProcedure
    .input(workspaceSubmitInput)
    .mutation(async ({ input }) => {
      const result = await submitWorkspace(
        input.workspace,
        { draft: input.draft, message: input.message },
        input.cwd,
      );
      return unwrapResult(result);
    }),

  // Mode switching (jj <-> git)
  enter: publicProcedure.input(cwdInput).mutation(async ({ input }) => {
    const result = await enter(input.cwd);
    return unwrapResult(result);
  }),

  exit: publicProcedure.input(cwdInput).mutation(async ({ input }) => {
    const result = await exit(input.cwd);
    return unwrapResult(result);
  }),

  // Daemon management
  daemonStart: publicProcedure.mutation(async () => {
    const result = await daemonStart();
    return unwrapResult(result);
  }),

  daemonStop: publicProcedure.mutation(async () => {
    const result = await daemonStop();
    return unwrapResult(result);
  }),

  daemonStatus: publicProcedure.query(async () => {
    const result = await daemonStatus();
    return unwrapResult(result);
  }),

  // Get repo mode (jj vs git)
  repoMode: publicProcedure.input(cwdInput).query(async ({ input }) => {
    const isJJMode = await isDetachedHead(input.cwd);
    const branch = isJJMode ? null : await getCurrentBranch(input.cwd);
    return {
      mode: isJJMode ? ("jj" as const) : ("git" as const),
      branch,
    };
  }),

  // Convenience: ensure daemon is running (start if not)
  ensureDaemon: publicProcedure.mutation(async () => {
    const status = await daemonStatus();
    if (status.ok && status.value.running) {
      return { started: false, alreadyRunning: true };
    }
    const startResult = await daemonStart();
    if (!startResult.ok) {
      throw new Error(startResult.error.message);
    }
    return { started: true, alreadyRunning: false };
  }),

  // List open PRs for current user in repo
  listOpenPRs: publicProcedure.input(cwdInput).query(async ({ input }) => {
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execAsync = promisify(exec);

    try {
      // Use gh CLI to list PRs authored by current user
      const { stdout } = await execAsync(
        'gh pr list --author "@me" --state open --json number,title,url,headRefName,createdAt,isDraft',
        { cwd: input.cwd },
      );
      const prs = JSON.parse(stdout) as Array<{
        number: number;
        title: string;
        url: string;
        headRefName: string;
        createdAt: string;
        isDraft: boolean;
      }>;
      return { prs };
    } catch {
      // gh CLI not available or not authenticated
      return { prs: [] };
    }
  }),
});
