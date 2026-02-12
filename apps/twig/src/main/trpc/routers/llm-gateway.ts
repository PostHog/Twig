import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import {
  promptInput,
  promptOutput,
} from "../../services/llm-gateway/schemas.js";
import type { LlmGatewayService } from "../../services/llm-gateway/service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () =>
  container.get<LlmGatewayService>(MAIN_TOKENS.LlmGatewayService);

export const llmGatewayRouter = router({
  prompt: publicProcedure
    .input(promptInput)
    .output(promptOutput)
    .mutation(({ input }) =>
      getService().prompt(input.credentials, input.messages, {
        system: input.system,
        maxTokens: input.maxTokens,
        model: input.model,
      }),
    ),
});
