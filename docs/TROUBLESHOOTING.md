# Troubleshooting

## Black screen during development

If the app launches but renders a blank/black screen, it's almost always a stale Vite cache.

### Fix

```sh
pnpm clean
pnpm dev
```

This clears all Vite caches, Turbo caches, and build output across every package in the monorepo, then starts fresh.

### Why this happens

Vite caches pre-bundled dependencies in `.vite/` and `node_modules/.vite/`. When dependencies change (e.g. after switching branches, updating packages, or modifying workspace packages), the cached bundles can become stale. The Electron renderer loads the old cached modules which fail silently, resulting in a black screen.

## Electron failed to install correctly

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

## Native module crash (libc++abi / Napi::Error)

If the app crashes with something like:

```
libc++abi: terminating due to uncaught exception of type Napi::Error
```

Native modules (like node-pty) need to be rebuilt for your Electron version:

```bash
pnpm --filter twig exec electron-rebuild
```

## `pnpm i` shows "Packages: -198"

You might see something like this every time you run `pnpm install`:

```
Packages: -198
```

This is cosmetic noise — nothing is broken. It's caused by `node-linker=hoisted` in `.npmrc`, which gives us a flat `node_modules` layout (required for Electron). With hoisted mode, pnpm reorganizes the flat layout on each install and reports the churn as packages added/removed. The packages aren't actually disappearing. Safe to ignore.
