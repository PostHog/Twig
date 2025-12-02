# PostHog Array Monorepo

This is the monorepo for PostHog's Array desktop task manager and the agent framework that powers it.

## Projects

- **[apps/array](./apps/array)** - The Array desktop application
- **[packages/agent](./packages/agent)** - The TypeScript agent framework

## Development

### Prerequisites

- Node.js 22+
- pnpm 10.23.0

### Setup

```bash
# Install pnpm if you haven't already
npm install -g pnpm

# Install dependencies for all packages
pnpm install

# Build the agent package
pnpm --filter agent build
```

### Running in Development

```bash
# Run both agent (watch mode) and array app in parallel
pnpm dev

# Or run them separately:
pnpm dev:agent   # Run agent in watch mode
pnpm dev:array   # Run array app
```

### Other Commands

```bash
# Build all packages
pnpm build

# Run type checking across all packages
pnpm typecheck

# Run linting across all packages
pnpm lint

# Run tests across all packages
pnpm test
```

## Project Structure

```
array-monorepo/
├── apps/
│   └── array/          # Electron desktop app
├── packages/
│   └── agent/          # Agent framework
├── pnpm-workspace.yaml # Workspace configuration
└── package.json        # Root package.json
```

## Workspace Configuration (array.json)

Array supports per-repository configuration through an `array.json` file. This lets you define scripts that run automatically when workspaces are created or destroyed.

### File Locations

Array searches for configuration in this order:

1. `.array/{workspace-name}/array.json` - Workspace-specific config
2. `array.json` - Repository root config

### Schema

```json
{
  "scripts": {
    "init": "npm install",
    "start": ["npm run server", "npm run client"],
    "destroy": "docker-compose down"
  }
}
```

| Script | When it runs | Behavior |
|--------|--------------|----------|
| `init` | Workspace creation | Runs first, fails fast (stops on error) |
| `start` | After init completes | Continues even if scripts fail |
| `destroy` | Workspace deletion | Runs silently before cleanup |

Each script can be a single command string or an array of commands. Commands run sequentially in dedicated terminal sessions.

### Examples

Install dependencies on workspace creation:
```json
{
  "scripts": {
    "init": "pnpm install"
  }
}
```

Start development servers:
```json
{
  "scripts": {
    "init": ["pnpm install", "pnpm run build"],
    "start": ["pnpm run dev", "pnpm run storybook"]
  }
}
```

Clean up Docker containers:
```json
{
  "scripts": {
    "destroy": "docker-compose down -v"
  }
}
```
