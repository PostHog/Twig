import { ipcLink } from "@posthog/electron-trpc/renderer";
import { createTRPCProxyClient } from "@trpc/client";
import { type CreateTRPCReact, createTRPCReact } from "@trpc/react-query";
import type { TrpcRouter } from "../../main/trpc/router.js";

export function createTrpcClient() {
  return trpcReact.createClient({
    links: [ipcLink()],
  });
}

export const trpcReact: CreateTRPCReact<TrpcRouter, unknown> =
  createTRPCReact<TrpcRouter>();

// vanilla trpc client for use outside React components
export const trpcVanilla = createTRPCProxyClient<TrpcRouter>({
  links: [ipcLink()],
});
