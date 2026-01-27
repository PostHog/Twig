> [!IMPORTANT]
> Twig is pre-alpha and not production-ready. Interested? Email jonathan@posthog.com


# PostHog Twig Monorepo

## Documentation

| File | Description |
|------|-------------|
| [README.md](./README.md) | This file - monorepo overview, setup, and configuration |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Detailed implementation patterns (DI, tRPC, state management, events) |
| [CLAUDE.md](./CLAUDE.md) | Development guide for Claude Code / AI assistants - code style, patterns, testing |
| [UPDATES.md](./UPDATES.md) | Release versioning and git tagging guide |
| [apps/twig/README.md](./apps/twig/README.md) | Twig desktop app - build, sign, notarize, keyboard shortcuts |
| [apps/mobile/README.md](./apps/mobile/README.md) | PostHog mobile app - Expo, EAS builds, TestFlight |
| [apps/cli/README.md](./apps/cli/README.md) | `arr` CLI - stacked PR management with Jujutsu |

This is the monorepo for PostHog's Twig apps and the agent framework that powers them.

## Projects

- **[apps/twig](./apps/twig)** - Twig desktop application (Electron)
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
# Run both agent (watch mode) and twig app in parallel
pnpm dev

# Or run them separately:
pnpm dev:agent  # Run agent in watch mode
pnpm dev:twig   # Run twig app
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

### Utility Scripts

Scripts in `scripts/` for development and debugging:

| Script | Description |
|--------|-------------|
| `scripts/clean-twig-macos.sh` | Remove all Twig app data from macOS (caches, preferences, logs, saved state). Use `--app` flag to also delete Twig.app from /Applications. |
| `scripts/test-access-token.js` | Validate a PostHog OAuth access token by testing API endpoints. Usage: `node scripts/test-access-token.js <token> <project_id> [region]` |

## Project Structure

```
twig-monorepo/
├── apps/
│   ├── twig/          # Electron desktop app
│   └── mobile/         # React Native mobile app (Expo)
├── packages/
│   └── agent/          # Agent framework
├── pnpm-workspace.yaml # Workspace configuration
└── package.json        # Root package.json
```

## Workspace Configuration (twig.json)

Twig supports per-repository configuration through a `twig.json` file (or legacy `array.json`). This lets you define scripts that run automatically when workspaces are created or destroyed.

### File Locations

Twig searches for configuration in this order (first match wins):

1. `.twig/{workspace-name}/twig.json` - Workspace-specific config (new)
2. `.twig/{workspace-name}/array.json` - Workspace-specific config (legacy)
3. `.array/{workspace-name}/array.json` - Workspace-specific config (legacy location)
4. `twig.json` - Repository root config (new)
5. `array.json` - Repository root config (legacy)

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

Twig automatically sets environment variables in all workspace terminals and scripts. These are available in `init`, `start`, and `destroy` scripts, as well as any terminal sessions opened within a workspace.

| Variable | Description | Example |
|----------|-------------|---------|
| `TWIG_WORKSPACE_NAME` | Worktree name, or folder name in root mode | `my-feature-branch` |
| `TWIG_WORKSPACE_PATH` | Absolute path to the workspace | `/Users/dev/.twig/worktrees/repo/my-feature` |
| `TWIG_ROOT_PATH` | Absolute path to the repository root | `/Users/dev/repos/my-project` |
| `TWIG_DEFAULT_BRANCH` | Default branch detected from git | `main` |
| `TWIG_WORKSPACE_BRANCH` | Initial branch when workspace was created | `twig/my-feature` |
| `TWIG_WORKSPACE_PORTS` | Comma-separated list of allocated ports | `50000,50001,...,50019` |
| `TWIG_WORKSPACE_PORTS_RANGE` | Number of ports allocated | `20` |
| `TWIG_WORKSPACE_PORTS_START` | First port in the range | `50000` |
| `TWIG_WORKSPACE_PORTS_END` | Last port in the range | `50019` |

Note: `TWIG_WORKSPACE_BRANCH` reflects the branch at workspace creation time. If you or the agent checks out a different branch, this variable will still show the original branch name.

### Port Allocation

Each workspace is assigned a unique range of 20 ports starting from port 50000. The allocation is deterministic based on the task ID, so the same workspace always receives the same ports across restarts.

### Usage Examples

Use ports in your start scripts:
```json
{
  "scripts": {
    "start": "npm run dev -- --port $TWIG_WORKSPACE_PORTS_START"
  }
}
```

Reference the workspace path:
```bash
echo "Working in: $TWIG_WORKSPACE_NAME"
echo "Root repo: $TWIG_ROOT_PATH"
```

## Troubleshooting

### Electron failed to install correctly

If you see this error when running `pnpm dev`:

```
Error: Electron failed to install correctly, please delete node_modules/electron and try installing again
```

The electron binary didn't download during install. Fix it by running the install script manually:

```bash
cd node_modules/electron && node install.js
```

Or nuke it and reinstall:

```bash
rm -rf node_modules/electron && pnpm install && cd node_modules/electron && node install.js
```

### Native module crash (libc++abi / Napi::Error)

If the app crashes with something like:

```
libc++abi: terminating due to uncaught exception of type Napi::Error
```

Native modules (like node-pty) need to be rebuilt for your Electron version:

```bash
pnpm --filter twig exec electron-rebuild
```
