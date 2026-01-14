import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import {
  UIServiceEvent,
  type UIServiceEvents,
} from "../../services/ui/schemas.js";
import type { UIService } from "../../services/ui/service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () => container.get<UIService>(MAIN_TOKENS.UIService);

function subscribeToUIEvent<K extends keyof UIServiceEvents>(event: K) {
  return publicProcedure.subscription(async function* (opts) {
    const service = getService();
    const iterable = service.toIterable(event, { signal: opts.signal });
    for await (const data of iterable) {
      yield data;
    }
  });
}

export const uiRouter = router({
  onOpenSettings: subscribeToUIEvent(UIServiceEvent.OpenSettings),
  onNewTask: subscribeToUIEvent(UIServiceEvent.NewTask),
  onResetLayout: subscribeToUIEvent(UIServiceEvent.ResetLayout),
  onClearStorage: subscribeToUIEvent(UIServiceEvent.ClearStorage),
});
