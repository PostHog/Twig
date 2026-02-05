import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import {
  createEnvironmentInput,
  environmentCapabilitiesSchema,
  getCapabilitiesOutput,
  getTypeOutput,
  taskIdInput,
} from "../../services/environment/schemas.js";
import type { EnvironmentService } from "../../services/environment/service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () =>
  container.get<EnvironmentService>(MAIN_TOKENS.EnvironmentService);

export const environmentRouter = router({
  create: publicProcedure
    .input(createEnvironmentInput)
    .output(environmentCapabilitiesSchema)
    .mutation(({ input }) => {
      const env = getService().create(input.taskId, input.type);
      return env.capabilities;
    }),

  getCapabilities: publicProcedure
    .input(taskIdInput)
    .output(getCapabilitiesOutput)
    .query(({ input }) => getService().getCapabilities(input.taskId)),

  getType: publicProcedure
    .input(taskIdInput)
    .output(getTypeOutput)
    .query(({ input }) => getService().getType(input.taskId)),

  remove: publicProcedure
    .input(taskIdInput)
    .mutation(({ input }) => getService().remove(input.taskId)),
});
