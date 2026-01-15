const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("node:path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch monorepo root for changes
config.watchFolders = [monorepoRoot];

// Let Metro find modules in both locations
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// Force React to resolve from monorepo root
config.resolver.extraNodeModules = {
  react: path.resolve(monorepoRoot, "node_modules/react"),
};

module.exports = withNativeWind(config, { input: "./global.css" });
