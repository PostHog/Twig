// A pushable async iterable: allows you to push items and consume them with for-await.

import { readFileSync } from "node:fs";
import { platform } from "node:os";
import type { Readable, Writable } from "node:stream";
import { ReadableStream, WritableStream } from "node:stream/web";
import type { Logger } from "@/utils/logger.js";

// Useful for bridging push-based and async-iterator-based code.
export class Pushable<T> implements AsyncIterable<T> {
  private queue: T[] = [];
  private resolvers: ((value: IteratorResult<T>) => void)[] = [];
  private done = false;

  push(item: T) {
    const resolve = this.resolvers.shift();
    if (resolve) {
      resolve({ value: item, done: false });
    } else {
      this.queue.push(item);
    }
  }

  end() {
    this.done = true;
    for (const resolve of this.resolvers) {
      resolve({ value: undefined as unknown as T, done: true });
    }
    this.resolvers = [];
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.queue.length > 0) {
          const value = this.queue.shift() as T;
          return Promise.resolve({ value, done: false });
        }
        if (this.done) {
          return Promise.resolve({
            value: undefined as unknown as T,
            done: true,
          });
        }
        return new Promise<IteratorResult<T>>((resolve) => {
          this.resolvers.push(resolve);
        });
      },
    };
  }
}

// Helper to convert Node.js streams to Web Streams
export function nodeToWebWritable(
  nodeStream: Writable,
): WritableStream<Uint8Array> {
  return new WritableStream<Uint8Array>({
    write(chunk) {
      return new Promise<void>((resolve, reject) => {
        nodeStream.write(Buffer.from(chunk), (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    },
  });
}

export function nodeToWebReadable(
  nodeStream: Readable,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on("data", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (err) => controller.error(err));
    },
  });
}

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

interface ManagedSettings {
  permissions?: {
    allow?: string[];
    deny?: string[];
  };
  env?: Record<string, string>;
}

// Following the rules in https://docs.anthropic.com/en/docs/claude-code/settings#settings-files
// This can be removed once the SDK supports it natively.
function getManagedSettingsPath(): string {
  const os = platform();
  switch (os) {
    case "darwin":
      return "/Library/Application Support/ClaudeCode/managed-settings.json";
    case "linux": // including WSL
      return "/etc/claude-code/managed-settings.json";
    case "win32":
      return "C:\\ProgramData\\ClaudeCode\\managed-settings.json";
    default:
      return "/etc/claude-code/managed-settings.json";
  }
}

export function loadManagedSettings(): ManagedSettings | null {
  try {
    return JSON.parse(
      readFileSync(getManagedSettingsPath(), "utf8"),
    ) as ManagedSettings;
  } catch {
    return null;
  }
}

export function applyEnvironmentSettings(settings: ManagedSettings): void {
  if (settings.env) {
    for (const [key, value] of Object.entries(settings.env)) {
      process.env[key] = value;
    }
  }
}

export type StreamPair = {
  readable: globalThis.ReadableStream<Uint8Array>;
  writable: globalThis.WritableStream<Uint8Array>;
};

export type BidirectionalStreamPair = {
  client: StreamPair;
  agent: StreamPair;
};

function pushableToReadableStream(
  pushable: Pushable<Uint8Array>,
): globalThis.ReadableStream<Uint8Array> {
  const iterator = pushable[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) {
        controller.close();
      } else {
        controller.enqueue(value);
      }
    },
  }) as unknown as globalThis.ReadableStream<Uint8Array>;
}

export function createBidirectionalStreams(): BidirectionalStreamPair {
  const clientToAgentPushable = new Pushable<Uint8Array>();
  const agentToClientPushable = new Pushable<Uint8Array>();

  const clientToAgentReadable = pushableToReadableStream(clientToAgentPushable);
  const agentToClientReadable = pushableToReadableStream(agentToClientPushable);

  const clientToAgentWritable = new WritableStream<Uint8Array>({
    write(chunk) {
      clientToAgentPushable.push(chunk);
    },
    close() {
      clientToAgentPushable.end();
    },
  }) as globalThis.WritableStream<Uint8Array>;

  const agentToClientWritable = new WritableStream<Uint8Array>({
    write(chunk) {
      agentToClientPushable.push(chunk);
    },
    close() {
      agentToClientPushable.end();
    },
  }) as globalThis.WritableStream<Uint8Array>;

  return {
    client: {
      readable: agentToClientReadable,
      writable: clientToAgentWritable,
    },
    agent: {
      readable: clientToAgentReadable,
      writable: agentToClientWritable,
    },
  };
}

export interface ExtractLinesResult {
  content: string;
  wasLimited: boolean;
  linesRead: number;
}

/**
 * Extracts lines from file content with byte limit enforcement.
 *
 * @param fullContent - The complete file content
 * @param maxContentLength - Maximum number of UTF-16 Code Units to return
 * @returns Object containing extracted content and metadata
 */
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
      // Last line in file (no trailing newline)
      if (linesSeen > 0 && fullContent.length > maxContentLength) {
        wasLimited = true;
        break;
      }
      linesSeen += 1;
      contentLength = fullContent.length;
      break;
    } else {
      // Line with newline - include up to the newline
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
