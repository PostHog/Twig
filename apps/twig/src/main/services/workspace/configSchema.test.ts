import { describe, expect, it } from "vitest";
import { arrayConfigSchema } from "./configSchema";

describe("configSchema", () => {
  describe("valid configurations", () => {
    it("accepts empty config", () => {
      const result = arrayConfigSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("accepts config with no scripts", () => {
      const result = arrayConfigSchema.safeParse({ scripts: {} });
      expect(result.success).toBe(true);
    });

    it("accepts init script as string", () => {
      const result = arrayConfigSchema.safeParse({
        scripts: { init: "npm install" },
      });
      expect(result.success).toBe(true);
    });

    it("accepts init script as array", () => {
      const result = arrayConfigSchema.safeParse({
        scripts: { init: ["npm install", "npm run build"] },
      });
      expect(result.success).toBe(true);
    });

    it("accepts start script as string", () => {
      const result = arrayConfigSchema.safeParse({
        scripts: { start: "npm run dev" },
      });
      expect(result.success).toBe(true);
    });

    it("accepts start script as array", () => {
      const result = arrayConfigSchema.safeParse({
        scripts: { start: ["npm run server", "npm run client"] },
      });
      expect(result.success).toBe(true);
    });

    it("accepts destroy script as string", () => {
      const result = arrayConfigSchema.safeParse({
        scripts: { destroy: "npm run cleanup" },
      });
      expect(result.success).toBe(true);
    });

    it("accepts destroy script as array", () => {
      const result = arrayConfigSchema.safeParse({
        scripts: { destroy: ["docker-compose down", "rm -rf node_modules"] },
      });
      expect(result.success).toBe(true);
    });

    it("accepts all scripts together", () => {
      const result = arrayConfigSchema.safeParse({
        scripts: {
          init: "npm install",
          start: ["npm run dev", "npm run watch"],
          destroy: "docker-compose down",
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe("invalid configurations", () => {
    it("rejects empty string script", () => {
      const result = arrayConfigSchema.safeParse({
        scripts: { init: "" },
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty array script", () => {
      const result = arrayConfigSchema.safeParse({
        scripts: { init: [] },
      });
      expect(result.success).toBe(false);
    });

    it("rejects array with empty string", () => {
      const result = arrayConfigSchema.safeParse({
        scripts: { init: ["npm install", ""] },
      });
      expect(result.success).toBe(false);
    });

    it("rejects unknown properties", () => {
      const result = arrayConfigSchema.safeParse({
        scripts: { init: "npm install" },
        unknown: "value",
      });
      expect(result.success).toBe(false);
    });

    it("rejects unknown script types", () => {
      const result = arrayConfigSchema.safeParse({
        scripts: { build: "npm run build" },
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-string script values", () => {
      const result = arrayConfigSchema.safeParse({
        scripts: { init: 123 },
      });
      expect(result.success).toBe(false);
    });

    it("rejects array with non-string values", () => {
      const result = arrayConfigSchema.safeParse({
        scripts: { init: ["npm install", 123] },
      });
      expect(result.success).toBe(false);
    });
  });

  describe("error messages", () => {
    it("provides useful error for empty string", () => {
      const result = arrayConfigSchema.safeParse({
        scripts: { init: "" },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMessages = result.error.issues.map((i) => i.message);
        expect(errorMessages.some((m) => m.includes("cannot be empty"))).toBe(
          true,
        );
      }
    });

    it("provides useful error for empty array", () => {
      const result = arrayConfigSchema.safeParse({
        scripts: { start: [] },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMessages = result.error.issues.map((i) => i.message);
        expect(errorMessages.some((m) => m.includes("cannot be empty"))).toBe(
          true,
        );
      }
    });
  });
});
