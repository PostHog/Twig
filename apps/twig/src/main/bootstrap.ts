/**
 * Bootstrap entry point - sets userData path before any service initialization.
 *
 * This MUST be the entry point for both dev and prod builds. It ensures the
 * userData path is set BEFORE any imports that might trigger electron-store
 * instantiation (which calls app.getPath('userData') in their constructors).
 *
 */
import { existsSync, renameSync } from "node:fs";
import path from "node:path";
import { app } from "electron";

const isDev = !app.isPackaged;

// Set different app names for separate single-instance locks
const legacyAppName = isDev ? "array-dev" : "Array";
const appName = isDev ? "twig-dev" : "Twig";
app.setName(isDev ? "Twig (Development)" : "Twig");

// Migrate userData from legacy location if needed
const appDataPath = app.getPath("appData");
const legacyUserDataPath = path.join(appDataPath, "@posthog", legacyAppName);
const userDataPath = path.join(appDataPath, "@posthog", appName);

if (existsSync(legacyUserDataPath) && !existsSync(userDataPath)) {
  try {
    renameSync(legacyUserDataPath, userDataPath);
  } catch {
    // If migration fails, continue with new path
  }
}

app.setPath("userData", userDataPath);

// Now dynamically import the rest of the application
// Dynamic import ensures the path is set BEFORE index.js is evaluated
// Static imports are hoisted and would run before our setPath() call
import("./index.js");
