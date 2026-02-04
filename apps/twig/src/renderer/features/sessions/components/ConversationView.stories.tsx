import type { SessionNotification } from "@agentclientprotocol/sdk";
import {
  toolInfoFromToolUse,
  toolUpdateFromToolResult,
} from "@posthog/agent/adapters/claude/conversion/tool-use-to-acp";
import type { AcpMessage } from "@shared/types/session-events";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConversationView } from "./ConversationView";

let timestamp = Date.now();
let messageId = 1;
let toolCallCounter = 1;

function resetCounters() {
  timestamp = Date.now();
  messageId = 1;
  toolCallCounter = 1;
}

function ts(): number {
  timestamp += 100;
  return timestamp;
}

function promptRequest(content: string): AcpMessage {
  const id = messageId++;
  return {
    type: "acp_message",
    ts: ts(),
    message: {
      jsonrpc: "2.0",
      id,
      method: "session/prompt",
      params: { prompt: [{ type: "text", text: content }] },
    },
  };
}

function promptResponse(id: number): AcpMessage {
  return {
    type: "acp_message",
    ts: ts(),
    message: {
      jsonrpc: "2.0",
      id,
      result: { stopReason: "end_turn" },
    },
  };
}

function sessionUpdate(update: SessionNotification["update"]): AcpMessage {
  return {
    type: "acp_message",
    ts: ts(),
    message: {
      method: "session/update",
      params: { update },
    },
  };
}

function agentMessage(text: string): AcpMessage {
  return sessionUpdate({
    sessionUpdate: "agent_message_chunk",
    content: { type: "text", text },
  });
}

interface ToolCallOptions {
  status?: "pending" | "in_progress" | "completed" | "failed";
  result?: { content: unknown; is_error?: boolean };
  cachedFileContent?: Record<string, string>;
}

function toolCall(
  toolName: string,
  toolInput: Record<string, unknown>,
  options: ToolCallOptions = {},
): AcpMessage {
  const { status = "completed", result, cachedFileContent = {} } = options;
  const toolCallId = `tool-${toolCallCounter++}`;

  const info = toolInfoFromToolUse(
    { name: toolName, input: toolInput },
    cachedFileContent,
  );

  let content = info.content;
  if (result && status === "completed") {
    const update = toolUpdateFromToolResult(
      { tool_use_id: toolCallId, ...result } as Parameters<
        typeof toolUpdateFromToolResult
      >[0],
      { name: toolName, input: toolInput },
    );
    if (update.content) {
      content = [...(content || []), ...update.content];
    }
  }

  return sessionUpdate({
    sessionUpdate: "tool_call",
    toolCallId,
    title: info.title,
    kind: info.kind,
    status,
    content,
    locations: info.locations,
    rawInput: toolInput,
  } as SessionNotification["update"]);
}

