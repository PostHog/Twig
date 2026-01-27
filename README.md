> [!IMPORTANT]
> Twig is pre-alpha and not production-ready. Interested? Email jonathan@posthog.com


# PostHog Twig Monorepo

This is the monorepo for PostHog's Twig apps and the agent framework that powers them.

## Projects

- **[apps/twig](./apps/twig)** - Twig desktop application (Electron)
- **[apps/mobile](./apps/mobile)** - PostHog mobile app (React Native / Expo)
- **[packages/agent](./packages/agent)** - The TypeScript agent framework

## Documentation

| File | Description |
|------|-------------|
| [README.md](./README.md) | This file - monorepo overview, setup, and configuration |
| [CLAUDE.md](./CLAUDE.md) | Development guide for Claude Code / AI assistants - code style, patterns, testing |
| [UPDATES.md](./UPDATES.md) | Release versioning and git tagging guide |
| [apps/twig/README.md](./apps/twig/README.md) | Twig desktop app setup, distribution, and workspace configuration |
| [apps/twig/ARCHITECTURE.md](./apps/twig/ARCHITECTURE.md) | Implementation patterns - DI, tRPC, state management, events |
| [apps/mobile/README.md](./apps/mobile/README.md) | PostHog mobile app - Expo, EAS builds, TestFlight |
| [apps/cli/README.md](./apps/cli/README.md) | `arr` CLI - stacked PR management with Jujutsu |

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

# Copy environment config
cp .env.example .env
```

### Running in Development

```bash
# Run both agent (watch mode) and twig app in parallel
pnpm dev

# Or run them separately:
pnpm dev:agent  # Run agent in watch mode
pnpm dev:twig   # Run twig app
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
│   ├── twig/           # Electron desktop app
│   └── mobile/         # React Native mobile app (Expo)
├── packages/
│   └── agent/          # Agent framework
├── pnpm-workspace.yaml # Workspace configuration
└── package.json        # Root package.json
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

## Acknowledgments

Built with love by the PostHog team.

## Roadmap

Stay tuned for upcoming features and improvements.

## FAQ

Check the issues page for common questions and answers.
