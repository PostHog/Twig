import { on } from "node:events";
import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import {
  createInput,
  executeInput,
  executeOutput,
  resizeInput,
  ShellEvent,
  type ShellEvents,
  sessionIdInput,
  writeInput,
} from "../../services/shell/schemas.js";
import type { ShellService } from "../../services/shell/service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () => container.get<ShellService>(MAIN_TOKENS.ShellService);

/**
 * Creates a per-session subscription that filters events for a specific session.
 *
 * The ShellService uses TypedEventEmitter to broadcast events globally (all sessions).
 * This helper filters those events so each subscriber only receives events for their
 * specific session - Terminal A doesn't receive Terminal B's output.
 *
 * This is the "per-instance" pattern (vs "global broadcast" for things like theme changes).
 */
function subscribeToSession<K extends keyof ShellEvents>(event: K) {
  return publicProcedure
    .input(sessionIdInput)
    .subscription(async function* (opts) {
      const service = getService();
      const targetSessionId = opts.input.sessionId;

      for await (const [payload] of on(service, event, {
        signal: opts.signal,
      })) {
        const data = payload as ShellEvents[K];
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

  onData: subscribeToSession(ShellEvent.Data),
  onExit: subscribeToSession(ShellEvent.Exit),
});
