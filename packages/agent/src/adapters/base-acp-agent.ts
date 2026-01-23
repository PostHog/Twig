import type {
  Agent,
  AgentSideConnection,
  AuthenticateRequest,
  CancelNotification,
  InitializeRequest,
  InitializeResponse,
  NewSessionRequest,
  NewSessionResponse,
  PromptRequest,
  PromptResponse,
  ReadTextFileRequest,
  ReadTextFileResponse,
  SessionNotification,
  WriteTextFileRequest,
  WriteTextFileResponse,
} from "@agentclientprotocol/sdk";
import { Logger } from "@/utils/logger.js";

export interface BaseSession {
  notificationHistory: SessionNotification[];
  cancelled: boolean;
  interruptReason?: string;
  abortController: AbortController;
}

export abstract class BaseAcpAgent implements Agent {
  abstract readonly adapterName: string;
  protected session: BaseSession | null = null;
  protected sessionId: string | null = null;
  client: AgentSideConnection;
  protected logger: Logger;
  protected fileContentCache: { [key: string]: string } = {};

  constructor(client: AgentSideConnection) {
    this.client = client;
    this.logger = new Logger({ debug: true, prefix: "[BaseAcpAgent]" });
  }

  abstract initialize(request: InitializeRequest): Promise<InitializeResponse>;
  abstract newSession(params: NewSessionRequest): Promise<NewSessionResponse>;
  abstract prompt(params: PromptRequest): Promise<PromptResponse>;
  protected abstract interruptSession(): Promise<void>;

  async cancel(params: CancelNotification): Promise<void> {
    if (this.sessionId !== params.sessionId || !this.session) {
      throw new Error("Session not found");
    }
    this.session.cancelled = true;
    const meta = params._meta as { interruptReason?: string } | undefined;
    if (meta?.interruptReason) {
      this.session.interruptReason = meta.interruptReason;
    }
    await this.interruptSession();
  }

  async closeSession(): Promise<void> {
    if (!this.session || !this.sessionId) {
      return;
    }
    try {
      await this.cancel({ sessionId: this.sessionId });
      this.session.abortController.abort();
      this.logger.info("Closed session", { sessionId: this.sessionId });
    } catch (err) {
      this.logger.warn("Failed to close session", {
        sessionId: this.sessionId,
        error: err,
      });
    }
    this.session = null;
    this.sessionId = null;
  }

  hasSession(sessionId: string): boolean {
    return this.sessionId === sessionId && this.session !== null;
  }

  appendNotification(
    sessionId: string,
    notification: SessionNotification,
  ): void {
    if (this.sessionId === sessionId && this.session) {
      this.session.notificationHistory.push(notification);
    }
  }

  async readTextFile(
    params: ReadTextFileRequest,
  ): Promise<ReadTextFileResponse> {
    const response = await this.client.readTextFile(params);
    if (!params.limit && !params.line) {
      this.fileContentCache[params.path] = response.content;
    }
    return response;
  }

  async writeTextFile(
    params: WriteTextFileRequest,
  ): Promise<WriteTextFileResponse> {
    const response = await this.client.writeTextFile(params);
    this.fileContentCache[params.path] = params.content;
    return response;
  }

  async authenticate(_params: AuthenticateRequest): Promise<void> {
    throw new Error("Method not implemented.");
  }
}
