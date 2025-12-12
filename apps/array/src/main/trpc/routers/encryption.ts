import { safeStorage } from "electron";
import { z } from "zod";
import { logger } from "../../lib/logger";
import { publicProcedure, router } from "../trpc.js";

const log = logger.scope("encryptionRouter");

export const encryptionRouter = router({
  /**
   * Encrypt a string
   */
  encrypt: publicProcedure
    .input(z.object({ stringToEncrypt: z.string() }))
    .query(async ({ input }) => {
      try {
        if (safeStorage.isEncryptionAvailable()) {
          const encrypted = safeStorage.encryptString(input.stringToEncrypt);
          return encrypted.toString("base64");
        }
        return input.stringToEncrypt;
      } catch (error) {
        log.error("Failed to encrypt string:", error);
        return null;
      }
    }),

  /**
   * Decrypt a string
   */
  decrypt: publicProcedure
    .input(z.object({ stringToDecrypt: z.string() }))
    .query(async ({ input }) => {
      try {
        if (safeStorage.isEncryptionAvailable()) {
          const buffer = Buffer.from(input.stringToDecrypt, "base64");
          return safeStorage.decryptString(buffer);
        }
        return input.stringToDecrypt;
      } catch (error) {
        log.error("Failed to decrypt string:", error);
        return null;
      }
    }),
});
