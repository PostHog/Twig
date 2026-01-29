/**
 * Bootstrap entry point - sets userData path before any service initialization.
 *
 * This MUST be the entry point for both dev and prod builds. It ensures the
 * userData path is set BEFORE any imports that might trigger electron-store
 * instantiation (which calls app.getPath('userData') in their constructors).
 *
 */

import dns from "node:dns";
import path from "node:path";
import { app } from "electron";
import { fixPath } from "./lib/fixPath.js";

const isDev = !app.isPackaged;

// Set app name for single-instance lock, crashReporter, etc
const appName = isDev ? "twig-dev" : "Twig";
app.setName(isDev ? "Twig (Development)" : "Twig");

// Set userData path for @posthog/twig
const appDataPath = app.getPath("appData");
const userDataPath = path.join(appDataPath, "@posthog", appName);
app.setPath("userData", userDataPath);

// Force IPv4 resolution when "localhost" is used so the agent hits 127.0.0.1
// instead of ::1. This matches how the renderer already reaches the PostHog API.
dns.setDefaultResultOrder("ipv4first");

// Call fixPath early to ensure PATH is correct for any child processes
fixPath();

// Now dynamically import the rest of the application
// Dynamic import ensures the path is set BEFORE index.js is evaluated
// Static imports are hoisted and would run before our setPath() call
import("./index.js");
