# PostHog - Array

The PostHog desktop task manager

## The Goal

Free product engineers from distractions so they can focus on what they love: building great features. By using agents to transform all data collected across PostHog’s products into actionable “tasks,” then exposing them with that context through a single interface, we can automate all the chores and save developers hours every day, giving them more time to ship.

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
