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
import type { SessionState } from "./types.js";

export interface BaseSession extends SessionState {
  abortController: AbortController;
  interruptReason?: string;
}

export abstract class BaseAcpAgent implements Agent {
  abstract readonly adapterName: string;
  protected sessions: { [key: string]: BaseSession } = {};
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
  abstract cancel(params: CancelNotification): Promise<void>;

  async closeAllSessions(): Promise<void> {
    for (const [sessionId, session] of Object.entries(this.sessions)) {
      try {
        await this.cancel({ sessionId });
        session.abortController.abort();
        this.logger.info("Closed session", { sessionId });
      } catch (err) {
        this.logger.warn("Failed to close session", { sessionId, error: err });
      }
    }
    this.sessions = {};
  }

  appendNotification(
    sessionId: string,
    notification: SessionNotification,
  ): void {
    this.sessions[sessionId]?.notificationHistory.push(notification);
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
