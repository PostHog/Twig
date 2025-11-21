import { randomBytes } from "node:crypto";

export interface TaskExecutionState {
  taskId: string;
  status: "running" | "completed" | "failed" | "canceled" | "timeout";
  mode: "plan_only" | "plan_and_build" | "build_only";
  result?: any;
  startedAt: number;
  completedAt?: number;
  abortController?: AbortController;
}

export class TaskManager {
  private executionStates = new Map<string, TaskExecutionState>();
  private defaultTimeout = 10 * 60 * 1000; // 10 minutes

  generateExecutionId(): string {
    return randomBytes(16).toString("hex");
  }

  startExecution(
    taskId: string,
    mode: "plan_only" | "plan_and_build" | "build_only",
    executionId: string = this.generateExecutionId(),
  ): TaskExecutionState {
    const executionState: TaskExecutionState = {
      taskId,
      status: "running",
      mode,
      startedAt: Date.now(),
      abortController: new AbortController(),
    };

    this.executionStates.set(executionId, executionState);
    this.scheduleTimeout(executionId);

    return executionState;
  }

  async waitForCompletion(executionId: string): Promise<any> {
    const execution = this.executionStates.get(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    if (execution.result && execution.status === "completed") {
      return execution.result;
    }

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const currentExecution = this.executionStates.get(executionId);
        if (!currentExecution) {
          clearInterval(checkInterval);
          reject(new Error(`Execution ${executionId} disappeared`));
          return;
        }

        if (
          currentExecution.status === "completed" &&
          currentExecution.result
        ) {
          clearInterval(checkInterval);
          resolve(currentExecution.result);
        } else if (
          currentExecution.status === "failed" ||
          currentExecution.status === "canceled" ||
          currentExecution.status === "timeout"
        ) {
          clearInterval(checkInterval);
          reject(
            new Error(`Execution ${executionId} ${currentExecution.status}`),
          );
        }
      }, 100);
    });
  }

  completeExecution(executionId: string, result: any): void {
    const execution = this.executionStates.get(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    execution.status = "completed";
    execution.result = result;
    execution.completedAt = Date.now();
  }

  failExecution(executionId: string, error: Error): void {
    const execution = this.executionStates.get(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    execution.status = "failed";
    execution.completedAt = Date.now();
    execution.result = {
      error: error.message,
      status: "failed",
    };
  }

  cancelExecution(executionId: string): void {
    const execution = this.executionStates.get(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    execution.status = "canceled";
    execution.completedAt = Date.now();
    execution.abortController?.abort();

    if (!execution.result) {
      execution.result = {
        status: "canceled",
        message: "Execution was canceled",
      };
    }
  }

  getExecution(executionId: string): TaskExecutionState | undefined {
    return this.executionStates.get(executionId);
  }

  getAbortSignal(executionId: string): AbortSignal | undefined {
    return this.executionStates.get(executionId)?.abortController?.signal;
  }

  getAbortController(executionId: string): AbortController | undefined {
    return this.executionStates.get(executionId)?.abortController;
  }

  private scheduleTimeout(
    executionId: string,
    timeout: number = this.defaultTimeout,
  ): void {
    setTimeout(() => {
      const execution = this.executionStates.get(executionId);
      if (execution && execution.status === "running") {
        execution.status = "timeout";
        execution.completedAt = Date.now();
        execution.abortController?.abort();

        if (!execution.result) {
          execution.result = {
            status: "timeout",
            message: "Execution timed out",
          };
        }
      }
    }, timeout);
  }

  cleanup(olderThan: number = 60 * 60 * 1000): void {
    const cutoff = Date.now() - olderThan;
    for (const [executionId, execution] of this.executionStates) {
      if (execution.completedAt && execution.completedAt < cutoff) {
        this.executionStates.delete(executionId);
      }
    }
  }
}
