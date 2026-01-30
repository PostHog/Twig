import type { SagaLogger } from "@posthog/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PostHogAPIClient } from "../../posthog-api.js";
import {
  createMockApiClient,
  createMockLogger,
  createTestRepo,
  type TestRepo,
} from "../../sagas/test-fixtures.js";
import { type CloudClientFactory, InitAcpSaga } from "./init-acp-saga.js";

vi.mock("../../adapters/acp-connection.js", () => ({
  createAcpConnection: vi.fn(() => ({
    clientStreams: {
      readable: new ReadableStream(),
      writable: new WritableStream(),
    },
    agentConnection: {},
    cleanup: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("@agentclientprotocol/sdk", () => ({
  ClientSideConnection: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue({}),
    newSession: vi.fn().mockResolvedValue({}),
    prompt: vi.fn().mockResolvedValue({ stopReason: "end_turn" }),
    cancel: vi.fn().mockResolvedValue({}),
  })),
  ndJsonStream: vi.fn().mockReturnValue({}),
  PROTOCOL_VERSION: "1.0",
}));

describe("InitAcpSaga", () => {
  let repo: TestRepo;
  let mockLogger: SagaLogger;
  let mockApiClient: PostHogAPIClient;
  let originalEnv: Record<string, string | undefined>;

  beforeEach(async () => {
    repo = await createTestRepo("init-acp-saga");
    mockLogger = createMockLogger();
    mockApiClient = createMockApiClient();

    originalEnv = {
      POSTHOG_API_KEY: process.env.POSTHOG_API_KEY,
      POSTHOG_API_HOST: process.env.POSTHOG_API_HOST,
      POSTHOG_AUTH_HEADER: process.env.POSTHOG_AUTH_HEADER,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN,
      ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
    };
  });

  afterEach(async () => {
    await repo.cleanup();

    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  const createInput = () => ({
    config: {
      apiUrl: "http://localhost:8000",
      apiKey: "test-api-key",
      projectId: 1,
      taskId: "task-1",
      runId: "run-1",
      repositoryPath: repo.path,
    },
    apiClient: mockApiClient,
  });

  describe("successful initialization", () => {
    it("completes all steps successfully", async () => {
      const saga = new InitAcpSaga(mockLogger);
      const result = await saga.run(createInput());

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.acpConnection).toBeDefined();
      expect(result.data.clientConnection).toBeDefined();
      expect(result.data.treeTracker).toBeDefined();
      expect(result.data.originalEnv).toBeDefined();
    });

    it("configures environment variables", async () => {
      const saga = new InitAcpSaga(mockLogger);
      const input = createInput();

      await saga.run(input);

      expect(process.env.POSTHOG_API_KEY).toBe(input.config.apiKey);
      expect(process.env.POSTHOG_API_HOST).toBe(input.config.apiUrl);
      expect(process.env.ANTHROPIC_API_KEY).toBe(input.config.apiKey);
    });

    it("stores original environment for rollback", async () => {
      process.env.POSTHOG_API_KEY = "original-key";

      const saga = new InitAcpSaga(mockLogger);
      const result = await saga.run(createInput());

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.originalEnv.POSTHOG_API_KEY).toBe("original-key");
    });

    it("creates tree tracker with correct config", async () => {
      const saga = new InitAcpSaga(mockLogger);
      const input = createInput();
      const result = await saga.run(input);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.treeTracker).toBeDefined();
      expect(result.data.treeTracker.getLastTreeHash()).toBeNull();
    });

    it("uses custom cloud client factory when provided", async () => {
      const mockCloudClient = {
        requestPermission: vi.fn().mockResolvedValue({
          outcome: { outcome: "selected", optionId: "allow" },
        }),
        sessionUpdate: vi.fn().mockResolvedValue(undefined),
      };

      const factory: CloudClientFactory = vi
        .fn()
        .mockReturnValue(mockCloudClient);
      const saga = new InitAcpSaga(mockLogger, factory);
      const result = await saga.run(createInput());

      expect(result.success).toBe(true);
      expect(factory).toHaveBeenCalled();
    });
  });

  describe("environment variable rollback", () => {
    it("restores original environment when undefined", async () => {
      delete process.env.POSTHOG_API_KEY;

      const { createAcpConnection } = await import(
        "../../adapters/acp-connection.js"
      );
      (createAcpConnection as ReturnType<typeof vi.fn>).mockImplementationOnce(
        () => {
          throw new Error("ACP creation failed");
        },
      );

      const saga = new InitAcpSaga(mockLogger);
      const result = await saga.run(createInput());

      expect(result.success).toBe(false);
      expect(process.env.POSTHOG_API_KEY).toBeUndefined();
    });

    it("restores original environment when had value", async () => {
      process.env.POSTHOG_API_KEY = "original-key";

      const { createAcpConnection } = await import(
        "../../adapters/acp-connection.js"
      );
      (createAcpConnection as ReturnType<typeof vi.fn>).mockImplementationOnce(
        () => {
          throw new Error("ACP creation failed");
        },
      );

      const saga = new InitAcpSaga(mockLogger);
      const result = await saga.run(createInput());

      expect(result.success).toBe(false);
      expect(process.env.POSTHOG_API_KEY).toBe("original-key");
    });
  });

  describe("failure handling", () => {
    it("fails at create_acp_connection and cleans up env", async () => {
      const { createAcpConnection } = await import(
        "../../adapters/acp-connection.js"
      );
      (createAcpConnection as ReturnType<typeof vi.fn>).mockImplementationOnce(
        () => {
          throw new Error("Connection failed");
        },
      );

      process.env.POSTHOG_API_KEY = "original";
      const saga = new InitAcpSaga(mockLogger);
      const result = await saga.run(createInput());

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.failedStep).toBe("create_acp_connection");
      expect(result.error).toContain("Connection failed");
      expect(process.env.POSTHOG_API_KEY).toBe("original");
    });

    it("cleans up ACP connection on protocol init failure", async () => {
      const mockCleanup = vi.fn().mockResolvedValue(undefined);
      const { createAcpConnection } = await import(
        "../../adapters/acp-connection.js"
      );
      (createAcpConnection as ReturnType<typeof vi.fn>).mockReturnValue({
        clientStreams: {
          readable: new ReadableStream(),
          writable: new WritableStream(),
        },
        agentConnection: {},
        cleanup: mockCleanup,
      });

      const { ClientSideConnection } = await import("@agentclientprotocol/sdk");
      (ClientSideConnection as ReturnType<typeof vi.fn>).mockImplementationOnce(
        () => ({
          initialize: vi.fn().mockRejectedValue(new Error("Protocol error")),
        }),
      );

      const saga = new InitAcpSaga(mockLogger);
      const result = await saga.run(createInput());

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.failedStep).toBe("initialize_protocol");
      expect(mockCleanup).toHaveBeenCalled();
    });
  });

  describe("logging", () => {
    it("logs info messages during initialization", async () => {
      const saga = new InitAcpSaga(mockLogger);
      await saga.run(createInput());

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Configuring environment"),
        expect.any(Object),
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        "ACP connection initialized successfully",
      );
    });

    it("logs debug messages for step execution", async () => {
      const saga = new InitAcpSaga(mockLogger);
      await saga.run(createInput());

      expect(mockLogger.debug).toHaveBeenCalledWith("Creating ACP connection");
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Initializing ACP protocol",
      );
      expect(mockLogger.debug).toHaveBeenCalledWith("Starting ACP session");
    });
  });
});
