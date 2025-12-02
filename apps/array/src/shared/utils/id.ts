import { randomBytes } from "node:crypto";

export function randomSuffix(length = 8): string {
  return randomBytes(length).toString("hex").substring(0, length);
}

export function generateId(prefix: string, length = 8): string {
  return `${prefix}_${Date.now()}_${randomSuffix(length)}`;
}