function buildAllToolCallsConversation(): AcpMessage[] {
  resetCounters();
  const events: AcpMessage[] = [];

  events.push(promptRequest("Help me understand this codebase"));
  events.push(
    agentMessage(
      "I'll explore the codebase to understand its structure. Let me start by reading some key files.\n\n",
    ),
  );

  events.push(
    toolCall(
      "Read",
      { file_path: "/Users/jonathan/dev/twig/package.json" },
      {
        result: {
          content: [
            {
              type: "text",
              text: `{
  "name": "twig-monorepo",
  "version": "1.0.0",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "test": "turbo test",
    "lint": "biome check --write"
  }
}`,
            },
          ],
        },
      },
    ),
  );

  events.push(
    toolCall(
      "Grep",
      { pattern: "export function", path: "src/" },
      {
        result: {
          content: [
            {
              type: "text",
              text: `src/utils/helpers.ts:5: export function formatDate(date: Date): string {
src/utils/helpers.ts:9: export function capitalize(str: string): string {
src/utils/helpers.ts:13: export function debounce<T>(fn: T, delay: number): T {
src/components/Button.tsx:8: export function Button({ children, onClick }: ButtonProps) {
src/hooks/useAuth.ts:12: export function useAuth() {`,
            },
          ],
        },
      },
    ),
  );

  events.push(
    agentMessage(
      "Found some utility functions. Let me make an edit to improve the implementation.\n\n",
    ),
  );

  const oldFileContent = `export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}`;

  events.push(
    toolCall(
      "Edit",
      {
        file_path: "src/utils/helpers.ts",
        old_string: `export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}`,
        new_string: `export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return \`\${year}-\${month}-\${day}\`;
}`,
      },
      {
        cachedFileContent: { "src/utils/helpers.ts": oldFileContent },
      },
    ),
  );

  events.push(
    agentMessage("Now let me run the tests to make sure everything works.\n\n"),
  );

  events.push(
    toolCall(
      "Bash",
      { command: "pnpm test", description: "Run tests" },
      {
        result: {
          content: [
            {
              type: "text",
              text: `> twig@1.0.0 test
> vitest run

 ✓ src/utils/helpers.test.ts (3 tests) 12ms
 ✓ src/components/Button.test.ts (5 tests) 45ms
 ✓ src/hooks/useAuth.test.ts (4 tests) 23ms

 Test Files  3 passed (3)
      Tests  12 passed (12)
   Start at  14:23:45
   Duration  892ms`,
            },
          ],
        },
      },
    ),
  );

  events.push(
    agentMessage("Tests pass! Let me also check the API documentation.\n\n"),
  );

  events.push(
    toolCall(
      "WebFetch",
      {
        url: "https://api.example.com/docs",
        prompt: "Get API documentation for reference",
      },
      {
        result: {
          content: [
            {
              type: "text",
              text: `# API Documentation

## Authentication
All endpoints require Bearer token authentication.

## Endpoints
- GET /users - List all users
- POST /users - Create a new user
- GET /users/:id - Get user by ID`,
            },
          ],
        },
      },
    ),
  );

  events.push(
    agentMessage(
      "Let me think about the best approach to implement the new feature...\n\n",
    ),
  );

  events.push(
    toolCall(
      "Task",
      {
        description: "Analyze codebase architecture",
        prompt:
          "Explore the codebase structure and identify patterns for adding new features",
      },
      {
        result: {
          content: [
            {
              type: "text",
              text: `Based on my analysis:

1. The codebase follows a monorepo structure
2. Uses TypeScript with strict mode
3. Has good test coverage
4. Follows feature-based folder organization

Recommendation: Add the new feature in a dedicated feature folder with its own components, hooks, and tests.`,
            },
          ],
        },
      },
    ),
  );

  events.push(agentMessage("Now creating a new file for the feature.\n\n"));

  events.push(
    toolCall("Write", {
      file_path: "src/features/analytics/index.ts",
      content: `export interface AnalyticsEvent {
  name: string;
  properties?: Record<string, unknown>;
  timestamp: Date;
}

export function trackEvent(event: AnalyticsEvent): void {
  console.log("[Analytics]", event.name, event.properties);
}

export function useAnalytics() {
  return {
    track: (name: string, properties?: Record<string, unknown>) => {
      trackEvent({ name, properties, timestamp: new Date() });
    },
  };
}
`,
    }),
  );

  events.push(
    agentMessage(
      "I've created the analytics module. The codebase is well-structured with:\n\n- **Monorepo setup** using pnpm workspaces\n- **TypeScript** with strict type checking\n- **Feature-based architecture** for scalability\n- **Good test coverage** across all packages\n\nLet me know if you'd like me to explain any specific part in more detail!",
    ),
  );

  events.push(promptResponse(1));

  events.push(promptRequest("Search the web for React best practices"));

  events.push(
    agentMessage("I'll search for the latest React best practices.\n\n"),
  );

  events.push(
    toolCall(
      "WebSearch",
      { query: "React hooks best practices 2024" },
      {
        result: {
          content: [
            {
              type: "text",
              text: `Found 5 results:

1. React Hooks Best Practices - React Blog
   https://react.dev/learn/hooks-best-practices

2. Top 10 React Hook Patterns - Dev.to
   https://dev.to/hooks-patterns

3. Custom Hooks Guide - Kent C. Dodds
   https://kentcdodds.com/custom-hooks`,
            },
          ],
        },
      },
    ),
  );

  events.push(
    agentMessage(
      "Here are some great resources on React best practices. The key points are:\n\n1. Keep hooks at the top level\n2. Use custom hooks for reusable logic\n3. Memoize expensive computations",
    ),
  );

  events.push(promptResponse(2));

  events.push(promptRequest("Find all TypeScript files in the project"));

  events.push(agentMessage("I'll search for all TypeScript files.\n\n"));

  events.push(
    toolCall(
      "Glob",
      { pattern: "**/*.ts", path: "src/" },
      {
        result: {
          content: [
            {
              type: "text",
              text: `src/index.ts
src/utils/helpers.ts
src/utils/logger.ts
src/components/Button.ts
src/hooks/useAuth.ts
src/features/analytics/index.ts`,
            },
          ],
        },
      },
    ),
  );

  events.push(agentMessage("Found 6 TypeScript files in the src directory."));

  events.push(promptResponse(3));

  return events;
}

