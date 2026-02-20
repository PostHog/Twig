import {
  CaptureCheckpointSaga,
  DiffCheckpointSaga,
  RevertCheckpointSaga,
} from "@twig/git/sagas/checkpoint";
import type { Logger } from "./utils/logger.js";

export interface RestoreResult {
  cwd: string;
  success: boolean;
  error?: string;
}

export interface DiffStats {
  linesAdded: number;
  linesRemoved: number;
  filesChanged: string[];
}

export class CheckpointManager {
  private cwds: string[];
  private logger: Logger;

  constructor(cwds: string[], logger: Logger) {
    this.cwds = cwds;
    this.logger = logger;
  }

  capture(checkpointId: string): void {
    for (const cwd of this.cwds) {
      const saga = new CaptureCheckpointSaga();
      saga
        .run({ baseDir: cwd, checkpointId })
        .then((result) => {
          if (result.success) {
            this.logger.info("Checkpoint captured", {
              checkpointId,
              cwd,
              commit: result.data.commit,
            });
          } else {
            this.logger.warn("Checkpoint capture failed", {
              checkpointId,
              cwd,
              error: result.error,
              failedStep: result.failedStep,
            });
          }
        })
        .catch((err) => {
          this.logger.warn("Failed to capture checkpoint", {
            checkpointId,
            cwd,
            error: err,
          });
        });
    }
  }

  async restore(checkpointId: string): Promise<RestoreResult[]> {
    const results: RestoreResult[] = [];

    for (const cwd of this.cwds) {
      const saga = new RevertCheckpointSaga();
      const result = await saga.run({ baseDir: cwd, checkpointId });

      if (result.success) {
        this.logger.info("Checkpoint restored", { checkpointId, cwd });
        results.push({ cwd, success: true });
      } else {
        this.logger.warn("Checkpoint restore failed", {
          checkpointId,
          cwd,
          error: result.error,
          failedStep: result.failedStep,
        });
        results.push({ cwd, success: false, error: result.error });
      }
    }

    return results;
  }

  async diff(checkpointId: string): Promise<DiffStats> {
    let totalAdded = 0;
    let totalRemoved = 0;
    const allFiles = new Set<string>();

    for (const cwd of this.cwds) {
      const saga = new DiffCheckpointSaga();
      const result = await saga.run({
        baseDir: cwd,
        from: checkpointId,
        to: "current",
      });

      if (result.success) {
        const stats = parseDiffStats(result.data.diff);
        totalAdded += stats.linesAdded;
        totalRemoved += stats.linesRemoved;
        for (const file of stats.filesChanged) {
          allFiles.add(file);
        }
      } else {
        this.logger.warn("Checkpoint diff failed", {
          checkpointId,
          cwd,
          error: result.error,
        });
      }
    }

    return {
      linesAdded: totalAdded,
      linesRemoved: totalRemoved,
      filesChanged: Array.from(allFiles),
    };
  }
}

function parseDiffStats(diff: string): DiffStats {
  let linesAdded = 0;
  let linesRemoved = 0;
  const filesChanged = new Set<string>();

  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) {
      const match = line.match(/^[+-]{3} [ab]\/(.+)$/);
      if (match && match[1] !== "/dev/null") {
        filesChanged.add(match[1]);
      }
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      linesAdded++;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      linesRemoved++;
    }
  }

  return {
    linesAdded,
    linesRemoved,
    filesChanged: Array.from(filesChanged),
  };
}
