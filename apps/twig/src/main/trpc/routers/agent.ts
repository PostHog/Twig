import type { ContentBlock } from "@agentclientprotocol/sdk";
import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import { logger } from "../../lib/logger.js";
import {
  AgentServiceEvent,
  cancelPermissionInput,
  cancelPromptInput,
  cancelSessionInput,
  getGatewayModelsInput,
  getGatewayModelsOutput,
  listSessionsInput,
  listSessionsOutput,
  notifySessionContextInput,
  promptInput,
  promptOutput,
  reconnectSessionInput,
  respondToPermissionInput,
  sessionResponseSchema,
  setConfigOptionInput,
  startSessionInput,
  subscribeSessionInput,
  tokenUpdateInput,
} from "../../services/agent/schemas.js";
import type { AgentService } from "../../services/agent/service.js";
import type { ProcessTrackingService } from "../../services/process-tracking/service.js";
import type { ShellService } from "../../services/shell/service.js";
import type { SleepService } from "../../services/sleep/service.js";
import { publicProcedure, router } from "../trpc.js";

const log = logger.scope("agent-router");

const getService = () => container.get<AgentService>(MAIN_TOKENS.AgentService);

export const agentRouter = router({
  start: publicProcedure
    .input(startSessionInput)
    .output(sessionResponseSchema)
    .mutation(({ input }) => getService().startSession(input)),

  prompt: publicProcedure
    .input(promptInput)
    .output(promptOutput)
    .mutation(({ input }) =>
      getService().prompt(input.sessionId, input.prompt as ContentBlock[]),
    ),

  cancel: publicProcedure
    .input(cancelSessionInput)
    .mutation(({ input }) => getService().cancelSession(input.sessionId)),

  cancelPrompt: publicProcedure
    .input(cancelPromptInput)
    .mutation(({ input }) =>
      getService().cancelPrompt(input.sessionId, input.reason),
    ),

  reconnect: publicProcedure
    .input(reconnectSessionInput)
    .output(sessionResponseSchema.nullable())
    .mutation(({ input }) => getService().reconnectSession(input)),

  updateToken: publicProcedure.input(tokenUpdateInput).mutation(({ input }) => {
    getService().updateToken(input.token);
  }),

  setConfigOption: publicProcedure
    .input(setConfigOptionInput)
    .mutation(({ input }) =>
      getService().setSessionConfigOption(
        input.sessionId,
        input.configId,
        input.value,
      ),
    ),

  onSessionEvent: publicProcedure
    .input(subscribeSessionInput)
    .subscription(async function* (opts) {
      const service = getService();
      const targetTaskRunId = opts.input.taskRunId;
      const iterable = service.toIterable(AgentServiceEvent.SessionEvent, {
        signal: opts.signal,
      });

      for await (const event of iterable) {
        if (event.taskRunId === targetTaskRunId) {
          yield event.payload;
        }
      }
    }),

  // Permission request subscription - yields when tools need user input
  onPermissionRequest: publicProcedure
    .input(subscribeSessionInput)
    .subscription(async function* (opts) {
      const service = getService();
      const targetTaskRunId = opts.input.taskRunId;
      const iterable = service.toIterable(AgentServiceEvent.PermissionRequest, {
        signal: opts.signal,
      });

      for await (const event of iterable) {
        if (event.taskRunId === targetTaskRunId) {
          yield event;
        }
      }
    }),

  // Respond to a permission request from the UI
  respondToPermission: publicProcedure
    .input(respondToPermissionInput)
    .mutation(({ input }) =>
      getService().respondToPermission(
        input.taskRunId,
        input.toolCallId,
        input.optionId,
        input.customInput,
        input.answers,
      ),
    ),

  // Cancel a permission request (e.g., user pressed Escape)
  cancelPermission: publicProcedure
    .input(cancelPermissionInput)
    .mutation(({ input }) =>
      getService().cancelPermission(input.taskRunId, input.toolCallId),
    ),

  listSessions: publicProcedure
    .input(listSessionsInput)
    .output(listSessionsOutput)
    .query(({ input }) =>
      getService()
        .listSessions(input.taskId)
        .map((s) => ({ taskRunId: s.taskRunId, repoPath: s.repoPath })),
    ),

  notifySessionContext: publicProcedure
    .input(notifySessionContextInput)
    .mutation(({ input }) =>
      getService().notifySessionContext(input.sessionId, input.context),
    ),

  markAllForRecreation: publicProcedure.mutation(() =>
    getService().markAllSessionsForRecreation(),
  ),

  resetAll: publicProcedure.mutation(async () => {
    log.info("Resetting all sessions (logout/project switch)");

    // Clean up all agent sessions (flushes logs, stops agents, releases sleep blockers)
    const agentService = getService();
    await agentService.cleanupAll();

    // Destroy all shell PTY sessions
    const shellService = container.get<ShellService>(MAIN_TOKENS.ShellService);
    shellService.destroyAll();

    // Kill any remaining tracked processes (belt and suspenders)
    const processTracking = container.get<ProcessTrackingService>(
      MAIN_TOKENS.ProcessTrackingService,
    );
    processTracking.killAll();

    // Release any lingering sleep blockers
    const sleepService = container.get<SleepService>(MAIN_TOKENS.SleepService);
    sleepService.cleanup();

    log.info("All sessions reset successfully");
  }),

  getGatewayModels: publicProcedure
    .input(getGatewayModelsInput)
    .output(getGatewayModelsOutput)
    .query(({ input }) =>
      getService().getGatewayModels(input.apiHost, input.apiKey),
    ),
});
