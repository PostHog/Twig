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
} from "../../services/workspace/schemas.js";
import {
  type WorkspaceService,
  WorkspaceServiceEvent,
  type WorkspaceServiceEvents,
} from "../../services/workspace/service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () =>
  container.get<WorkspaceService>(MAIN_TOKENS.WorkspaceService);

function subscribe<K extends keyof WorkspaceServiceEvents>(event: K) {
  return publicProcedure.subscription(async function* (opts) {
    const service = getService();
    const iterable = service.toIterable(event, { signal: opts.signal });
    for await (const data of iterable) {
      yield data;
    }
  });
}

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

  onTerminalCreated: subscribe(WorkspaceServiceEvent.TerminalCreated),
  onError: subscribe(WorkspaceServiceEvent.Error),
  onWarning: subscribe(WorkspaceServiceEvent.Warning),
});
