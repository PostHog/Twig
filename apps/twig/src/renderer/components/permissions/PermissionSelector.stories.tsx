import {
  buildPermissionOptions,
  buildQuestionOptions,
  buildQuestionToolCallData,
  buildToolCallData,
  type QuestionItem,
} from "@posthog/agent/adapters/claude/permission-options";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PermissionSelector } from "./PermissionSelector";

const meta: Meta<typeof PermissionSelector> = {
  title: "Components/Permissions/PermissionSelector",
  component: PermissionSelector,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    onSelect: { action: "selected" },
    onCancel: { action: "cancelled" },
  },
};

export default meta;
type Story = StoryObj<typeof PermissionSelector>;

const CWD = "/Users/jonathan/dev/twig";

const bashInput = { command: "pnpm add -D vitest" };
export const Execute: Story = {
  args: {
    toolCall: buildToolCallData("Bash", bashInput),
    options: buildPermissionOptions("Bash", bashInput, CWD),
  },
};

const editInput = {
  file_path: "src/utils/helpers.ts",
  old_string: `function oldName() {
  const result = calculate();
  return result;
}`,
  new_string: `function newName() {
  const result = calculate();
  console.log("Result:", result);
  return result;
}`,
};
export const Edit: Story = {
  args: {
    toolCall: buildToolCallData("Edit", editInput),
    options: buildPermissionOptions("Edit", editInput),
  },
};

const writeInput = {
  file_path: "src/utils/logger.ts",
  content: `type LogLevel = "debug" | "info" | "warn" | "error";

export function log(level: LogLevel, message: string, data?: unknown): void {
  const timestamp = new Date().toISOString();
  const prefix = \`[\${timestamp}] [\${level.toUpperCase()}]\`;
  console[level](\`\${prefix} \${message}\`, data ?? "");
}

export const logger = {
  debug: (msg: string, data?: unknown) => log("debug", msg, data),
  info: (msg: string, data?: unknown) => log("info", msg, data),
  warn: (msg: string, data?: unknown) => log("warn", msg, data),
  error: (msg: string, data?: unknown) => log("error", msg, data),
};
`,
};
export const CreateNewFile: Story = {
  args: {
    toolCall: buildToolCallData("Write", writeInput),
    options: buildPermissionOptions("Write", writeInput),
  },
};

const largeEditInput = {
  file_path: "src/services/api-client.ts",
  old_string: `import { HttpClient } from "./http";
import { Config } from "../config";

export class ApiClient {
  private client: HttpClient;
  private baseUrl: string;

  constructor(config: Config) {
    this.client = new HttpClient();
    this.baseUrl = config.apiUrl;
  }

  async get<T>(path: string): Promise<T> {
    return this.client.get(\`\${this.baseUrl}\${path}\`);
  }

  async post<T>(path: string, data: unknown): Promise<T> {
    return this.client.post(\`\${this.baseUrl}\${path}\`, data);
  }

  async put<T>(path: string, data: unknown): Promise<T> {
    return this.client.put(\`\${this.baseUrl}\${path}\`, data);
  }

  async delete(path: string): Promise<void> {
    return this.client.delete(\`\${this.baseUrl}\${path}\`);
  }
}`,
  new_string: `import { HttpClient, RequestOptions, RetryConfig } from "./http";
import { Config } from "../config";
import { Logger } from "../utils/logger";

export interface ApiClientOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

const DEFAULT_OPTIONS: ApiClientOptions = {
  timeout: 30000,
  retries: 3,
  retryDelay: 1000,
};

export class ApiClient {
  private client: HttpClient;
  private baseUrl: string;
  private logger: Logger;
  private options: ApiClientOptions;

  constructor(config: Config, options: ApiClientOptions = {}) {
    this.client = new HttpClient();
    this.baseUrl = config.apiUrl;
    this.logger = new Logger("ApiClient");
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  private getRequestOptions(): RequestOptions {
    return {
      timeout: this.options.timeout,
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": crypto.randomUUID(),
      },
    };
  }

  private getRetryConfig(): RetryConfig {
    return {
      maxRetries: this.options.retries ?? 3,
      delay: this.options.retryDelay ?? 1000,
      shouldRetry: (error: Error) => {
        return error.message.includes("ETIMEDOUT") ||
               error.message.includes("ECONNRESET");
      },
    };
  }

  async get<T>(path: string): Promise<T> {
    this.logger.debug(\`GET \${path}\`);
    const response = await this.client.get<T>(
      \`\${this.baseUrl}\${path}\`,
      this.getRequestOptions(),
      this.getRetryConfig()
    );
    this.logger.debug(\`GET \${path} completed\`);
    return response;
  }

  async post<T>(path: string, data: unknown): Promise<T> {
    this.logger.debug(\`POST \${path}\`, { data });
    const response = await this.client.post<T>(
      \`\${this.baseUrl}\${path}\`,
      data,
      this.getRequestOptions(),
      this.getRetryConfig()
    );
    this.logger.debug(\`POST \${path} completed\`);
    return response;
  }

  async put<T>(path: string, data: unknown): Promise<T> {
    this.logger.debug(\`PUT \${path}\`, { data });
    const response = await this.client.put<T>(
      \`\${this.baseUrl}\${path}\`,
      data,
      this.getRequestOptions(),
      this.getRetryConfig()
    );
    this.logger.debug(\`PUT \${path} completed\`);
    return response;
  }

  async patch<T>(path: string, data: unknown): Promise<T> {
    this.logger.debug(\`PATCH \${path}\`, { data });
    const response = await this.client.patch<T>(
      \`\${this.baseUrl}\${path}\`,
      data,
      this.getRequestOptions(),
      this.getRetryConfig()
    );
    this.logger.debug(\`PATCH \${path} completed\`);
    return response;
  }

  async delete(path: string): Promise<void> {
    this.logger.debug(\`DELETE \${path}\`);
    await this.client.delete(
      \`\${this.baseUrl}\${path}\`,
      this.getRequestOptions(),
      this.getRetryConfig()
    );
    this.logger.debug(\`DELETE \${path} completed\`);
  }
}`,
};
export const LargeEdit: Story = {
  args: {
    toolCall: buildToolCallData("Edit", largeEditInput),
    options: buildPermissionOptions("Edit", largeEditInput),
  },
};

