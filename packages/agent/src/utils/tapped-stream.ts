import type { Logger } from "./logger.js";

type MessageCallback = (line: string) => void;

export interface TappedStreamOptions {
  onMessage: MessageCallback;
  logger?: Logger;
}

/**
 * Creates a WritableStream wrapper that taps all newline-delimited messages,
 * forwarding each complete line for persistence.
 *
 * This aligns with ACP's transport model - all messages flow through
 * newline-delimited JSON-RPC streams, so we intercept at the transport layer
 * and persist everything.
 */
export function createTappedWritableStream(
  underlying: WritableStream<Uint8Array>,
  options: TappedStreamOptions,
): WritableStream<Uint8Array> {
  const { onMessage, logger } = options;
  const decoder = new TextDecoder();
  let buffer = "";
  let _messageCount = 0;

  return new WritableStream({
    async write(chunk: Uint8Array) {
      // Decode and buffer
      buffer += decoder.decode(chunk, { stream: true });

      // Process complete lines (newline-delimited)
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        _messageCount++;

        onMessage(line);
      }

      // Forward to underlying stream
      const writer = underlying.getWriter();
      await writer.write(chunk);
      writer.releaseLock();
    },
    async close() {
      const writer = underlying.getWriter();
      await writer.close();
      writer.releaseLock();
    },
    async abort(reason: unknown) {
      logger?.warn("Tapped stream aborted", { reason });
      const writer = underlying.getWriter();
      await writer.abort(reason);
      writer.releaseLock();
    },
  });
}
