import type { ContentBlock } from "@agentclientprotocol/sdk";
import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import {
  AgentServiceEvent,
  cancelPermissionInput,
  cancelPromptInput,
  cancelSessionInput,
  promptInput,
  promptOutput,
  reconnectSessionInput,
  respondToPermissionInput,
  sessionResponseSchema,
  setModelInput,
  startSessionInput,
  subscribeSessionInput,
  tokenRefreshInput,
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
    .mutation(({ input }) => getService().cancelPrompt(input.sessionId)),

  reconnect: publicProcedure
    .input(reconnectSessionInput)
    .output(sessionResponseSchema.nullable())
    .mutation(({ input }) => getService().reconnectSession(input)),

  refreshToken: publicProcedure
    .input(tokenRefreshInput)
    .mutation(({ input }) => {
      getService().updateToken(input.newToken);
    }),

  setModel: publicProcedure
    .input(setModelInput)
    .mutation(({ input }) =>
      getService().setSessionModel(input.sessionId, input.modelId),
    ),

  onSessionEvent: publicProcedure
    .input(subscribeSessionInput)
    .subscription(async function* (opts) {
      const service = getService();
      const targetSessionId = opts.input.sessionId;
      const iterable = service.toIterable(AgentServiceEvent.SessionEvent, {
        signal: opts.signal,
      });

      for await (const event of iterable) {
        if (event.sessionId === targetSessionId) {
          yield event.payload;
        }
      }
    }),

  // Permission request subscription - yields when tools need user input
  onPermissionRequest: publicProcedure
    .input(subscribeSessionInput)
    .subscription(async function* (opts) {
      const service = getService();
      const targetSessionId = opts.input.sessionId;
      const iterable = service.toIterable(AgentServiceEvent.PermissionRequest, {
        signal: opts.signal,
      });

      for await (const event of iterable) {
        if (event.sessionId === targetSessionId) {
          yield event;
        }
      }
    }),

  // Respond to a permission request from the UI
  respondToPermission: publicProcedure
    .input(respondToPermissionInput)
    .mutation(({ input }) =>
      getService().respondToPermission(
        input.sessionId,
        input.toolCallId,
        input.optionId,
      ),
    ),

  // Cancel a permission request (e.g., user pressed Escape)
  cancelPermission: publicProcedure
    .input(cancelPermissionInput)
    .mutation(({ input }) =>
      getService().cancelPermission(input.sessionId, input.toolCallId),
    ),
});