const largeWriteInput = {
  file_path: "src/components/DataTable.tsx",
  content: `import React, { useState, useMemo, useCallback } from "react";
import { Table, Thead, Tbody, Tr, Th, Td } from "./Table";
import { Pagination } from "./Pagination";
import { SearchInput } from "./SearchInput";
import { SortIcon } from "./icons/SortIcon";

export interface Column<T> {
  key: keyof T;
  label: string;
  sortable?: boolean;
  render?: (value: T[keyof T], row: T) => React.ReactNode;
  width?: string | number;
}

export interface DataTableProps<T extends Record<string, unknown>> {
  data: T[];
  columns: Column<T>[];
  pageSize?: number;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  loading?: boolean;
  onRowClick?: (row: T) => void;
}

type SortDirection = "asc" | "desc" | null;

interface SortState<T> {
  column: keyof T | null;
  direction: SortDirection;
}

export function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  pageSize = 10,
  searchable = false,
  searchPlaceholder = "Search...",
  emptyMessage = "No data available",
  loading = false,
  onRowClick,
}: DataTableProps<T>) {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortState, setSortState] = useState<SortState<T>>({
    column: null,
    direction: null,
  });

  const filteredData = useMemo(() => {
    if (!searchQuery) return data;

    const query = searchQuery.toLowerCase();
    return data.filter((row) =>
      columns.some((col) => {
        const value = row[col.key];
        if (value == null) return false;
        return String(value).toLowerCase().includes(query);
      })
    );
  }, [data, columns, searchQuery]);

  const sortedData = useMemo(() => {
    if (!sortState.column || !sortState.direction) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aVal = a[sortState.column!];
      const bVal = b[sortState.column!];

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sortState.direction === "asc" ? 1 : -1;
      if (bVal == null) return sortState.direction === "asc" ? -1 : 1;

      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortState.direction === "asc" ? comparison : -comparison;
    });
  }, [filteredData, sortState]);

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedData.length / pageSize);

  const handleSort = useCallback((column: keyof T) => {
    setSortState((prev) => {
      if (prev.column !== column) {
        return { column, direction: "asc" };
      }
      if (prev.direction === "asc") {
        return { column, direction: "desc" };
      }
      return { column: null, direction: null };
    });
  }, []);

  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  }, []);

  if (loading) {
    return (
      <div className="data-table-loading">
        <span>Loading...</span>
      </div>
    );
  }

  return (
    <div className="data-table">
      {searchable && (
        <div className="data-table-search">
          <SearchInput
            value={searchQuery}
            onChange={handleSearch}
            placeholder={searchPlaceholder}
          />
        </div>
      )}

      <Table>
        <Thead>
          <Tr>
            {columns.map((col) => (
              <Th
                key={String(col.key)}
                style={{ width: col.width }}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
                className={col.sortable ? "sortable" : ""}
              >
                {col.label}
                {col.sortable && (
                  <SortIcon
                    direction={
                      sortState.column === col.key ? sortState.direction : null
                    }
                  />
                )}
              </Th>
            ))}
          </Tr>
        </Thead>
        <Tbody>
          {paginatedData.length === 0 ? (
            <Tr>
              <Td colSpan={columns.length} className="empty-message">
                {emptyMessage}
              </Td>
            </Tr>
          ) : (
            paginatedData.map((row, index) => (
              <Tr
                key={index}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={onRowClick ? "clickable" : ""}
              >
                {columns.map((col) => (
                  <Td key={String(col.key)}>
                    {col.render
                      ? col.render(row[col.key], row)
                      : String(row[col.key] ?? "")}
                  </Td>
                ))}
              </Tr>
            ))
          )}
        </Tbody>
      </Table>

      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      )}
    </div>
  );
}
`,
};
export const LargeNewFile: Story = {
  args: {
    toolCall: buildToolCallData("Write", largeWriteInput),
    options: buildPermissionOptions("Write", largeWriteInput),
  },
};

