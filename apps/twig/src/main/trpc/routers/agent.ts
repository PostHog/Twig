import type { ContentBlock } from "@agentclientprotocol/sdk";
import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
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
  setModeInput,
  setModelInput,
  startSessionInput,
  subscribeSessionInput,
  tokenUpdateInput,
} from "../../services/agent/schemas.js";
import type { AgentService } from "../../services/agent/service.js";
import { publicProcedure, router } from "../trpc.js";

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

  setModel: publicProcedure
    .input(setModelInput)
    .mutation(({ input }) =>
      getService().setSessionModel(input.sessionId, input.modelId),
    ),

  setMode: publicProcedure
    .input(setModeInput)
    .mutation(({ input }) =>
      getService().setSessionMode(input.sessionId, input.modeId),
    ),

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

  getGatewayModels: publicProcedure
    .input(getGatewayModelsInput)
    .output(getGatewayModelsOutput)
    .query(({ input }) =>
      getService().getGatewayModels(input.apiHost, input.apiKey),
    ),
});
