import type { Logger } from "./logger.js";

export const IS_ROOT = (process.geteuid?.() ?? process.getuid?.()) === 0;

export function unreachable(value: never, logger: Logger): void {
  let valueAsString: string;
  try {
    valueAsString = JSON.stringify(value);
  } catch {
    valueAsString = value;
  }
  logger.error(`Unexpected case: ${valueAsString}`);
}