const readInput = { file_path: "/Users/jonathan/dev/twig/.env" };
export const Read: Story = {
  args: {
    toolCall: buildToolCallData("Read", readInput),
    options: buildPermissionOptions("Read", readInput),
  },
};

const fetchInput = {
  url: "https://api.example.com/docs/authentication",
  prompt: "Extract the authentication requirements and API key format",
};
export const FetchUrl: Story = {
  args: {
    toolCall: buildToolCallData("WebFetch", fetchInput),
    options: buildPermissionOptions("WebFetch", fetchInput),
  },
};

const searchInput = { query: "react hooks best practices 2024" };
export const WebSearch: Story = {
  args: {
    toolCall: buildToolCallData("WebSearch", searchInput),
    options: buildPermissionOptions("WebSearch", searchInput),
  },
};

const grepInput = { pattern: "TODO" };
export const Search: Story = {
  args: {
    toolCall: buildToolCallData("Grep", grepInput),
    options: buildPermissionOptions("Grep", grepInput),
  },
};

const taskInput = { description: "Analyze codebase architecture" };
export const Think: Story = {
  args: {
    toolCall: buildToolCallData("Task", taskInput),
    options: buildPermissionOptions("Task", taskInput),
  },
};

export const Default: Story = {
  args: {
    toolCall: buildToolCallData("Unknown", {}),
    options: buildPermissionOptions("Unknown", {}),
  },
};

const singleQuestion: QuestionItem[] = [
  {
    question: "Which testing framework do you prefer?",
    header: "Testing Framework",
    options: [
      { label: "Vitest", description: "Fast, Vite-native" },
      { label: "Jest", description: "Popular, mature" },
      { label: "Mocha", description: "Flexible, configurable" },
    ],
  },
];

export const Question: Story = {
  args: {
    toolCall: buildQuestionToolCallData(singleQuestion),
    options: buildQuestionOptions(singleQuestion[0]),
  },
};

const multiStepQuestions: QuestionItem[] = [
  {
    header: "Framework",
    question: "Which frontend framework do you prefer?",
    options: [
      { label: "React", description: "Component-based UI library" },
      { label: "Vue", description: "Progressive framework" },
      { label: "Svelte", description: "Compiler-based" },
    ],
  },
  {
    header: "Package Manager",
    question: "What is your preferred package manager?",
    options: [
      { label: "pnpm", description: "Fast, disk efficient" },
      { label: "npm", description: "Default Node.js package manager" },
      { label: "yarn", description: "Fast, reliable" },
    ],
  },
  {
    header: "Testing",
    question: "Which testing framework do you use?",
    options: [
      { label: "Vitest", description: "Fast, Vite-native" },
      { label: "Jest", description: "Popular, mature" },
    ],
  },
];

export const QuestionMultiStep: Story = {
  args: {
    toolCall: buildQuestionToolCallData(multiStepQuestions),
    options: buildQuestionOptions(multiStepQuestions[0]),
  },
};

const multiSelectQuestion: QuestionItem[] = [
  {
    question: "Which features do you want to enable?",
    header: "Features",
    options: [
      { label: "Dark mode", description: "Enable dark theme" },
      { label: "Notifications", description: "Push notifications" },
      { label: "Analytics", description: "Usage tracking" },
      { label: "Auto-save", description: "Save changes automatically" },
    ],
    multiSelect: true,
  },
];

export const QuestionMultiSelect: Story = {
  args: {
    toolCall: buildQuestionToolCallData(multiSelectQuestion),
    options: buildQuestionOptions(multiSelectQuestion[0]),
  },
};
