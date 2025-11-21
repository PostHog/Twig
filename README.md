# PostHog Array Monorepo

This is the monorepo for PostHog's Array desktop task manager and the agent framework that powers it.

## Projects

- **[apps/array](./apps/array)** - The Array desktop application
- **[packages/agent](./packages/agent)** - The TypeScript agent framework

## Development

### Prerequisites

- Node.js 22+
- pnpm 9+

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