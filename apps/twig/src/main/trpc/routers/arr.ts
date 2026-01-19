import {
  assignFiles,
  listUnassigned,
  moveFiles,
} from "@twig/core/commands/assign";
import {
  daemonStart,
  daemonStatus,
  daemonStop,
} from "@twig/core/commands/daemon";
import { enter } from "@twig/core/commands/enter";
import { exit } from "@twig/core/commands/exit";
import {
  focusAdd,
  focusAll,
  focusEdit,
  focusNone,
  focusOnly,
  focusRemove,
  focusStatus,
} from "@twig/core/commands/focus";
import {
  listConflicts,
  resolveConflict,
  resolveConflictsBatch,
} from "@twig/core/commands/focus-resolve";
import { restoreFile } from "@twig/core/commands/restore-file";
// Import @twig/core commands
import { workspaceAdd } from "@twig/core/commands/workspace-add";
import { workspaceList } from "@twig/core/commands/workspace-list";
import { getWorkspacePRInfos } from "@twig/core/commands/workspace-pr-info";
import { workspaceRemove } from "@twig/core/commands/workspace-remove";
import { workspaceStatus } from "@twig/core/commands/workspace-status";
import { submitWorkspace } from "@twig/core/commands/workspace-submit";
import { isGitMode } from "@twig/core/daemon/pid";
import {
  checkoutBranch,
  getCurrentBranch,
  listBranches,
} from "@twig/core/git/head";
import {
  getWorkspaceFileAtParent,
  getWorkspacePath,
  readWorkspaceFile,
} from "@twig/core/jj/workspace";
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
const moveFilesInput = z.object({
  files: z.array(z.string()),
  fromWorkspace: z.string(),
  toWorkspace: z.string(),
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
const workspaceFileInput = z.object({
  workspace: z.string(),
  filePath: z.string(),
  cwd: z.string(),
});
const restoreFileInput = z.object({
  workspace: z.string(),
  filePath: z.string(),
  fileStatus: z.enum([
    "M",
    "A",
    "D",
    "R",
    "modified",
    "added",
    "deleted",
    "renamed",
    "untracked",
  ]),
  cwd: z.string(),
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

  workspacePRInfo: publicProcedure.input(cwdInput).query(async ({ input }) => {
    const result = await getWorkspacePRInfos(input.cwd);
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

  moveFiles: publicProcedure
    .input(moveFilesInput)
    .mutation(async ({ input }) => {
      const result = await moveFiles(
        input.files,
        input.fromWorkspace,
        input.toWorkspace,
        input.cwd,
      );
      return unwrapResult(result);
    }),

  listUnassigned: publicProcedure.input(cwdInput).query(async ({ input }) => {
    const result = await listUnassigned(input.cwd);
    const data = unwrapResult(result);
    return data;
  }),

  restoreFile: publicProcedure
    .input(restoreFileInput)
    .mutation(async ({ input }) => {
      const result = await restoreFile(
        input.workspace,
        input.filePath,
        input.fileStatus,
        input.cwd,
      );
      return unwrapResult(result);
    }),

  // Workspace file content (for diff viewer)
  getWorkspaceFile: publicProcedure
    .input(workspaceFileInput)
    .query(({ input }) => {
      const result = readWorkspaceFile(
        input.workspace,
        input.filePath,
        input.cwd,
      );
      return unwrapResult(result);
    }),

  getWorkspaceFileAtParent: publicProcedure
    .input(workspaceFileInput)
    .query(async ({ input }) => {
      const result = await getWorkspaceFileAtParent(
        input.workspace,
        input.filePath,
        input.cwd,
      );
      return unwrapResult(result);
    }),

  getWorkspacePath: publicProcedure
    .input(z.object({ workspace: z.string(), cwd: z.string() }))
    .query(({ input }) => {
      return getWorkspacePath(input.workspace, input.cwd);
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
    const gitMode = isGitMode(input.cwd);
    const branch = gitMode ? await getCurrentBranch(input.cwd) : null;
    return {
      mode: gitMode ? ("git" as const) : ("jj" as const),
      branch,
    };
  }),

  // Git branch management (for git mode)
  listBranches: publicProcedure.input(cwdInput).query(async ({ input }) => {
    const result = await listBranches(input.cwd);
    return unwrapResult(result);
  }),

  checkoutBranch: publicProcedure
    .input(z.object({ branch: z.string(), cwd: z.string() }))
    .mutation(async ({ input }) => {
      const result = await checkoutBranch(input.cwd, input.branch);
      return unwrapResult(result);
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
