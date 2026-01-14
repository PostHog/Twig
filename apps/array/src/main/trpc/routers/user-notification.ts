import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import { UserNotificationEvent } from "../../services/user-notification/schemas.js";
import type { UserNotificationService } from "../../services/user-notification/service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () =>
  container.get<UserNotificationService>(MAIN_TOKENS.UserNotificationService);

export const userNotificationRouter = router({
  onNotify: publicProcedure.subscription(async function* (opts) {
    const service = getService();
    const iterable = service.toIterable(UserNotificationEvent.Notify, {
      signal: opts.signal,
    });
    for await (const data of iterable) {
      yield data;
    }
  }),
});
