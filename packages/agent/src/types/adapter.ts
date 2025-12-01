import type { Meta, SessionId } from "@/types/base";
import type {
  AgentCapabilities,
  ClientCapabilities,
} from "@/types/capabilities";
import type {
  AuthenticateRequest,
  AuthenticateResponse,
  CreateTerminalRequest,
  CreateTerminalResponse,
  InitializeRequest,
  InitializeResponse,
  KillTerminalRequest,
  KillTerminalResponse,
  LoadSessionRequest,
  LoadSessionResponse,
  NewSessionRequest,
  NewSessionResponse,
  PromptRequest,
  ReadTextFileRequest,
  ReadTextFileResponse,
  ReleaseTerminalRequest,
  ReleaseTerminalResponse,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SetModeRequest,
  SetModeResponse,
  TerminalOutputRequest,
  TerminalOutputResponse,
  WaitForExitRequest,
  WaitForExitResponse,
  WriteTextFileRequest,
  WriteTextFileResponse,
} from "@/types/requests";
import type { SessionUpdate, StopReason } from "@/types/updates";

export type ProviderId = "claude" | (string & {});

export interface ClientHandler {
  requestPermission(
    req: RequestPermissionRequest,
  ): Promise<RequestPermissionResponse>;
  readTextFile(req: ReadTextFileRequest): Promise<ReadTextFileResponse>;
  writeTextFile(req: WriteTextFileRequest): Promise<WriteTextFileResponse>;
  createTerminal(req: CreateTerminalRequest): Promise<CreateTerminalResponse>;
  terminalOutput(req: TerminalOutputRequest): Promise<TerminalOutputResponse>;
  killTerminal(req: KillTerminalRequest): Promise<KillTerminalResponse>;
  releaseTerminal(
    req: ReleaseTerminalRequest,
  ): Promise<ReleaseTerminalResponse>;
  waitForExit(req: WaitForExitRequest): Promise<WaitForExitResponse>;
}

export interface PromptResult {
  stream: AsyncIterable<SessionUpdate>;
  stopReason: Promise<StopReason>;
}

export interface AgentAdapter {
  readonly providerId: ProviderId;
  readonly capabilities: AgentCapabilities;

  initialize(
    req: Omit<InitializeRequest, "method">,
    clientCapabilities: ClientCapabilities,
    clientHandler: Partial<ClientHandler>,
  ): Promise<Omit<InitializeResponse, "_meta">>;

  authenticate(
    req: Omit<AuthenticateRequest, "method">,
  ): Promise<Omit<AuthenticateResponse, "_meta">>;

  newSession(
    req: Omit<NewSessionRequest, "method">,
  ): Promise<Omit<NewSessionResponse, "_meta">>;

  loadSession(
    req: Omit<LoadSessionRequest, "method">,
  ): Promise<Omit<LoadSessionResponse, "_meta">>;

  prompt(req: Omit<PromptRequest, "method">): PromptResult;

  cancel(sessionId: SessionId): void;

  setMode(
    req: Omit<SetModeRequest, "method">,
  ): Promise<Omit<SetModeResponse, "_meta">>;

  dispose(): Promise<void>;

  _meta?: Meta;
}

export class AdapterError extends Error {
  constructor(
    message: string,
    public code: string,
    public data?: unknown,
  ) {
    super(message);
    this.name = "AdapterError";
  }
}
