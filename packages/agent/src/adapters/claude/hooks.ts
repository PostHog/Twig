import type { HookCallback, HookInput } from "@anthropic-ai/claude-agent-sdk";
import type { Logger } from "@/utils/logger.js";

const toolUseCallbacks: {
  [toolUseId: string]: {
    onPostToolUseHook?: (
      toolUseID: string,
      toolInput: unknown,
      toolResponse: unknown,
    ) => Promise<void>;
  };
} = {};

export const registerHookCallback = (
  toolUseID: string,
  {
    onPostToolUseHook,
  }: {
    onPostToolUseHook?: (
      toolUseID: string,
      toolInput: unknown,
      toolResponse: unknown,
    ) => Promise<void>;
  },
) => {
  toolUseCallbacks[toolUseID] = {
    onPostToolUseHook,
  };
};

export const createPostToolUseHook =
  (logger: Logger): HookCallback =>
  async (
    input: HookInput,
    toolUseID: string | undefined,
  ): Promise<{ continue: boolean }> => {
    if (input.hook_event_name === "PostToolUse" && toolUseID) {
      const onPostToolUseHook = toolUseCallbacks[toolUseID]?.onPostToolUseHook;
      if (onPostToolUseHook) {
        await onPostToolUseHook(
          toolUseID,
          input.tool_input,
          input.tool_response,
        );
        delete toolUseCallbacks[toolUseID];
      } else {
        logger.error(
          `No onPostToolUseHook found for tool use ID: ${toolUseID}`,
        );
        delete toolUseCallbacks[toolUseID];
      }
    }
    return { continue: true };
  };
