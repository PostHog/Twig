import { initTRPC } from "@trpc/server";

const trpc = initTRPC.create({
  isServer: true,
});

export const router = trpc.router;
export const publicProcedure = trpc.procedure;
export const middleware = trpc.middleware;
