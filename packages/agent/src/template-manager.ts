import { existsSync, promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Logger } from "./utils/logger";

const logger = new Logger({ prefix: "[TemplateManager]" });

export interface TemplateVariables {
  task_id: string;
  task_title: string;
  task_description?: string;
  date: string;
  repository?: string;
  [key: string]: string | undefined;
}

export class TemplateManager {
  private templatesDir: string;

  constructor() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    // Exhaustive list of possible template locations
    const candidateDirs = [
      // Standard build output (dist/src/template-manager.js -> dist/templates)
      join(__dirname, "..", "templates"),

      // If preserveModules creates nested structure (dist/src/template-manager.js -> dist/src/templates)
      join(__dirname, "templates"),

      // Development scenarios (src/template-manager.ts -> src/templates)
      join(__dirname, "..", "..", "src", "templates"),

      // Package root templates directory
      join(__dirname, "..", "..", "templates"),

      // When node_modules symlink or installed (node_modules/@posthog/agent/dist/src/... -> node_modules/@posthog/agent/dist/templates)
      join(__dirname, "..", "..", "dist", "templates"),

      // When consumed from node_modules deep in tree
      join(__dirname, "..", "..", "..", "templates"),
      join(__dirname, "..", "..", "..", "dist", "templates"),
      join(__dirname, "..", "..", "..", "src", "templates"),

      // When bundled by Vite/Webpack (e.g., .vite/build/index.js -> node_modules/@posthog/agent/dist/templates)
      // Try to find node_modules from current location
      join(
        __dirname,
        "..",
        "node_modules",
        "@posthog",
        "agent",
        "dist",
        "templates",
      ),
      join(
        __dirname,
        "..",
        "..",
        "node_modules",
        "@posthog",
        "agent",
        "dist",
        "templates",
      ),
      join(
        __dirname,
        "..",
        "..",
        "..",
        "node_modules",
        "@posthog",
        "agent",
        "dist",
        "templates",
      ),
    ];

    const resolvedDir = candidateDirs.find((dir) => existsSync(dir));

    if (!resolvedDir) {
      logger.error("Could not find templates directory.");
      logger.error(`Current file: ${__filename}`);
      logger.error(`Current dir: ${__dirname}`);
      logger.error(
        `Tried: ${candidateDirs.map((d) => `\n  - ${d} (exists: ${existsSync(d)})`).join("")}`,
      );
    }

    this.templatesDir = resolvedDir ?? candidateDirs[0];
  }

  private async loadTemplate(templateName: string): Promise<string> {
    try {
      const templatePath = join(this.templatesDir, templateName);
      return await fs.readFile(templatePath, "utf8");
    } catch (error) {
      throw new Error(
        `Failed to load template ${templateName} from ${this.templatesDir}: ${error}`,
      );
    }
  }

  private substituteVariables(
    template: string,
    variables: TemplateVariables,
  ): string {
    let result = template;

    for (const [key, value] of Object.entries(variables)) {
      if (value !== undefined) {
        const placeholder = new RegExp(`{{${key}}}`, "g");
        result = result.replace(placeholder, value);
      }
    }

    result = result.replace(/{{[^}]+}}/g, "[PLACEHOLDER]");

    return result;
  }

  async generatePlan(variables: TemplateVariables): Promise<string> {
    const template = await this.loadTemplate("plan-template.md");
    return this.substituteVariables(template, {
      ...variables,
      date: variables.date || new Date().toISOString().split("T")[0],
    });
  }

  async generateCustomFile(
    templateName: string,
    variables: TemplateVariables,
  ): Promise<string> {
    const template = await this.loadTemplate(templateName);
    return this.substituteVariables(template, {
      ...variables,
      date: variables.date || new Date().toISOString().split("T")[0],
    });
  }

  async createTaskStructure(
    taskId: string,
    taskTitle: string,
    options?: {
      includePlan?: boolean;
      additionalFiles?: Array<{
        name: string;
        template?: string;
        content?: string;
      }>;
    },
  ): Promise<
    Array<{
      name: string;
      content: string;
      type: "plan" | "context" | "reference" | "output";
    }>
  > {
    const files: Array<{
      name: string;
      content: string;
      type: "plan" | "context" | "reference" | "output";
    }> = [];

    const variables: TemplateVariables = {
      task_id: taskId,
      task_title: taskTitle,
      date: new Date().toISOString().split("T")[0],
    };

    // Generate plan file if requested
    if (options?.includePlan !== false) {
      const planContent = await this.generatePlan(variables);
      files.push({
        name: "plan.md",
        content: planContent,
        type: "plan",
      });
    }

    if (options?.additionalFiles) {
      for (const file of options.additionalFiles) {
        let content: string;

        if (file.template) {
          content = await this.generateCustomFile(file.template, variables);
        } else if (file.content) {
          content = this.substituteVariables(file.content, variables);
        } else {
          content = `# ${file.name}\n\nPlaceholder content for ${file.name}`;
        }

        files.push({
          name: file.name,
          content,
          type: file.name.includes("context") ? "context" : "reference",
        });
      }
    }

    return files;
  }

  generatePostHogReadme(): string {
    return `# PostHog Task Files

This directory contains task-related files generated by the PostHog Agent.

## Structure

Each task has its own subdirectory: \`.posthog/{task-id}/\`

### Common Files

- **plan.md** - Implementation plan generated during planning phase
- **Supporting files** - Any additional files added for task context
- **artifacts/** - Generated files, outputs, and temporary artifacts

### Usage

These files are:
- Version controlled alongside your code
- Used by the PostHog Agent for context
- Available for review in pull requests
- Organized by task ID for easy reference

### Gitignore

Customize \`.posthog/.gitignore\` to control which files are committed:
- Include plans and documentation by default
- Exclude temporary files and sensitive data
- Customize based on your team's needs

---

*Generated by PostHog Agent*
`;
  }
}
