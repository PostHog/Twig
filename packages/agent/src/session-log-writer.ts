import {
  type OtelLogConfig,
  OtelLogWriter,
  type SessionContext,
} from "./otel-log-writer.js";
import type { StoredNotification } from "./types.js";
import { Logger } from "./utils/logger.js";

export interface SessionLogWriterOptions {
  /** OTEL config for creating writers per session */
  otelConfig?: OtelLogConfig;
  /** Logger instance */
  logger?: Logger;
}

interface SessionState {
  context: SessionContext;
  otelWriter?: OtelLogWriter;
}

export class SessionLogWriter {
  private otelConfig?: OtelLogConfig;
  private sessions: Map<string, SessionState> = new Map();
  private logger: Logger;

  constructor(options: SessionLogWriterOptions = {}) {
    this.otelConfig = options.otelConfig;
    this.logger =
      options.logger ??
      new Logger({ debug: false, prefix: "[SessionLogWriter]" });

    const flushAllAndExit = async () => {
      const shutdownPromises = Array.from(this.sessions.values())
        .filter((session) => session.otelWriter)
        .map((session) => session.otelWriter?.shutdown());
      await Promise.all(shutdownPromises);
      process.exit(0);
    };

    process.on("beforeExit", () => {
      flushAllAndExit().catch((e) => this.logger.error("Flush failed:", e));
    });
    process.on("SIGINT", () => {
      flushAllAndExit().catch((e) => this.logger.error("Flush failed:", e));
    });
    process.on("SIGTERM", () => {
      flushAllAndExit().catch((e) => this.logger.error("Flush failed:", e));
    });
  }

  async flushAll(): Promise<void> {
    const flushPromises: Promise<void>[] = [];
    for (const sessionId of this.sessions.keys()) {
      flushPromises.push(this.flush(sessionId));
    }
    await Promise.all(flushPromises);
  }

  register(sessionId: string, context: SessionContext): void {
    if (this.sessions.has(sessionId)) {
      return;
    }

    let otelWriter: OtelLogWriter | undefined;
    if (this.otelConfig) {
      // Create a dedicated OtelLogWriter for this session with resource attributes
      otelWriter = new OtelLogWriter(
        this.otelConfig,
        context,
        this.logger.child(`OtelWriter:${sessionId}`),
      );
    }

    this.sessions.set(sessionId, { context, otelWriter });
  }

  isRegistered(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  appendRawLine(sessionId: string, line: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    if (!session.otelWriter) {
      this.logger.debug("No OTEL writer configured for session, skipping log");
      return;
    }

    try {
      const message = JSON.parse(line);
      const entry: StoredNotification = {
        type: "notification",
        timestamp: new Date().toISOString(),
        notification: message,
      };

      session.otelWriter.emit({ notification: entry });
    } catch {
      this.logger.warn("Failed to parse raw line for persistence", {
        sessionId,
        lineLength: line.length,
      });
    }
  }

  async flush(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session?.otelWriter) {
      await session.otelWriter.flush();
    }
  }
}
