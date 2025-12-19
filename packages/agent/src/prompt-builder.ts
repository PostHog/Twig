import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { TemplateVariables } from "./template-manager.js";
import type {
  PostHogResource,
  ResourceType,
  SupportingFile,
  Task,
  UrlMention,
} from "./types.js";
import { Logger } from "./utils/logger.js";

export interface PromptBuilderDeps {
  getTaskFiles: (taskId: string) => Promise<SupportingFile[]>;
  generatePlanTemplate: (vars: TemplateVariables) => Promise<string>;
  posthogClient?: {
    fetchResourceByUrl: (mention: UrlMention) => Promise<PostHogResource>;
  };
  logger?: Logger;
}

export class PromptBuilder {
  private getTaskFiles: PromptBuilderDeps["getTaskFiles"];
  private generatePlanTemplate: PromptBuilderDeps["generatePlanTemplate"];
  private posthogClient?: PromptBuilderDeps["posthogClient"];
  private logger: Logger;

  constructor(deps: PromptBuilderDeps) {
    this.getTaskFiles = deps.getTaskFiles;
    this.generatePlanTemplate = deps.generatePlanTemplate;
    this.posthogClient = deps.posthogClient;
    this.logger =
      deps.logger || new Logger({ debug: false, prefix: "[PromptBuilder]" });
  }

