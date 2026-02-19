import { decrypt, encrypt } from "@main/utils/encryption";
import { rendererStore } from "@main/utils/store";
import { z } from "zod";
import { logger } from "../../lib/logger";
import { publicProcedure, router } from "../trpc.js";

const log = logger.scope("secureStoreRouter");

export const secureStoreRouter = router({
  /**
   * Get an encrypted item from the store
   */
  getItem: publicProcedure
    .input(z.object({ key: z.string() }))
    .query(async ({ input }) => {
      try {
        if (!rendererStore.has(input.key)) return null;
        const encrypted = rendererStore.get(input.key) as string;
        return decrypt(encrypted);
      } catch (error) {
        log.error("Failed to get item:", error);
        return null;
      }
    }),

  /**
   * Set an encrypted item in the store
   */
  setItem: publicProcedure
    .input(z.object({ key: z.string(), value: z.string() }))
    .query(async ({ input }) => {
      try {
        rendererStore.set(input.key, encrypt(input.value));
      } catch (error) {
        log.error("Failed to set item:", error);
      }
    }),

  /**
   * Remove an item from the store
   */
  removeItem: publicProcedure
    .input(z.object({ key: z.string() }))
    .query(async ({ input }) => {
      try {
        rendererStore.delete(input.key);
      } catch (error) {
        log.error("Failed to remove item:", error);
      }
    }),

  /**
   * Clear all items from the store
   */
  clear: publicProcedure.query(async () => {
    try {
      rendererStore.clear();
    } catch (error) {
      log.error("Failed to clear store:", error);
    }
  }),
});
