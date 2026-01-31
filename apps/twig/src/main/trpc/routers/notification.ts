import { z } from "zod";
import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import type { NotificationService } from "../../services/notification/service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () =>
  container.get<NotificationService>(MAIN_TOKENS.NotificationService);

export const notificationRouter = router({
  send: publicProcedure
    .input(z.object({ title: z.string(), body: z.string() }))
    .mutation(({ input }) => getService().send(input.title, input.body)),
  showDockBadge: publicProcedure.mutation(() => getService().showDockBadge()),
});
