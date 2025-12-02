import { promises as fs } from "node:fs";
import { extname, join } from "node:path";
import z from "zod";
import type { ResearchEvaluation, SupportingFile } from "./types.js";
import { Logger } from "./utils/logger.js";

export interface TaskFile {
  name: string;
  content: string;
  type: "plan" | "context" | "reference" | "output" | "artifact";
}

export interface LocalArtifact {
  name: string;
  content: string;
  type: TaskFile["type"];
  contentType: string;
  size: number;
}

export class PostHogFileManager {
  private repositoryPath: string;
  private logger: Logger;

  constructor(repositoryPath: string, logger?: Logger) {
    this.repositoryPath = repositoryPath;
    this.logger =
      logger || new Logger({ debug: false, prefix: "[FileManager]" });
  }

  private getTaskDirectory(taskId: string): string {
    return join(this.repositoryPath, ".posthog", taskId);
  }

  private getTaskFilePath(taskId: string, fileName: string): string {
    return join(this.getTaskDirectory(taskId), fileName);
  }

  async ensureTaskDirectory(taskId: string): Promise<void> {
    const taskDir = this.getTaskDirectory(taskId);
    try {
      await fs.access(taskDir);
    } catch {
      await fs.mkdir(taskDir, { recursive: true });
    }
  }

  async writeTaskFile(taskId: string, file: TaskFile): Promise<void> {
    await this.ensureTaskDirectory(taskId);
    const filePath = this.getTaskFilePath(taskId, file.name);

    this.logger.debug("Writing task file", {
      filePath,
      contentLength: file.content.length,
      contentType: typeof file.content,
    });

    await fs.writeFile(filePath, file.content, "utf8");

    this.logger.debug("File written successfully", { filePath });
  }

  async readTaskFile(taskId: string, fileName: string): Promise<string | null> {
    try {
      const filePath = this.getTaskFilePath(taskId, fileName);
      return await fs.readFile(filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async listTaskFiles(taskId: string): Promise<string[]> {
    try {
      const taskDir = this.getTaskDirectory(taskId);
      const files = await fs.readdir(taskDir);
      return files.filter((file) => !file.startsWith("."));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async deleteTaskFile(taskId: string, fileName: string): Promise<void> {
    try {
      const filePath = this.getTaskFilePath(taskId, fileName);
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  async taskDirectoryExists(taskId: string): Promise<boolean> {
    try {
      const taskDir = this.getTaskDirectory(taskId);
      await fs.access(taskDir);
      return true;
    } catch {
      return false;
    }
  }

  async cleanupTaskDirectory(taskId: string): Promise<void> {
    try {
      const taskDir = this.getTaskDirectory(taskId);
      await fs.rm(taskDir, { recursive: true, force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  // Convenience methods for common file types
  async writePlan(taskId: string, plan: string): Promise<void> {
    this.logger.debug("Writing plan", {
      taskId,
      planLength: plan.length,
      contentPreview: plan.substring(0, 200),
    });

    await this.writeTaskFile(taskId, {
      name: "plan.md",
      content: plan,
      type: "plan",
    });

    this.logger.info("Plan file written", { taskId });
  }

  async readPlan(taskId: string): Promise<string | null> {
    return await this.readTaskFile(taskId, "plan.md");
  }

  async writeContext(taskId: string, context: string): Promise<void> {
    await this.writeTaskFile(taskId, {
      name: "context.md",
      content: context,
      type: "context",
    });
  }

  async readContext(taskId: string): Promise<string | null> {
    return await this.readTaskFile(taskId, "context.md");
  }

  async writeRequirements(taskId: string, requirements: string): Promise<void> {
    await this.writeTaskFile(taskId, {
      name: "requirements.md",
      content: requirements,
      type: "reference",
    });
  }

  async readRequirements(taskId: string): Promise<string | null> {
    return await this.readTaskFile(taskId, "requirements.md");
  }

  async writeResearch(taskId: string, data: ResearchEvaluation): Promise<void> {
    this.logger.debug("Writing research", {
      taskId,
      score: data.actionabilityScore,
      hasQuestions: !!data.questions,
      questionCount: data.questions?.length ?? 0,
      answered: data.answered ?? false,
    });

    await this.writeTaskFile(taskId, {
      name: "research.json",
      content: JSON.stringify(data, null, 2),
      type: "artifact",
    });

    this.logger.info("Research file written", {
      taskId,
      score: data.actionabilityScore,
      hasQuestions: !!data.questions,
      answered: data.answered ?? false,
    });
  }

  async readResearch(taskId: string): Promise<ResearchEvaluation | null> {
    try {
      const content = await this.readTaskFile(taskId, "research.json");
      return content ? (JSON.parse(content) as ResearchEvaluation) : null;
    } catch (error) {
      this.logger.debug("Failed to parse research.json", { error });
      return null;
    }
  }

  async writeTodos(taskId: string, data: unknown): Promise<void> {
    const todos = z.object({
      metadata: z.object({
        total: z.number(),
        completed: z.number(),
      }),
    });

    const validatedData = todos.parse(data);
    this.logger.debug("Writing todos", {
      taskId,
      total: validatedData.metadata?.total ?? 0,
      completed: validatedData.metadata?.completed ?? 0,
    });

    await this.writeTaskFile(taskId, {
      name: "todos.json",
      content: JSON.stringify(validatedData, null, 2),
      type: "artifact",
    });

    this.logger.info("Todos file written", {
      taskId,
      total: validatedData.metadata?.total ?? 0,
      completed: validatedData.metadata?.completed ?? 0,
    });
  }

  async readTodos(taskId: string): Promise<unknown | null> {
    try {
      const content = await this.readTaskFile(taskId, "todos.json");
      return content ? JSON.parse(content) : null;
    } catch (error) {
      this.logger.debug("Failed to parse todos.json", { error });
      return null;
    }
  }

  async getTaskFiles(taskId: string): Promise<SupportingFile[]> {
    const fileNames = await this.listTaskFiles(taskId);
    const files: SupportingFile[] = [];

    for (const fileName of fileNames) {
      const content = await this.readTaskFile(taskId, fileName);
      if (content !== null) {
        // Determine type based on file name
        const type = this.resolveFileType(fileName);

        files.push({
          name: fileName,
          content,
          type,
          created_at: new Date().toISOString(), // Could be enhanced with file stats
        });
      }
    }

    return files;
  }

  async collectTaskArtifacts(taskId: string): Promise<LocalArtifact[]> {
    const fileNames = await this.listTaskFiles(taskId);
    const artifacts: LocalArtifact[] = [];

    for (const fileName of fileNames) {
      const content = await this.readTaskFile(taskId, fileName);
      if (content === null) {
        continue;
      }

      const type = this.resolveFileType(fileName);
      const contentType = this.inferContentType(fileName);
      const size = Buffer.byteLength(content, "utf8");

      artifacts.push({
        name: fileName,
        content,
        type,
        contentType,
        size,
      });
    }

    return artifacts;
  }

  private resolveFileType(fileName: string): TaskFile["type"] {
    if (fileName === "plan.md") return "plan";
    if (fileName === "context.md") return "context";
    if (fileName === "requirements.md") return "reference";
    if (fileName.startsWith("output_")) return "output";
    if (fileName.endsWith(".md")) return "reference";
    return "artifact";
  }

  private inferContentType(fileName: string): string {
    const extension = extname(fileName).toLowerCase();
    switch (extension) {
      case ".md":
        return "text/markdown";
      case ".json":
        return "application/json";
      case ".txt":
        return "text/plain";
      default:
        return "text/plain";
    }
  }
}
