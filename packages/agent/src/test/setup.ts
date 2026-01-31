import { type SetupServerApi, setupServer } from "msw/node";
import { vi } from "vitest";
import type { PostHogAPIClient } from "../posthog-api.js";
import { AgentServer } from "../server/agent-server.js";
import { SseController } from "./controllers/sse-controller.js";
import {
  createMockApiClient,
  createTaskRun,
  createTestRepo,
  type TestRepo,
} from "./fixtures/api.js";
import {
  type AgentServerConfig,
  createAgentServerConfig,
} from "./fixtures/config.js";
import { createPostHogHandlers } from "./mocks/msw-handlers.js";

export interface TestContext {
  repo: TestRepo;
  sseController: SseController;
  appendLogCalls: unknown[][];
  heartbeatCalls: number[];
  syncRequestCalls: Request[];
  server: SetupServerApi;
  mockApiClient: PostHogAPIClient;
  agentServer: AgentServer;
  config: AgentServerConfig;
  createAgentServer: (overrides?: Partial<AgentServerConfig>) => AgentServer;
  resetSseController: () => SseController;
  cleanup: () => Promise<void>;
}

export interface CreateTestContextOptions {
  configOverrides?: Partial<AgentServerConfig>;
  autoStart?: boolean;
}

export async function createTestContext(
  options: CreateTestContextOptions = {},
): Promise<TestContext> {
  const repo = await createTestRepo("agent-server");
  let sseController = new SseController();
  const appendLogCalls: unknown[][] = [];
  const heartbeatCalls: number[] = [];
  const syncRequestCalls: Request[] = [];

  const mockApiClient = createMockApiClient({
    getTaskRun: vi.fn().mockResolvedValue(createTaskRun({ log_url: "" })),
    fetchTaskRunLogs: vi.fn().mockResolvedValue([]),
    uploadTaskArtifacts: vi
      .fn()
      .mockResolvedValue([{ storage_path: "gs://bucket/test.tar.gz" }]),
  });

  const server = setupServer(
    ...createPostHogHandlers({
      baseUrl: "http://localhost:8000",
      getSseController: () => sseController,
      onAppendLog: (entries) => appendLogCalls.push(entries),
      onHeartbeat: () => heartbeatCalls.push(Date.now()),
      onSyncRequest: (request) => syncRequestCalls.push(request),
      getTaskRun: () => createTaskRun({ log_url: "" }),
    }),
  );

  server.listen({ onUnhandledRequest: "bypass" });

  const config = createAgentServerConfig(repo, {
    apiClient: mockApiClient,
    ...options.configOverrides,
  });

  const agentServer = new AgentServer(config);

  const createAgentServer = (overrides: Partial<AgentServerConfig> = {}) => {
    return new AgentServer({
      ...config,
      ...overrides,
    });
  };

  const resetSseController = () => {
    sseController.close();
    sseController = new SseController();
    return sseController;
  };

  const cleanup = async () => {
    sseController.close();
    server.close();
    await repo.cleanup();
  };

  return {
    repo,
    sseController,
    appendLogCalls,
    heartbeatCalls,
    syncRequestCalls,
    server,
    mockApiClient,
    agentServer,
    config,
    createAgentServer,
    resetSseController,
    cleanup,
  };
}

export {
  expectNoNotification,
  expectNotification,
  findNotification,
  hasNotification,
} from "./assertions.js";
export {
  createMockApiClient,
  createTaskRun,
  createTestRepo,
  type TestRepo,
} from "./fixtures/api.js";
export { createAgentServerConfig } from "./fixtures/config.js";
export {
  createAgentChunk,
  createNotification,
  createStatusNotification,
  createToolCall,
  createToolResult,
  createTreeSnapshotNotification,
  createUserMessage,
} from "./fixtures/notifications.js";
export {
  createErrorResult,
  createInitMessage,
  createMockQuery,
  createSuccessResult,
  type MockQuery,
} from "./mocks/claude-sdk.js";
export { createPostHogHandlers, SseController } from "./mocks/msw-handlers.js";
export {
  waitForArrayLength,
  waitForCallCount,
  waitForCondition,
} from "./wait.js";
