#!/usr/bin/env node

import { createWriteStream, existsSync, mkdirSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { extract } from "tar";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));

const CODEX_ACP_VERSION = "0.9.1";
const GITHUB_RELEASE_BASE = `https://github.com/zed-industries/codex-acp/releases/download/v${CODEX_ACP_VERSION}`;

function getPlatformTarget() {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === "darwin") {
    return arch === "arm64"
      ? "aarch64-apple-darwin"
      : "x86_64-apple-darwin";
  }

  if (platform === "linux") {
    return arch === "arm64"
      ? "aarch64-unknown-linux-gnu"
      : "x86_64-unknown-linux-gnu";
  }

  if (platform === "win32") {
    return arch === "arm64"
      ? "aarch64-pc-windows-msvc"
      : "x86_64-pc-windows-msvc";
  }

  throw new Error(`Unsupported platform: ${platform}-${arch}`);
}

function getDownloadUrl(target) {
  const ext = target.includes("windows") ? "zip" : "tar.gz";
  return `${GITHUB_RELEASE_BASE}/codex-acp-${CODEX_ACP_VERSION}-${target}.${ext}`;
}

function getBinaryName() {
  return process.platform === "win32" ? "codex-acp.exe" : "codex-acp";
}

async function downloadFile(url, destPath) {
  console.log(`Downloading ${url}...`);

  const response = await fetch(url, { redirect: "follow" });

  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
  }

  const fileStream = createWriteStream(destPath);
  await pipeline(response.body, fileStream);

  console.log(`Downloaded to ${destPath}`);
}

async function extractTarGz(archivePath, destDir) {
  console.log(`Extracting ${archivePath} to ${destDir}...`);

  await extract({
    file: archivePath,
    cwd: destDir,
  });

  console.log("Extraction complete");
}

async function extractZip(archivePath, destDir) {
  const { default: AdmZip } = await import("adm-zip");
  console.log(`Extracting ${archivePath} to ${destDir}...`);

  const zip = new AdmZip(archivePath);
  zip.extractAllTo(destDir, true);

  console.log("Extraction complete");
}

async function main() {
  const destDir = join(__dirname, "..", "resources", "codex-acp");
  const binaryName = getBinaryName();
  const binaryPath = join(destDir, binaryName);

  if (existsSync(binaryPath)) {
    console.log(`codex-acp binary already exists at ${binaryPath}`);
    return;
  }

  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }

  const target = getPlatformTarget();
  const url = getDownloadUrl(target);
  const isZip = url.endsWith(".zip");
  const archivePath = join(destDir, isZip ? "codex-acp.zip" : "codex-acp.tar.gz");

  await downloadFile(url, archivePath);

  if (isZip) {
    await extractZip(archivePath, destDir);
  } else {
    await extractTarGz(archivePath, destDir);
  }

  if (existsSync(binaryPath)) {
    if (process.platform !== "win32") {
      chmodSync(binaryPath, 0o755);
    }

    if (process.platform === "darwin") {
      try {
        execSync(`xattr -cr "${binaryPath}"`, { stdio: "inherit" });
        console.log("Cleared extended attributes");
      } catch {
        console.log("No extended attributes to clear");
      }

      try {
        execSync(`codesign --force --sign - "${binaryPath}"`, { stdio: "inherit" });
        console.log("Ad-hoc signed binary for macOS");
      } catch (err) {
        console.warn("Failed to ad-hoc sign binary:", err.message);
      }
    }

    console.log(`codex-acp binary ready at ${binaryPath}`);
  } else {
    console.error(`Binary not found after extraction. Expected: ${binaryPath}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Failed to download codex-acp:", err);
  process.exit(1);
});
