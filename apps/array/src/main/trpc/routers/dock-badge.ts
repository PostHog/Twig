import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import type { DockBadgeService } from "../../services/dock-badge/service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () =>
  container.get<DockBadgeService>(MAIN_TOKENS.DockBadgeService);

export const dockBadgeRouter = router({
  show: publicProcedure.mutation(() => getService().show()),
});
