import type { Logger } from "@/utils/logger.js";

export const IS_ROOT = (process.geteuid?.() ?? process.getuid?.()) === 0;

export function unreachable(value: never, logger: Logger) {
  let valueAsString: string;
  try {
    valueAsString = JSON.stringify(value);
  } catch {
    valueAsString = value;
  }
  logger.error(`Unexpected case: ${valueAsString}`);
}

export function sleep(time: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, time));
}

export interface ExtractLinesResult {
  content: string;
  wasLimited: boolean;
  linesRead: number;
}

export function extractLinesWithByteLimit(
  fullContent: string,
  maxContentLength: number,
): ExtractLinesResult {
  if (fullContent === "") {
    return {
      content: "",
      wasLimited: false,
      linesRead: 1,
    };
  }

  let linesSeen = 0;
  let index = 0;
  linesSeen = 0;

  let contentLength = 0;
  let wasLimited = false;

  while (true) {
    const nextIndex = fullContent.indexOf("\n", index);

    if (nextIndex < 0) {
      if (linesSeen > 0 && fullContent.length > maxContentLength) {
        wasLimited = true;
        break;
      }
      linesSeen += 1;
      contentLength = fullContent.length;
      break;
    } else {
      const newContentLength = nextIndex + 1;
      if (linesSeen > 0 && newContentLength > maxContentLength) {
        wasLimited = true;
        break;
      }
      linesSeen += 1;
      contentLength = newContentLength;
      index = newContentLength;
    }
  }

  return {
    content: fullContent.slice(0, contentLength),
    wasLimited,
    linesRead: linesSeen,
  };
}
