import {
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
} from "@agentclientprotocol/sdk";
import { Saga, type SagaLogger } from "@posthog/shared";
import {
  createAcpConnection,
  type InProcessAcpConnection,
} from "../../adapters/acp-connection.js";
import type { PostHogAPIClient } from "../../posthog-api.js";
import { TreeTracker } from "../../tree-tracker.js";
import { getLlmGatewayUrl } from "../../utils/gateway.js";
import { Logger } from "../../utils/logger.js";

export interface InitAcpInput {
  config: {
    apiUrl: string;
    apiKey: string;
    projectId: number;
    taskId: string;
    runId: string;
    repositoryPath: string;
  };
  apiClient: PostHogAPIClient;
}

export interface InitAcpOutput {
  acpConnection: InProcessAcpConnection;
  clientConnection: ClientSideConnection;
  treeTracker: TreeTracker;
  originalEnv: Record<string, string | undefined>;
}

export interface CloudClient {
  requestPermission(params: {
    options: Array<{ kind: string; optionId: string }>;
  }): Promise<{ outcome: { outcome: "selected"; optionId: string } }>;
  sessionUpdate(params: {
    sessionId: string;
    update?: Record<string, unknown>;
  }): Promise<void>;
}

export type CloudClientFactory = (params: {
  config: InitAcpInput["config"];
  treeTracker: TreeTracker;
}) => CloudClient;

export class InitAcpSaga extends Saga<InitAcpInput, InitAcpOutput> {
  private cloudClientFactory?: CloudClientFactory;

  constructor(logger?: SagaLogger, cloudClientFactory?: CloudClientFactory) {
    super(logger);
    this.cloudClientFactory = cloudClientFactory;
  }

  protected async execute(input: InitAcpInput): Promise<InitAcpOutput> {
    const { config, apiClient } = input;

    // Step 1: Configure environment (with rollback to restore original values)
    const originalEnv = await this.step({
      name: "configure_environment",
      execute: async () => {
        const gatewayUrl =
          process.env.LLM_GATEWAY_URL || getLlmGatewayUrl(config.apiUrl);
        this.log.info("Configuring environment", { gatewayUrl });

        const original: Record<string, string | undefined> = {
          POSTHOG_API_KEY: process.env.POSTHOG_API_KEY,
          POSTHOG_API_HOST: process.env.POSTHOG_API_HOST,
          POSTHOG_AUTH_HEADER: process.env.POSTHOG_AUTH_HEADER,
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
          ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN,
          ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
        };

        const envOverrides = {
          POSTHOG_API_KEY: config.apiKey,
          POSTHOG_API_HOST: config.apiUrl,
          POSTHOG_AUTH_HEADER: `Bearer ${config.apiKey}`,
          ANTHROPIC_API_KEY: config.apiKey,
          ANTHROPIC_AUTH_TOKEN: config.apiKey,
          ANTHROPIC_BASE_URL: gatewayUrl,
        };
        Object.assign(process.env, envOverrides);

        return original;
      },
      rollback: async (original) => {
        this.log.debug("Restoring original environment");
        for (const [key, value] of Object.entries(original)) {
          if (value === undefined) {
            delete process.env[key];
          } else {
            process.env[key] = value;
          }
        }
      },
    });

    // Step 2: Create tree tracker (no rollback needed - just in-memory object)
    const treeTracker = await this.readOnlyStep("create_tree_tracker", () =>
      Promise.resolve(
        new TreeTracker({
          repositoryPath: config.repositoryPath,
          taskId: config.taskId,
          runId: config.runId,
          apiClient,
          logger: new Logger({ debug: true, prefix: "[TreeTracker]" }),
        }),
      ),
    );

    // Step 3: Create ACP connection (with rollback to cleanup)
    const acpConnection = await this.step({
      name: "create_acp_connection",
      execute: async () => {
        this.log.debug("Creating ACP connection");
        return createAcpConnection({
          sessionId: config.runId,
          taskId: config.taskId,
        });
      },
      rollback: async (conn) => {
        this.log.debug("Cleaning up ACP connection");
        await conn.cleanup();
      },
    });

    // Step 4: Create client connection (no rollback - uses streams from ACP)
    const clientConnection = await this.readOnlyStep(
      "create_client_connection",
      async () => {
        const clientStream = ndJsonStream(
          acpConnection.clientStreams.writable,
          acpConnection.clientStreams.readable,
        );

        const cloudClient = this.cloudClientFactory
          ? this.cloudClientFactory({ config, treeTracker })
          : this.createDefaultCloudClient();

        return new ClientSideConnection((_agent) => cloudClient, clientStream);
      },
    );

    // Step 5: Initialize protocol (no rollback - just protocol handshake)
    await this.readOnlyStep("initialize_protocol", async () => {
      this.log.debug("Initializing ACP protocol");
      await clientConnection.initialize({
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {},
      });
    });

    // Step 6: Start session (no rollback - session state is ephemeral)
    await this.readOnlyStep("start_session", async () => {
      this.log.debug("Starting ACP session");
      await clientConnection.newSession({
        cwd: config.repositoryPath,
        mcpServers: [],
        _meta: { sessionId: config.runId },
      });
    });

    this.log.info("ACP connection initialized successfully");

    return {
      acpConnection,
      clientConnection,
      treeTracker,
      originalEnv,
    };
  }

  private createDefaultCloudClient(): CloudClient {
    return {
      async requestPermission(params) {
        const allowOption = params.options.find(
          (o) => o.kind === "allow_once" || o.kind === "allow_always",
        );
        return {
          outcome: {
            outcome: "selected",
            optionId: allowOption?.optionId ?? params.options[0].optionId,
          },
        };
      },
      async sessionUpdate(_params) {
        // Default implementation does nothing - caller should provide factory
      },
    };
  }
}
