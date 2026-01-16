> [!IMPORTANT]
> Array is pre-alpha and not production-ready. Interested? Email jonathan@posthog.com


# PostHog Array Monorepo

This is the monorepo for PostHog's Array apps and the agent framework that powers them.

## Projects

- **[apps/array](./apps/array)** - Array desktop application (Electron)
- **[apps/mobile](./apps/mobile)** - PostHog mobile app (React Native / Expo)
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

### Mobile App

```bash
# Install mobile dependencies
pnpm mobile:install

# Build and run on iOS simulator
pnpm mobile:run:ios

# Start development server (without rebuilding again)
pnpm mobile:start

# Submit to TestFlight
pnpm mobile:testflight
```

See [apps/mobile/README.md](./apps/mobile/README.md) for more details on developing the mobile app. 

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
│   ├── array/          # Electron desktop app
│   └── mobile/         # React Native mobile app (Expo)
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

## Workspace Environment Variables

Array automatically sets environment variables in all workspace terminals and scripts. These are available in `init`, `start`, and `destroy` scripts, as well as any terminal sessions opened within a workspace.

| Variable | Description | Example |
|----------|-------------|---------|
| `ARRAY_WORKSPACE_NAME` | Worktree name, or folder name in root mode | `my-feature-branch` |
| `ARRAY_WORKSPACE_PATH` | Absolute path to the workspace | `/Users/dev/.array/worktrees/repo/my-feature` |
| `ARRAY_ROOT_PATH` | Absolute path to the repository root | `/Users/dev/repos/my-project` |
| `ARRAY_DEFAULT_BRANCH` | Default branch detected from git | `main` |
| `ARRAY_WORKSPACE_BRANCH` | Initial branch when workspace was created | `array/my-feature` |
| `ARRAY_WORKSPACE_PORTS` | Comma-separated list of allocated ports | `50000,50001,...,50019` |
| `ARRAY_WORKSPACE_PORTS_RANGE` | Number of ports allocated | `20` |
| `ARRAY_WORKSPACE_PORTS_START` | First port in the range | `50000` |
| `ARRAY_WORKSPACE_PORTS_END` | Last port in the range | `50019` |

Note: `ARRAY_WORKSPACE_BRANCH` reflects the branch at workspace creation time. If you or the agent checks out a different branch, this variable will still show the original branch name.

### Port Allocation

Each workspace is assigned a unique range of 20 ports starting from port 50000. The allocation is deterministic based on the task ID, so the same workspace always receives the same ports across restarts.

### Usage Examples

Use ports in your start scripts:
```json
{
  "scripts": {
    "start": "npm run dev -- --port $ARRAY_WORKSPACE_PORTS_START"
  }
}
```

Reference the workspace path:
```bash
echo "Working in: $ARRAY_WORKSPACE_NAME"
echo "Root repo: $ARRAY_ROOT_PATH"
```
