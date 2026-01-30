import type { Query, SDKMessage, SDKResultSuccess } from "@anthropic-ai/claude-agent-sdk";
import { vi } from "vitest";

export interface MockQuery extends Query {
  _mockHelpers: {
    sendMessage: (message: SDKMessage) => void;
    complete: (result?: SDKResultSuccess) => void;
    simulateError: (error: Error) => void;
    queueError: (error: Error) => void;
  };
}

export function createMockQuery(): MockQuery {
  let resolveNext: ((value: IteratorResult<SDKMessage, void>) => void) | null = null;
  let rejectNext: ((error: Error) => void) | null = null;
  let isDone = false;
  let queuedError: Error | null = null;

  const createNextPromise = (): Promise<IteratorResult<SDKMessage, void>> => {
    if (isDone) {
      return Promise.resolve({ value: undefined, done: true as const });
    }
    if (queuedError) {
      const error = queuedError;
      queuedError = null;
      return Promise.reject(error);
    }
    return new Promise((resolve, reject) => {
      resolveNext = resolve;
      rejectNext = reject;
    });
  };

  const mockQuery: MockQuery = {
    next: vi.fn(() => createNextPromise()),
    return: vi.fn(() => {
      isDone = true;
      return Promise.resolve({ value: undefined, done: true as const });
    }),
    throw: vi.fn((error: Error) => {
      isDone = true;
      return Promise.reject(error);
    }),
    [Symbol.asyncIterator]() {
      return this;
    },
    interrupt: vi.fn().mockResolvedValue(undefined),
    setPermissionMode: vi.fn().mockResolvedValue(undefined),
    setModel: vi.fn().mockResolvedValue(undefined),
    setMaxThinkingTokens: vi.fn().mockResolvedValue(undefined),
    supportedCommands: vi.fn().mockResolvedValue([]),
    supportedModels: vi.fn().mockResolvedValue([]),
    mcpServerStatus: vi.fn().mockResolvedValue([]),
    accountInfo: vi.fn().mockResolvedValue({}),
    rewindFiles: vi.fn().mockResolvedValue({ canRewind: false }),
    setMcpServers: vi.fn().mockResolvedValue({ added: [], removed: [], errors: {} }),
    streamInput: vi.fn().mockResolvedValue(undefined),
    [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
    _mockHelpers: {
      sendMessage(message: SDKMessage) {
        if (resolveNext) {
          resolveNext({ value: message, done: false });
          resolveNext = null;
          rejectNext = null;
        }
      },
      complete(result?: SDKResultSuccess) {
        isDone = true;
        if (resolveNext) {
          if (result) {
            resolveNext({ value: result, done: false });
          } else {
            resolveNext({ value: undefined, done: true });
          }
          resolveNext = null;
          rejectNext = null;
        }
      },
      simulateError(error: Error) {
        if (rejectNext) {
          rejectNext(error);
          resolveNext = null;
          rejectNext = null;
        }
      },
      queueError(error: Error) {
        queuedError = error;
      },
    },
  };

  return mockQuery;
}

export function createSuccessResult(
  overrides: Partial<SDKResultSuccess> = {},
): SDKResultSuccess {
  return {
    type: "result",
    subtype: "success",
    duration_ms: 100,
    duration_api_ms: 50,
    is_error: false,
    num_turns: 1,
    result: "Done",
    total_cost_usd: 0.01,
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 },
      server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 },
      service_tier: "standard",
    },
    modelUsage: {},
    permission_denials: [],
    uuid: crypto.randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
    session_id: "test-session",
    ...overrides,
  };
}
