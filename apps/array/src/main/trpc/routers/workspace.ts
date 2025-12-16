import { on } from "node:events";
import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import {
  createWorkspaceInput,
  createWorkspaceOutput,
  deleteWorkspaceInput,
  getAllWorkspacesOutput,
  getWorkspaceInfoInput,
  getWorkspaceInfoOutput,
  getWorkspaceTerminalsInput,
  getWorkspaceTerminalsOutput,
  isWorkspaceRunningInput,
  isWorkspaceRunningOutput,
  runStartScriptsInput,
  runStartScriptsOutput,
  verifyWorkspaceInput,
  verifyWorkspaceOutput,
  type WorkspaceErrorPayload,
  type WorkspaceTerminalCreatedPayload,
  type WorkspaceWarningPayload,
} from "../../services/workspace/schemas.js";
import {
  type WorkspaceService,
  WorkspaceServiceEvent,
} from "../../services/workspace/service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () =>
  container.get<WorkspaceService>(MAIN_TOKENS.WorkspaceService);

export const workspaceRouter = router({
  create: publicProcedure
    .input(createWorkspaceInput)
    .output(createWorkspaceOutput)
    .mutation(({ input }) => getService().createWorkspace(input)),

  delete: publicProcedure
    .input(deleteWorkspaceInput)
    .mutation(({ input }) =>
      getService().deleteWorkspace(input.taskId, input.mainRepoPath),
    ),

  verify: publicProcedure
    .input(verifyWorkspaceInput)
    .output(verifyWorkspaceOutput)
    .query(({ input }) => getService().verifyWorkspaceExists(input.taskId)),

  getInfo: publicProcedure
    .input(getWorkspaceInfoInput)
    .output(getWorkspaceInfoOutput)
    .query(({ input }) => getService().getWorkspaceInfo(input.taskId)),

  getAll: publicProcedure
    .output(getAllWorkspacesOutput)
    .query(() => getService().getAllWorkspaces()),

  runStart: publicProcedure
    .input(runStartScriptsInput)
    .output(runStartScriptsOutput)
    .mutation(({ input }) =>
      getService().runStartScripts(
        input.taskId,
        input.worktreePath,
        input.worktreeName,
      ),
    ),

  isRunning: publicProcedure
    .input(isWorkspaceRunningInput)
    .output(isWorkspaceRunningOutput)
    .query(({ input }) => getService().isWorkspaceRunning(input.taskId)),

  getTerminals: publicProcedure
    .input(getWorkspaceTerminalsInput)
    .output(getWorkspaceTerminalsOutput)
    .query(({ input }) => getService().getWorkspaceTerminals(input.taskId)),

  // Subscriptions for real-time events
  onTerminalCreated: publicProcedure.subscription(async function* (opts) {
    const service = getService();
    const options = opts.signal ? { signal: opts.signal } : undefined;
    for await (const [payload] of on(
      service,
      WorkspaceServiceEvent.TerminalCreated,
      options,
    )) {
      yield payload as WorkspaceTerminalCreatedPayload;
    }
  }),

  onError: publicProcedure.subscription(async function* (opts) {
    const service = getService();
    const options = opts.signal ? { signal: opts.signal } : undefined;
    for await (const [payload] of on(
      service,
      WorkspaceServiceEvent.Error,
      options,
    )) {
      yield payload as WorkspaceErrorPayload;
    }
  }),

  onWarning: publicProcedure.subscription(async function* (opts) {
    const service = getService();
    const options = opts.signal ? { signal: opts.signal } : undefined;
    for await (const [payload] of on(
      service,
      WorkspaceServiceEvent.Warning,
      options,
    )) {
      yield payload as WorkspaceWarningPayload;
    }
  }),
});
