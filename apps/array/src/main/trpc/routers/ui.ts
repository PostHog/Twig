import { on } from "node:events";
import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import { UIServiceEvent } from "../../services/ui/schemas.js";
import type { UIService } from "../../services/ui/service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () => container.get<UIService>(MAIN_TOKENS.UIService);

function subscribeToUIEvent(event: string) {
  return publicProcedure.subscription(async function* (opts) {
    const service = getService();
    const options = opts.signal ? { signal: opts.signal } : undefined;
    for await (const _ of on(service, event, options)) {
      yield {};
    }
  });
}

export const uiRouter = router({
  onOpenSettings: subscribeToUIEvent(UIServiceEvent.OpenSettings),
  onNewTask: subscribeToUIEvent(UIServiceEvent.NewTask),
  onResetLayout: subscribeToUIEvent(UIServiceEvent.ResetLayout),
  onClearStorage: subscribeToUIEvent(UIServiceEvent.ClearStorage),
});
