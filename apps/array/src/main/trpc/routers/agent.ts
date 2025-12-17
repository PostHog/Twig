import { on } from "node:events";
import type { ContentBlock } from "@agentclientprotocol/sdk";
import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import {
  AgentServiceEvent,
  type AgentSessionEventPayload,
  cancelPromptInput,
  cancelSessionInput,
  promptInput,
  promptOutput,
  reconnectSessionInput,
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
      const options = opts.signal ? { signal: opts.signal } : undefined;

      for await (const [payload] of on(
        service,
        AgentServiceEvent.SessionEvent,
        options,
      )) {
        const event = payload as AgentSessionEventPayload;
        if (event.sessionId === targetSessionId) {
          yield event.payload;
        }
      }
    }),
});
