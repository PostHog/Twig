import { on } from "node:events";
import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import {
  createInput,
  executeInput,
  executeOutput,
  resizeInput,
  type ShellDataPayload,
  ShellEvent,
  type ShellExitPayload,
  sessionIdInput,
  writeInput,
} from "../../services/shell/schemas.js";
import type { ShellService } from "../../services/shell/service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () => container.get<ShellService>(MAIN_TOKENS.ShellService);

function subscribeFiltered<T extends { sessionId: string }>(event: string) {
  return publicProcedure
    .input(sessionIdInput)
    .subscription(async function* (opts): AsyncGenerator<T, void, unknown> {
      const service = getService();
      const targetSessionId = opts.input.sessionId;
      const options = opts.signal ? { signal: opts.signal } : undefined;

      for await (const [payload] of on(service, event, options)) {
        const data = payload as T;
        if (data.sessionId === targetSessionId) {
          yield data;
        }
      }
    });
}

export const shellRouter = router({
  create: publicProcedure
    .input(createInput)
    .mutation(({ input }) =>
      getService().create(input.sessionId, input.cwd, input.taskId),
    ),

  write: publicProcedure
    .input(writeInput)
    .mutation(({ input }) => getService().write(input.sessionId, input.data)),

  resize: publicProcedure
    .input(resizeInput)
    .mutation(({ input }) =>
      getService().resize(input.sessionId, input.cols, input.rows),
    ),

  check: publicProcedure
    .input(sessionIdInput)
    .query(({ input }) => getService().check(input.sessionId)),

  destroy: publicProcedure
    .input(sessionIdInput)
    .mutation(({ input }) => getService().destroy(input.sessionId)),

  getProcess: publicProcedure
    .input(sessionIdInput)
    .query(({ input }) => getService().getProcess(input.sessionId)),

  execute: publicProcedure
    .input(executeInput)
    .output(executeOutput)
    .mutation(({ input }) => getService().execute(input.cwd, input.command)),

  onData: subscribeFiltered<ShellDataPayload>(ShellEvent.Data),
  onExit: subscribeFiltered<ShellExitPayload>(ShellEvent.Exit),
});
