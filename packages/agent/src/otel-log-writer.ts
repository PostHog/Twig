import { SeverityNumber } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchLogRecordProcessor,
  LoggerProvider,
} from "@opentelemetry/sdk-logs";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import type { StoredNotification } from "./types.js";
import type { Logger } from "./utils/logger.js";

export interface OtelLogConfig {
  /** PostHog ingest host, e.g., "https://us.i.posthog.com" */
  posthogHost: string;
  /** Project API key, e.g., "phc_xxx" */
  apiKey: string;
  /** Batch flush interval in ms (default: 500) */
  flushIntervalMs?: number;
  /** Override the logs endpoint path (default: /i/v1/agent-logs) */
  logsPath?: string;
}

/**
 * Session context for resource attributes.
 * These are set once per OTEL logger instance and indexed via resource_fingerprint
 */
export interface SessionContext {
  /** Parent task grouping - all runs for a task share this */
  taskId: string;
  /** Primary conversation identifier - all events in a run share this */
  runId: string;
  /** Deployment environment - "local" for desktop, "cloud" for cloud sandbox */
  deviceType?: "local" | "cloud";
}

export class OtelLogWriter {
  private loggerProvider: LoggerProvider;
  private logger: ReturnType<LoggerProvider["getLogger"]>;

  constructor(
    config: OtelLogConfig,
    sessionContext: SessionContext,
    _debugLogger?: Logger,
  ) {
    const logsPath = config.logsPath ?? "/i/v1/agent-logs";
    const exporter = new OTLPLogExporter({
      url: `${config.posthogHost}${logsPath}`,
      headers: { Authorization: `Bearer ${config.apiKey}` },
    });

    const processor = new BatchLogRecordProcessor(exporter, {
      scheduledDelayMillis: config.flushIntervalMs ?? 500,
    });

    // Resource attributes are set ONCE per session and indexed via resource_fingerprint
    // So we have fast queries by run_id/task_id in PostHog Logs UI
    this.loggerProvider = new LoggerProvider({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: "twig-agent",
        run_id: sessionContext.runId,
        task_id: sessionContext.taskId,
        device_type: sessionContext.deviceType ?? "local",
      }),
      processors: [processor],
    });

    this.logger = this.loggerProvider.getLogger("agent-session");
  }

  /**
   * Emit an agent event to PostHog Logs via OTEL.
   */
  emit(entry: { notification: StoredNotification }): void {
    const { notification } = entry;
    const eventType = notification.notification.method;

    this.logger.emit({
      severityNumber: SeverityNumber.INFO,
      severityText: "INFO",
      body: JSON.stringify(notification),
      attributes: {
        event_type: eventType,
      },
    });
  }

  async flush(): Promise<void> {
    await this.loggerProvider.forceFlush();
  }

  async shutdown(): Promise<void> {
    await this.loggerProvider.shutdown();
  }
}
