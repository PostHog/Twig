import type { SagaLogger } from "@posthog/shared";
import { Saga } from "@posthog/shared";
import type { InProcessAcpConnection } from "../../adapters/acp-connection.js";
import type { TreeTracker } from "../../tree-tracker.js";
import type { DeviceInfo, TreeSnapshotEvent } from "../../types.js";

export interface ShutdownInput {
  interrupted?: boolean;
}

export interface ShutdownDependencies {
  treeTracker: TreeTracker | null;
  acpConnection: InProcessAcpConnection | null;
  sseAbortController: AbortController | null;
  deviceInfo: DeviceInfo;
  onTreeSnapshot?: (snapshot: TreeSnapshotEvent) => Promise<void>;
}

export interface ShutdownOutput {
  treeCaptured: boolean;
  finalTreeHash: string | null;
}

export class ShutdownSaga extends Saga<ShutdownInput, ShutdownOutput> {
  private deps: ShutdownDependencies;

  constructor(logger: SagaLogger | undefined, deps: ShutdownDependencies) {
    super(logger);
    this.deps = deps;
  }

  protected async execute(input: ShutdownInput): Promise<ShutdownOutput> {
    let treeCaptured = false;
    let finalTreeHash: string | null = null;

    // Step 1: Capture final tree state (best effort - no rollback)
    if (this.deps.treeTracker) {
      const result = await this.readOnlyStep("capture_final_tree", async () => {
        try {
          const snapshot = await this.deps.treeTracker?.captureTree({
            interrupted: input.interrupted,
          });

          if (snapshot) {
            const snapshotWithDevice: TreeSnapshotEvent = {
              ...snapshot,
              device: this.deps.deviceInfo,
            };

            if (this.deps.onTreeSnapshot) {
              await this.deps.onTreeSnapshot(snapshotWithDevice);
            }

            this.log.info("Final tree state captured", {
              treeHash: snapshot.treeHash,
              changesCount: snapshot.changes.length,
              interrupted: input.interrupted,
            });

            return { captured: true, treeHash: snapshot.treeHash };
          }

          return { captured: false, treeHash: null };
        } catch (error) {
          this.log.warn("Failed to capture final tree state", {
            error: error instanceof Error ? error.message : String(error),
          });
          return { captured: false, treeHash: null };
        }
      });

      treeCaptured = result.captured;
      finalTreeHash = result.treeHash;
    }

    // Step 2: Cleanup ACP connection (best effort - no rollback)
    if (this.deps.acpConnection) {
      await this.readOnlyStep("cleanup_acp", async () => {
        try {
          await this.deps.acpConnection?.cleanup();
          this.log.debug("ACP connection cleaned up");
        } catch (error) {
          this.log.warn("Failed to cleanup ACP connection", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    }

    // Step 3: Abort SSE connection (best effort - no rollback)
    if (this.deps.sseAbortController) {
      await this.readOnlyStep("abort_sse", async () => {
        this.deps.sseAbortController?.abort();
        this.log.debug("SSE connection aborted");
      });
    }

    this.log.info("Shutdown completed");

    return {
      treeCaptured,
      finalTreeHash,
    };
  }
}