const meta: Meta<typeof ConversationView> = {
  title: "Features/Sessions/ConversationView",
  component: ConversationView,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div style={{ height: "90vh", display: "flex", flexDirection: "column" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ConversationView>;

export const AllToolCalls: Story = {
  args: {
    events: buildAllToolCallsConversation(),
    isPromptPending: false,
    repoPath: "/Users/jonathan/dev/twig",
  },
};

export const WithPendingPrompt: Story = {
  args: {
    events: (() => {
      const events = buildAllToolCallsConversation();
      events.push(promptRequest("What else can you help me with?"));
      events.push(
        agentMessage(
          "I can help you with many things! Let me search for...\n\n",
        ),
      );
      events.push(
        toolCall("Grep", { pattern: "TODO" }, { status: "in_progress" }),
      );
      return events;
    })(),
    isPromptPending: true,
    promptStartedAt: Date.now() - 5000,
    repoPath: "/Users/jonathan/dev/twig",
  },
};

export const Empty: Story = {
  args: {
    events: [],
    isPromptPending: false,
  },
};

export const SingleTurn: Story = {
  args: {
    events: (() => {
      resetCounters();
      const events: AcpMessage[] = [];

      events.push(promptRequest("Hello!"));
      events.push(
        agentMessage(
          "Hello! I'm ready to help you with your codebase. What would you like to do?",
        ),
      );
      events.push(promptResponse(1));

      return events;
    })(),
    isPromptPending: false,
  },
};

export const LongConversation: Story = {
  args: {
    events: (() => {
      resetCounters();
      const events: AcpMessage[] = [];

      for (let i = 0; i < 10; i++) {
        events.push(
          promptRequest(`Question ${i + 1}: How does feature ${i + 1} work?`),
        );
        events.push(
          agentMessage(
            `Feature ${i + 1} works by using a combination of React hooks and context providers. Here's a brief overview:\n\n`,
          ),
        );
        events.push(
          toolCall(
            "Read",
            { file_path: `src/features/feature${i + 1}/index.ts` },
            {
              result: {
                content: [
                  {
                    type: "text",
                    text: `export function useFeature${i + 1}() {
  const [state, setState] = useState(null);

  useEffect(() => {
    loadFeature${i + 1}Data().then(setState);
  }, []);

  return { state, refresh: () => loadFeature${i + 1}Data().then(setState) };
}`,
                  },
                ],
              },
            },
          ),
        );
        events.push(
          agentMessage(
            `The feature uses a custom hook pattern with useState and useEffect for data loading. Would you like me to explain more?\n\n`,
          ),
        );
        events.push(promptResponse(i + 1));
      }

      return events;
    })(),
    isPromptPending: false,
    repoPath: "/Users/jonathan/dev/twig",
  },
};
