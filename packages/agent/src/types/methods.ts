export const AgentMethod = {
  Initialize: "initialize",

  Authenticate: "authenticate",

  Session: {
    New: "session/new",
    Load: "session/load",
    Prompt: "session/prompt",
    Cancel: "session/cancel",
    SetMode: "session/set_mode",
  },
} as const;

/**
 * Client methods - implemented by the client, called by the agent.
 *
 * These are callbacks/handlers your Electron app must provide.
 */
export const ClientMethod = {
  Session: {
    Update: "session/update",
    RequestPermission: "session/request_permission",
  },

  Fs: {
    ReadTextFile: "fs/read_text_file",
    WriteTextFile: "fs/write_text_file",
  },

  Terminal: {
    Create: "terminal/create",
    Output: "terminal/output",
    Kill: "terminal/kill",
    Release: "terminal/release",
    WaitForExit: "terminal/wait_for_exit",
  },
} as const;

export const SessionUpdateKind = {
  UserMessageChunk: "user_message_chunk",
  AgentMessageChunk: "agent_message_chunk",
  AgentThoughtChunk: "agent_thought_chunk",
  ToolCall: "tool_call",
  ToolCallUpdate: "tool_call_update",
  Plan: "plan",
  AvailableCommandsUpdate: "available_commands_update",
  CurrentModeUpdate: "current_mode_update",
} as const;

type Flatten<T> = T extends object
  ? T[keyof T] extends string
    ? T[keyof T]
    : T[keyof T] | Flatten<T[keyof T]>
  : never;

export type AgentMethodType =
  | typeof AgentMethod.Initialize
  | typeof AgentMethod.Authenticate
  | (typeof AgentMethod.Session)[keyof typeof AgentMethod.Session];

export type ClientMethodType =
  | (typeof ClientMethod.Session)[keyof typeof ClientMethod.Session]
  | (typeof ClientMethod.Fs)[keyof typeof ClientMethod.Fs]
  | (typeof ClientMethod.Terminal)[keyof typeof ClientMethod.Terminal];

export type SessionUpdateKindType =
  (typeof SessionUpdateKind)[keyof typeof SessionUpdateKind];
