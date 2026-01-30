import type { ClientSideConnection } from "@agentclientprotocol/sdk";
import { Saga, type SagaLogger } from "@posthog/shared";
import type { InProcessAcpConnection } from "../../adapters/acp-connection.js";
import type { PostHogAPIClient } from "../../posthog-api.js";
import { type ResumeState, resumeFromLog } from "../../resume.js";
import type { TreeTracker } from "../../tree-tracker.js";
import type { DeviceInfo } from "../../types.js";
import { Logger } from "../../utils/logger.js";
import type { AgentServerConfig } from "../types.js";
import {
  type CloudClientFactory,
  type InitAcpOutput,
  InitAcpSaga,
} from "./init-acp-saga.js";

export interface StartupInput {
  config: AgentServerConfig;
  apiClient: PostHogAPIClient;
  deviceInfo: DeviceInfo;
  cloudClientFactory?: CloudClientFactory;
}

export interface StartupOutput {
  acpConnection: InProcessAcpConnection;
  clientConnection: ClientSideConnection;
  treeTracker: TreeTracker;
  sseAbortController: AbortController;
  resumeState: ResumeState | null;
}

export class StartupSaga extends Saga<StartupInput, StartupOutput> {
  private sagaLogger: SagaLogger | undefined;

  constructor(logger?: SagaLogger) {
    super(logger);
    this.sagaLogger = logger;
  }

  protected async execute(input: StartupInput): Promise<StartupOutput> {
    const { config, apiClient, cloudClientFactory } = input;

    // Step 1: Initialize ACP connection (uses nested saga)
    const acpOutput = await this.step<InitAcpOutput>({
      name: "initialize_acp_connection",
      execute: async () => {
        const initSaga = new InitAcpSaga(this.sagaLogger, cloudClientFactory);
        const result = await initSaga.run({
          config: {
            apiUrl: config.apiUrl,
            apiKey: config.apiKey,
            projectId: config.projectId,
            taskId: config.taskId,
            runId: config.runId,
            repositoryPath: config.repositoryPath,
          },
          apiClient,
        });

        if (!result.success) {
          throw new Error(
            `InitAcpSaga failed at ${result.failedStep}: ${result.error}`,
          );
        }

        return result.data;
      },
      rollback: async (output) => {
        this.log.debug("Rolling back ACP connection");
        await output.acpConnection.cleanup();

        // Restore original environment
        for (const [key, value] of Object.entries(output.originalEnv)) {
          if (value === undefined) {
            delete process.env[key];
          } else {
            process.env[key] = value;
          }
        }
      },
    });

    // Step 2: Resume from previous state (read-only - doesn't modify permanent state)
    const resumeState = await this.readOnlyStep(
      "resume_from_state",
      async () => {
        try {
          const state = await resumeFromLog({
            taskId: config.taskId,
            runId: config.runId,
            repositoryPath: config.repositoryPath,
            apiClient,
            logger: new Logger({ debug: true, prefix: "[Resume]" }),
          });

          if (state.latestSnapshot) {
            this.log.info("Resumed from tree snapshot", {
              treeHash: state.latestSnapshot.treeHash,
              changesCount: state.latestSnapshot.changes?.length ?? 0,
              interrupted: state.interrupted,
            });

            acpOutput.treeTracker.setLastTreeHash(
              state.latestSnapshot.treeHash,
            );
          } else {
            this.log.info("No previous state found, starting fresh");
          }

          return state;
        } catch (error) {
          this.log.warn("Failed to resume from previous state", {
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      },
    );

    // Step 3: Create SSE abort controller (with rollback to abort)
    const sseAbortController = await this.step({
      name: "create_sse_controller",
      execute: async () => {
        return new AbortController();
      },
      rollback: async (controller) => {
        this.log.debug("Aborting SSE connection");
        controller.abort();
      },
    });

    this.log.info("Startup completed successfully");

    return {
      acpConnection: acpOutput.acpConnection,
      clientConnection: acpOutput.clientConnection,
      treeTracker: acpOutput.treeTracker,
      sseAbortController,
      resumeState,
    };
  }
}
