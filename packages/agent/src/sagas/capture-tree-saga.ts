import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { Saga } from "@posthog/shared";
import { CaptureTreeSaga as GitCaptureTreeSaga } from "@twig/git/sagas/tree";
import type { PostHogAPIClient } from "../posthog-api.js";
import type { TreeSnapshot } from "../types.js";

export interface CaptureTreeInput {
  repositoryPath: string;
  taskId: string;
  runId: string;
  apiClient?: PostHogAPIClient;
  lastTreeHash: string | null;
  interrupted?: boolean;
}

export interface CaptureTreeOutput {
  snapshot: TreeSnapshot | null;
  newTreeHash: string | null;
}

export class CaptureTreeSaga extends Saga<CaptureTreeInput, CaptureTreeOutput> {
  protected async execute(input: CaptureTreeInput): Promise<CaptureTreeOutput> {
    const {
      repositoryPath,
      lastTreeHash,
      interrupted,
      apiClient,
      taskId,
      runId,
    } = input;
    const tmpDir = join(repositoryPath, ".posthog", "tmp");

    if (existsSync(join(repositoryPath, ".gitmodules"))) {
      this.log.warn(
        "Repository has submodules - snapshot may not capture submodule state",
      );
    }

    const shouldArchive = !!apiClient;
    const archivePath = shouldArchive
      ? join(tmpDir, `tree-${Date.now()}.tar.gz`)
      : undefined;

    const gitCaptureSaga = new GitCaptureTreeSaga();
    const captureResult = await gitCaptureSaga.run({
      baseDir: repositoryPath,
      lastTreeHash,
      archivePath,
    });

    if (!captureResult.success) {
      throw new Error(`Failed to capture tree: ${captureResult.error}`);
    }

    const {
      snapshot: gitSnapshot,
      archivePath: createdArchivePath,
      changed,
    } = captureResult.data;

    if (!changed || !gitSnapshot) {
      this.log.debug("No changes since last capture", { lastTreeHash });
      return { snapshot: null, newTreeHash: lastTreeHash };
    }

    let archiveUrl: string | undefined;
    if (apiClient && createdArchivePath) {
      archiveUrl = await this.uploadArchive(
        createdArchivePath,
        gitSnapshot.treeHash,
        apiClient,
        taskId,
        runId,
      );
      await rm(createdArchivePath, { force: true }).catch(() => {});
    }

    const snapshot: TreeSnapshot = {
      treeHash: gitSnapshot.treeHash,
      baseCommit: gitSnapshot.baseCommit,
      changes: gitSnapshot.changes,
      timestamp: gitSnapshot.timestamp,
      interrupted,
      archiveUrl,
    };

    this.log.info("Tree captured", {
      treeHash: snapshot.treeHash,
      changes: snapshot.changes.length,
      interrupted,
      archiveUrl,
    });

    return { snapshot, newTreeHash: snapshot.treeHash };
  }

  private async uploadArchive(
    archivePath: string,
    treeHash: string,
    apiClient: PostHogAPIClient,
    taskId: string,
    runId: string,
  ): Promise<string | undefined> {
    const archiveUrl = await this.step({
      name: "upload_archive",
      execute: async () => {
        const archiveContent = await readFile(archivePath);
        const base64Content = archiveContent.toString("base64");

        const artifacts = await apiClient.uploadTaskArtifacts(taskId, runId, [
          {
            name: `trees/${treeHash}.tar.gz`,
            type: "tree_snapshot",
            content: base64Content,
            content_type: "application/gzip",
          },
        ]);

        if (artifacts.length > 0 && artifacts[0].storage_path) {
          this.log.info("Tree archive uploaded", {
            storagePath: artifacts[0].storage_path,
            treeHash,
          });
          return artifacts[0].storage_path;
        }

        return undefined;
      },
      rollback: async () => {},
    });

    return archiveUrl;
  }
}