  /**
   * Extract file paths from XML tags in description
   * Format: <file path="relative/path.ts" />
   */
  private extractFilePaths(description: string): string[] {
    const fileTagRegex = /<file\s+path="([^"]+)"\s*\/>/g;
    const paths: string[] = [];
    let match: RegExpExecArray | null;

    match = fileTagRegex.exec(description);
    while (match !== null) {
      paths.push(match[1]);
      match = fileTagRegex.exec(description);
    }

    return paths;
  }

  /**
   * Read file contents from repository
   */
  private async readFileContent(
    repositoryPath: string,
    filePath: string,
  ): Promise<string | null> {
    try {
      const fullPath = join(repositoryPath, filePath);
      const content = await fs.readFile(fullPath, "utf8");
      return content;
    } catch (error) {
      this.logger.warn(`Failed to read referenced file: ${filePath}`, {
        error,
      });
      return null;
    }
  }

  /**
   * Extract URL mentions from XML tags in description
   * Formats: <error id="..." />, <experiment id="..." />, <url href="..." />
   */
  private extractUrlMentions(description: string): UrlMention[] {
    const mentions: UrlMention[] = [];

    // PostHog resource mentions: <error id="..." />, <experiment id="..." />, etc.
    const resourceRegex =
      /<(error|experiment|insight|feature_flag)\s+id="([^"]+)"\s*\/>/g;
    let match: RegExpExecArray | null;

    match = resourceRegex.exec(description);
    while (match !== null) {
      const [, type, id] = match;
      mentions.push({
        url: "", // Will be reconstructed if needed
        type: type as ResourceType,
        id,
        label: this.generateUrlLabel("", type as ResourceType),
      });
      match = resourceRegex.exec(description);
    }

    // Generic URL mentions: <url href="..." />
    const urlRegex = /<url\s+href="([^"]+)"\s*\/>/g;
    match = urlRegex.exec(description);
    while (match !== null) {
      const [, url] = match;
      mentions.push({
        url,
        type: "generic",
        label: this.generateUrlLabel(url, "generic"),
      });
      match = urlRegex.exec(description);
    }

    return mentions;
  }

  /**
   * Generate a display label for a URL mention
   */
  private generateUrlLabel(url: string, type: string): string {
    try {
      const urlObj = new URL(url);
      switch (type) {
        case "error": {
          const errorMatch = url.match(/error_tracking\/([a-f0-9-]+)/);
          return errorMatch ? `Error ${errorMatch[1].slice(0, 8)}...` : "Error";
        }
        case "experiment": {
          const expMatch = url.match(/experiments\/(\d+)/);
          return expMatch ? `Experiment #${expMatch[1]}` : "Experiment";
        }
        case "insight":
          return "Insight";
        case "feature_flag":
          return "Feature Flag";
        default:
          return urlObj.hostname;
      }
    } catch {
      return "URL";
    }
  }

  /**
   * Process URL references and fetch their content
   */
  private async processUrlReferences(
    description: string,
  ): Promise<{ description: string; referencedResources: PostHogResource[] }> {
    const urlMentions = this.extractUrlMentions(description);
    const referencedResources: PostHogResource[] = [];

    if (urlMentions.length === 0 || !this.posthogClient) {
      return { description, referencedResources };
    }

    // Fetch all referenced resources
    for (const mention of urlMentions) {
      try {
        const resource = await this.posthogClient.fetchResourceByUrl(mention);
        referencedResources.push(resource);
      } catch (error) {
        this.logger.warn(`Failed to fetch resource from URL: ${mention.url}`, {
          error,
        });
        // Add a placeholder resource for failed fetches
        referencedResources.push({
          type: mention.type,
          id: mention.id || "",
          url: mention.url,
          title: mention.label || "Unknown Resource",
          content: `Failed to fetch resource from ${mention.url}: ${error}`,
          metadata: {},
        });
      }
    }

    // Replace URL tags with just the label for readability
    let processedDescription = description;
    for (const mention of urlMentions) {
      if (mention.type === "generic") {
        // Generic URLs: <url href="..." />
        const escapedUrl = mention.url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        processedDescription = processedDescription.replace(
          new RegExp(`<url\\s+href="${escapedUrl}"\\s*/>`, "g"),
          `@${mention.label}`,
        );
      } else {
        // PostHog resources: <error id="..." />, <experiment id="..." />, etc.
        const escapedType = mention.type.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const escapedId = mention.id
          ? mention.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
          : "";
        processedDescription = processedDescription.replace(
          new RegExp(`<${escapedType}\\s+id="${escapedId}"\\s*/>`, "g"),
          `@${mention.label}`,
        );
      }
    }

    return { description: processedDescription, referencedResources };
  }

  /**
   * Process description to extract file tags and read contents
   * Returns processed description and referenced file contents
   */
  private async processFileReferences(
    description: string,
    repositoryPath?: string,
  ): Promise<{
    description: string;
    referencedFiles: Array<{ path: string; content: string }>;
  }> {
    const filePaths = this.extractFilePaths(description);
    const referencedFiles: Array<{ path: string; content: string }> = [];

    if (filePaths.length === 0 || !repositoryPath) {
      return { description, referencedFiles };
    }

    // Read all referenced files, tracking which ones succeed
    const successfulPaths = new Set<string>();
    for (const filePath of filePaths) {
      const content = await this.readFileContent(repositoryPath, filePath);
      if (content !== null) {
        referencedFiles.push({ path: filePath, content });
        successfulPaths.add(filePath);
      }
    }

    // Only replace tags for files that were successfully read
    let processedDescription = description;
    for (const filePath of successfulPaths) {
      const fileName = filePath.split("/").pop() || filePath;
      processedDescription = processedDescription.replace(
        new RegExp(
          `<file\\s+path="${filePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*/>`,
          "g",
        ),
        `@${fileName}`,
      );
    }

    return { description: processedDescription, referencedFiles };
  }

  async buildResearchPrompt(
    task: Task,
    repositoryPath?: string,
  ): Promise<string> {
    // Process file references in description
    const { description: descriptionAfterFiles, referencedFiles } =
      await this.processFileReferences(task.description, repositoryPath);

    // Process URL references in description
    const { description: processedDescription, referencedResources } =
      await this.processUrlReferences(descriptionAfterFiles);

    let prompt = "<task>\n";
    prompt += `<title>${task.title}</title>\n`;
    prompt += `<description>${processedDescription}</description>\n`;

    if (task.repository) {
      prompt += `<repository>${task.repository}</repository>\n`;
    }
    prompt += "</task>\n";

    // Add referenced files from @ mentions
    if (referencedFiles.length > 0) {
      prompt += "\n<referenced_files>\n";
      for (const file of referencedFiles) {
        prompt += `<file path="${file.path}">\n\`\`\`\n${file.content}\n\`\`\`\n</file>\n`;
      }
      prompt += "</referenced_files>\n";
    }

    // Add referenced resources from URL mentions
    if (referencedResources.length > 0) {
      prompt += "\n<referenced_resources>\n";
      for (const resource of referencedResources) {
        prompt += `<resource type="${resource.type}" url="${resource.url}">\n`;
        prompt += `<title>${resource.title}</title>\n`;
        prompt += `<content>${resource.content}</content>\n`;
        prompt += "</resource>\n";
      }
      prompt += "</referenced_resources>\n";
    }

    try {
      const taskFiles = await this.getTaskFiles(task.id);
      const contextFiles = taskFiles.filter(
        (f: SupportingFile) => f.type === "context" || f.type === "reference",
      );
      if (contextFiles.length > 0) {
        prompt += "\n<supporting_files>\n";
        for (const file of contextFiles) {
          prompt += `<file name="${file.name}" type="${file.type}">\n${file.content}\n</file>\n`;
        }
        prompt += "</supporting_files>\n";
      }
    } catch (_error) {
      this.logger.debug("No existing task files found for research", {
        taskId: task.id,
      });
    }

    return prompt;
  }

  async buildPlanningPrompt(
    task: Task,
    repositoryPath?: string,
  ): Promise<string> {
    // Process file references in description
    const { description: descriptionAfterFiles, referencedFiles } =
      await this.processFileReferences(task.description, repositoryPath);

    // Process URL references in description
    const { description: processedDescription, referencedResources } =
      await this.processUrlReferences(descriptionAfterFiles);

    let prompt = "<task>\n";
    prompt += `<title>${task.title}</title>\n`;
    prompt += `<description>${processedDescription}</description>\n`;

    if (task.repository) {
      prompt += `<repository>${task.repository}</repository>\n`;
    }
    prompt += "</task>\n";

    // Add referenced files from @ mentions
    if (referencedFiles.length > 0) {
      prompt += "\n<referenced_files>\n";
      for (const file of referencedFiles) {
        prompt += `<file path="${file.path}">\n\`\`\`\n${file.content}\n\`\`\`\n</file>\n`;
      }
      prompt += "</referenced_files>\n";
    }

    // Add referenced resources from URL mentions
    if (referencedResources.length > 0) {
      prompt += "\n<referenced_resources>\n";
      for (const resource of referencedResources) {
        prompt += `<resource type="${resource.type}" url="${resource.url}">\n`;
        prompt += `<title>${resource.title}</title>\n`;
        prompt += `<content>${resource.content}</content>\n`;
        prompt += "</resource>\n";
      }
      prompt += "</referenced_resources>\n";
    }

    try {
      const taskFiles = await this.getTaskFiles(task.id);
      const contextFiles = taskFiles.filter(
        (f: SupportingFile) => f.type === "context" || f.type === "reference",
      );
      if (contextFiles.length > 0) {
        prompt += "\n<supporting_files>\n";
        for (const file of contextFiles) {
          prompt += `<file name="${file.name}" type="${file.type}">\n${file.content}\n</file>\n`;
        }
        prompt += "</supporting_files>\n";
      }
    } catch (_error) {
      this.logger.debug("No existing task files found for planning", {
        taskId: task.id,
      });
    }

    const templateVariables = {
      task_id: task.id,
      task_title: task.title,
      task_description: processedDescription,
      date: new Date().toISOString().split("T")[0],
      repository: task.repository || "",
    };

    const planTemplate = await this.generatePlanTemplate(templateVariables);

    prompt += "\n<instructions>\n";
    prompt +=
      "Analyze the codebase and create a detailed implementation plan. Use the template structure below, filling each section with specific, actionable information.\n";
    prompt += "</instructions>\n\n";
    prompt += "<plan_template>\n";
    prompt += planTemplate;
    prompt += "\n</plan_template>";

    return prompt;
  }

  async buildExecutionPrompt(
    task: Task,
    repositoryPath?: string,
  ): Promise<string> {
    // Process file references in description
    const { description: descriptionAfterFiles, referencedFiles } =
      await this.processFileReferences(task.description, repositoryPath);

    // Process URL references in description
    const { description: processedDescription, referencedResources } =
      await this.processUrlReferences(descriptionAfterFiles);

    let prompt = "<task>\n";
    prompt += `<title>${task.title}</title>\n`;
    prompt += `<description>${processedDescription}</description>\n`;

    if (task.repository) {
      prompt += `<repository>${task.repository}</repository>\n`;
    }
    prompt += "</task>\n";

    // Add referenced files from @ mentions
    if (referencedFiles.length > 0) {
      prompt += "\n<referenced_files>\n";
      for (const file of referencedFiles) {
        prompt += `<file path="${file.path}">\n\`\`\`\n${file.content}\n\`\`\`\n</file>\n`;
      }
      prompt += "</referenced_files>\n";
    }

    // Add referenced resources from URL mentions
    if (referencedResources.length > 0) {
      prompt += "\n<referenced_resources>\n";
      for (const resource of referencedResources) {
        prompt += `<resource type="${resource.type}" url="${resource.url}">\n`;
        prompt += `<title>${resource.title}</title>\n`;
        prompt += `<content>${resource.content}</content>\n`;
        prompt += "</resource>\n";
      }
      prompt += "</referenced_resources>\n";
    }

    try {
      const taskFiles = await this.getTaskFiles(task.id);
      const hasPlan = taskFiles.some((f: SupportingFile) => f.type === "plan");
      const todosFile = taskFiles.find(
        (f: SupportingFile) => f.name === "todos.json",
      );

      if (taskFiles.length > 0) {
        prompt += "\n<context>\n";
        for (const file of taskFiles) {
          if (file.type === "plan") {
            prompt += `<plan>\n${file.content}\n</plan>\n`;
          } else if (file.name === "todos.json") {
          } else {
            prompt += `<file name="${file.name}" type="${file.type}">\n${file.content}\n</file>\n`;
          }
        }
        prompt += "</context>\n";
      }

      // Add todos context if resuming work
      if (todosFile) {
        try {
          const todos = JSON.parse(todosFile.content);
          if (todos.items && todos.items.length > 0) {
            prompt += "\n<previous_todos>\n";
            prompt +=
              "You previously created the following todo list for this task:\n\n";
            for (const item of todos.items) {
              const statusIcon =
                item.status === "completed"
                  ? "✓"
                  : item.status === "in_progress"
                    ? "▶"
                    : "○";
              prompt += `${statusIcon} [${item.status}] ${item.content}\n`;
            }
            prompt += `\nProgress: ${todos.metadata.completed}/${todos.metadata.total} completed\n`;
            prompt +=
              "\nYou can reference this list when resuming work or create an updated list as needed.\n";
            prompt += "</previous_todos>\n";
          }
        } catch (error) {
          this.logger.debug("Failed to parse todos.json for context", {
            error,
          });
        }
      }

      prompt += "\n<instructions>\n";
      if (hasPlan) {
        prompt +=
          "Implement the changes described in the execution plan. Follow the plan step-by-step and make the necessary file modifications.\n";
      } else {
        prompt +=
          "Implement the changes described in the task. Make the necessary file modifications to complete the task.\n";
      }
      prompt += "</instructions>";
    } catch (_error) {
      this.logger.debug("No supporting files found for execution", {
        taskId: task.id,
      });
      prompt += "\n<instructions>\n";
      prompt += "Implement the changes described in the task.\n";
      prompt += "</instructions>";
    }

    return prompt;
  }
}
